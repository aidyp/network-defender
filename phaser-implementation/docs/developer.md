# Developer guide

This is the developer-facing reference for the Cops and Robbers codebase: how it's laid out, how a game actually
runs end to end, and how to extend it — new maps, new move types, mutable edges, portals, whatever you're
building next.

If you just want to run the game, see the root `README.md`. This doc is for changing how it works.

## Contents

- [The shape of the game](#the-shape-of-the-game)
- [Project layout](#project-layout)
- [Architecture at a glance](#architecture-at-a-glance)
- [The WebSocket protocol](#the-websocket-protocol)
- [Game state management](#game-state-management)
- [Loading the game: full lifecycle](#loading-the-game-full-lifecycle)
- [The client rendering layer](#the-client-rendering-layer)
- [How to add a new map](#how-to-add-a-new-map)
- [How to modify the game itself](#how-to-modify-the-game-itself)
  - [New move types](#new-move-types)
  - [Letting players cut or draw edges](#letting-players-cut-or-draw-edges)
  - [Portals](#portals)
- [Known rough edges](#known-rough-edges)

## The shape of the game

Two players connect to the same game link. One is randomly assigned the **Cop**, the other the **Robber**; anyone
after that spectates. Both sides pick a move simultaneously each round — you don't see the other player's move
until you've committed your own — and the server resolves both moves at once. The Robber wins by reaching the
honey node; the Cop wins by landing on the Robber's node. It's a real-time, two-player, simultaneous-turn game
played on a small static graph.

## Project layout

```
phaser-implementation/
├── api/                        Server (Node/Express/socket.io, CommonJS)
│   ├── index.js                 HTTP routes + socket.io connection handling - the entry point
│   ├── components/
│   │   ├── gameManager.js       Owns every GameSession, keyed by short shareable game id
│   │   ├── gameSession.js       Authoritative state for ONE game: positions, turns, win logic
│   │   ├── teamAssigner.js      Random cop/rob assignment + release-on-leave for one session
│   │   └── teams.js             Team id constants shared by the above ('cop' / 'rob' / 'spectator')
│   └── maps/
│       ├── index.js             Map registry - resolves a map id to a map object
│       └── classic.js           The only map right now: an 11-node network
│
├── public/                     Everything served to the browser
│   ├── index.html               Landing page: "Create Game" button
│   ├── game.html                 The actual game page, mounted at /game/:id
│   ├── game-not-found.html       404 page for a dead/invalid game id
│   ├── css/style.css             Shared styling for both pages
│   └── js/
│       ├── create.js             Landing page logic (calls POST /api/games)
│       ├── game.js               Game page bootstrap: Phaser config + socket wiring only
│       └── scenes/
│           ├── gameController.js  The client-side state machine - most of the game logic lives here
│           ├── graphicsObjects.js MapGUI + the Phaser node/edge GameObjects
│           ├── teams.js           Client-side team → display name/colour lookup
│           ├── playerToken.js     Generates/reads the localStorage reconnection token
│           ├── playerBadge.js     "You are the Cop" pill (persistent identity indicator)
│           ├── statusLine.js      The line of text that changes every turn
│           ├── startButton.js     Start/Rematch button wrapper
│           ├── commitButton.js    Commit Move button wrapper
│           ├── eventsRouter.js    A Phaser EventEmitter used as an in-browser pub/sub bus
│           ├── renderConfig.js    Canvas size, colours, node/line sizes
│           └── player.js          Dead code - not imported anywhere, safe to ignore or delete
│
├── package.json
└── Dockerfile
```

Every one of the small `scenes/*.js` files does exactly one job. If you're adding something new, it almost
always belongs in a new small file rather than growing one of the existing ones.

## Architecture at a glance

- **Server is fully authoritative.** The client never decides whether a move is legal or who won — it proposes,
  the server validates and applies, the server broadcasts the result. This matters a lot if you're adding new
  mechanics: the validation and state mutation always belong in `GameSession`, never in `gameController.js`.
- **One `GameSession` per game**, holding that game's positions, pending moves, and player list. `GameManager`
  is just a `Map<gameId, GameSession>` with creation/lookup/cleanup on top. Nothing is shared between games.
- **Players are identified by a token, not a socket id.** Sockets are ephemeral (a page refresh gets you a new
  one); the token in `localStorage` is what the server actually tracks a player by, so a refresh can reclaim an
  in-progress seat. More on this in [Game state management](#game-state-management).
- **The client is a thin renderer over server state**, structured as one `GameController` (the state machine)
  driving a handful of single-purpose view components (`MapGUI`, `StatusLine`, `PlayerBadge`, `StartButton`,
  `CommitButton`) that each own one DOM/Phaser element and nothing else.
- **Two separate event systems, don't confuse them:**
  - `socket.io` events are the network protocol between browser and server (see below).
  - `eventsRouter` (`scenes/eventsRouter.js`) is a `Phaser.Events.EventEmitter` used purely in-browser, so
    `graphicsObjects.js` (which knows nothing about sockets) can tell `gameController.js` "a node got clicked"
    without a direct reference to it. `game.js`'s socket handlers translate every incoming network event into an
    `eventsRouter` event (e.g. `sync` → `server_sync`) - `GameController` only ever listens on `eventsRouter`,
    never on the socket directly.

## The WebSocket protocol

All game-specific events live under the room named by the game id (`socket.join(gameId)`); `io.to(gameId)`
broadcasts to everyone in the room, `socket.to(gameId)` broadcasts to everyone *except* the sender.

### Client → Server

| Event | Payload | When |
|---|---|---|
| `join_game` | `{ gameId, token }` | Once, right after the socket connects (see `game.js`) |
| `ready` | none | Player clicks Start / Rematch |
| `proposed_move` | `{ move: [from, to] }` | Player clicks Commit Move |

### Server → Client

| Event | Payload | Sent to |
|---|---|---|
| `sync` | `{ team, started, ready, map, positions, hasPendingMove }` | Only the (re)joining socket, right after `join_game` |
| `join_error` | a string message | Only the joining socket, instead of `sync`, if the game id is invalid |
| `startGame` | the map object (`{id, name, nodes, edges, positions, characters}`) at starting positions | Whole room, once both active players are ready |
| `updateGame` | `{ cop, rob, winner }` — `winner` is `'cop' \| 'rob' \| 'none'` | Whole room, whenever a round resolves |
| `opponent_ready` | `{ team }` | Room, excluding whoever just readied |
| `opponent_disconnected` | `{ team }` | Room, when a Cop/Robber (not a spectator) disconnects |
| `opponent_reconnected` | `{ team }` | Room, when a Cop/Robber reclaims their seat within the grace period |

`sync` is the important one to understand: it's sent on *every* successful join, whether that's the very first
time someone opens the link or a browser refresh mid-match. The client's `handle_sync` in `gameController.js`
is the single place that decides what to render based on it - see [Loading the game](#loading-the-game-full-lifecycle).

## Game state management

```
GameManager
  └─ games: Map<gameId, GameSession>

GameSession (one per game)
  ├─ map                  the static map object (nodes/edges/positions/characters) - never mutated
  ├─ playerPositions       { cop, rob }  - the live, authoritative positions
  ├─ pendingMoves           { cop?, rob? } - filled in as each side commits; cleared once both are in
  ├─ started                bool
  ├─ teamAssigner           TeamAssigner - hands out 'cop'/'rob' randomly, tracks what's free
  └─ players: { [token]: { team, ready, socketId, disconnectTimer } }
```

**Round resolution** (`GameSession.proposeMove`, `api/components/gameSession.js`): a move is `[from, to]`. It's
rejected outright (returns `null`, nothing broadcasts) unless:
1. The token belongs to an active player (not a spectator) with no move already pending this round.
2. `from` matches that player's *actual* current position, per the server — not whatever the client claims.
3. `to` is reachable from `from` via an edge on the map.

Once both `pendingMoves.cop` and `pendingMoves.rob` are filled, positions update, win conditions are checked
(Robber reaches the honey node → `winner: 'rob'`; both players land on the same node → `winner: 'cop'`), and the
`{cop, rob, winner}` result is returned for `api/index.js` to broadcast as `updateGame`. On a win, `resetRound()`
puts positions back to the map's starting characters and clears everyone's `ready` flag, ready for a rematch.

**Team assignment** (`TeamAssigner`): a session starts with `['cop', 'rob']` available. `assign()` picks one at
random and removes it from the pool; once both are taken, everyone else gets `'spectator'`. `release(team)` puts
a team back in the pool - called when an active player's seat is actually given up (see below), never for
spectators.

**Reconnection** (`connectPlayer` / `disconnectPlayer` / `_forget`, in `gameSession.js`): players are keyed by a
token, not a socket id, generated client-side and stored in `localStorage` scoped to the game id
(`scenes/playerToken.js`). On `disconnect`, an active player isn't removed immediately - their `socketId` is set
to `null` and a 30-second timer (`RECONNECT_GRACE_MS`) starts. If they reconnect with the same token before it
fires, `connectPlayer` clears the timer and hands back their exact team, ready state, and any pending move -
`_forget` (the actual removal + team release) never runs. If the timer *does* fire, the seat is released and, if
that was the last player left, `GameManager` removes the whole session (`onEmpty` callback threaded through the
constructor). Spectators skip the grace period entirely - `disconnectPlayer` forgets them straight away, since
there's no seat to protect.

This is why a page refresh mid-match works: the disconnect and the reconnect are two events close together on
the *same* token, and the grace period bridges the gap.

## Loading the game: full lifecycle

1. **`GET /`** serves `public/index.html` (static, via `express.static`). "Create Game" calls `POST /api/games`,
   which does `gameManager.create()` and returns `{ gameId }`. The page shows the shareable
   `/game/<id>` link.
2. **`GET /game/:gameId`** (`api/index.js`) checks `gameManager.get(id)`; 404s to `game-not-found.html` if it
   doesn't exist, otherwise serves `public/game.html`.
3. **`game.html` loads** `socket.io.js`, the Phaser CDN script, then `js/game.js` as an ES module.
4. **`game.js`** builds the Phaser game (`parent: 'phaser-parent'`, sized from `renderConfig.js`) and, in
   `create()`:
   - opens the socket (`io()`),
   - constructs one `GameController`,
   - wires every incoming socket event to an `eventsRouter` emit (see the table above for the mapping),
   - reads the game id from the URL path, gets/generates a token via `getPlayerToken`, and emits `join_game`.
5. **Server** resolves the join: `connectPlayer` assigns or reclaims a team, and `sync` goes back with a full
   snapshot.
6. **`GameController.handle_sync`** is the fork point for everything that can happen on load:
   - **Spectator, match live** → render the board read-only.
   - **Spectator, no match yet** → "Both player slots are taken" message.
   - **Active player, match live** (i.e. a refresh mid-match) → `resume_match`: render the board at the *live*
     positions from the snapshot (not the map's starting positions), and restore the Commit button to
     enabled/disabled based on `snapshot.hasPendingMove` - so a player who already committed a move before
     refreshing doesn't get a second chance to move this round.
   - **Active player, already marked ready** (refreshed while waiting in the lobby) → skip straight to
     "Waiting for the other player...".
   - **Active player, fresh join** → show the Start button.
7. From here it's normal event flow: `start_button_clicked` → `ready` → both sides ready → `startGame` broadcast
   → `render_board` → `node_clicked` (from `graphicsObjects.js`, via `eventsRouter`) → `player_committed_move` →
   `proposed_move` → `updateGame` broadcast → back to move-picking, or `handle_end_state` on a win.

## The client rendering layer

`MapGUI` (`scenes/graphicsObjects.js`) owns exactly one job: draw the graph and keep it coloured correctly. It
builds the Phaser `NodeGraphic`/`EdgeGraphic` objects **once** (`_build_layout`, guarded by `this.built`) and
every subsequent `draw_map()` call just recolours the existing nodes (`_colour_nodes`) - white by default, then
green/red/yellow for whoever's standing where. `GameController` creates one `MapGUI` per page load and reuses it
for the whole session, including rematches, since the layout never changes within a session. If you're adding
something that changes the *layout* mid-session (see [cutting/drawing edges](#letting-players-cut-or-draw-edges)
below), this is the assumption you'll need to revisit.

Everything else in `scenes/` is a thin wrapper around one DOM element (`StatusLine`, `PlayerBadge`,
`StartButton`, `CommitButton`) - constructed once, toggled with `show()`/`hide()`/`set()`, never recreated. That
pattern (build once, mutate in place) is deliberate throughout the client and worth keeping if you add more UI.

## How to add a new map

Maps are plain data - no code changes to the server logic needed.

1. Create `api/maps/<your-id>.js`:

   ```js
   const yourMap = {
       id: 'your-id',
       name: 'Your Map Name',
       nodes: [0, 1, 2, 3, 4],
       edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]],
       // Normalised 0-1 coordinates - scaled up to canvas size at render time,
       // so the layout is resolution-independent.
       positions: {
           0: [0.5, 0.1],
           1: [0.9, 0.5],
           2: [0.7, 0.9],
           3: [0.3, 0.9],
           4: [0.1, 0.5]
       },
       characters: {
           cop: 0,
           robber: 2,
           honey: 4
       }
   };

   module.exports = yourMap;
   ```

2. Register it in `api/maps/index.js`:

   ```js
   const classic = require('./classic');
   const yourMap = require('./your-id');

   const MAPS = [classic, yourMap];
   ```

3. That's it for the map itself. Right now every game uses `DEFAULT_MAP_ID` (`getMap()` with no argument) -
   `GameManager.create(mapId)` and `GameSession`'s constructor already accept a `mapId`, so wiring up actual map
   *selection* (e.g. a dropdown on the landing page, passed through `POST /api/games`) is a small, contained
   change to `create.js` + the `/api/games` route, not a new concept.

Constraints: node ids must be the array indices you reference in `edges`/`positions`/`characters`; the graph
should be connected (unreachable nodes just can't be occupied or moved to); `characters.cop`/`robber`/`honey`
must be valid node ids and shouldn't all be the same node.

## How to modify the game itself

The rule for all of these: **validation and state mutation go in `GameSession`** (`api/components/gameSession.js`).
The client only ever proposes and renders. If you find yourself deciding whether a move is legal in
`gameController.js`, that logic is in the wrong place - a modified client could send any move it wants directly
over the socket, bypassing the UI entirely.

### New move types

Right now there's exactly one kind of move: step to an adjacent node. To add a second kind (a two-step "jump",
a "wait in place", a "swap with an adjacent enemy," whatever):

1. **Protocol**: extend the `proposed_move` payload with a type, e.g. `{ move: [from, to], type: 'jump' }`.
2. **Server** (`GameSession.proposeMove`): branch on `type` before the edge check:

   ```js
   proposeMove(token, move, type = 'walk') {
       const team = this.teamFor(token);
       if (!isPlayableTeam(team)) return null;
       if (team in this.pendingMoves) return null;

       const [from, to] = move;
       if (from !== this.playerPositions[team]) return null;

       const legal = type === 'jump' ? this.jumpExists(from, to) : this.edgeExists(from, to);
       if (!legal) return null;

       // ...unchanged from here
   }
   ```

   where `jumpExists` is whatever reachability rule you want (e.g. exactly two edges away).
3. **Client** (`gameController.js`): `propose_move`/`handle_node_click` currently hardcode
   `_check_edge_exists` as the only legality check before letting a node be selected. Add the equivalent
   client-side check for the new type purely so the UI doesn't highlight an illegal target - the server call in
   step 2 is what actually enforces it either way.

Keep the server the source of truth even for a purely cosmetic move type; don't let the client decide legality
and just tell the server what happened.

### Letting players cut or draw edges

This is a bigger change because it breaks an assumption baked into the current design: **edges are static, part
of the immutable map template, shared by reference (`this.map.edges`)**. Making them mutable per-game means:

1. **`GameSession`**: stop reading `this.map.edges` directly. Add `this.edges = this.map.edges.map((e) => [...e])`
   in the constructor (a session-owned copy), and change `edgeExists` to check `this.edges` instead. Add methods
   like:

   ```js
   cutEdge(a, b) {
       this.edges = this.edges.filter(([x, y]) => !((x === a && y === b) || (x === b && y === a)));
   }

   drawEdge(a, b) {
       if (!this.edgeExists(a, b)) this.edges.push([a, b]);
   }
   ```

   called from a new handler in `api/index.js`, validated however your game design wants (adjacent-only? limited
   uses? cop-only?).
2. **Broadcast the change.** Add the current edge list to `updateGame`'s payload (or a new `mapChanged` event),
   since `startGame` only fires once per match and every other client needs to know the graph itself moved, not
   just the pieces on it.
3. **Client**: `MapGUI` currently assumes edges never change after `_build_layout()` runs once - that's the
   exact optimization from the [redraw fix](#the-client-rendering-layer). You'll need to add `MapGUI.addEdge()` /
   `removeEdge()` that create/destroy individual `EdgeGraphic`s (`.destroy()` them, don't just stop referencing
   them, or you'll reintroduce the leak that fix removed), and have `gameController.js` call them when it
   receives the new event.

### Portals

Simplest version: a pair of linked nodes that teleport you on arrival.

1. **Map data**: add a `portals` field to a map, e.g. `portals: [[3, 8]]` (pairs of linked node ids). Purely
   additive - existing maps without it keep working.
2. **Server**: in `proposeMove`, replace the two lines that copy `pendingMoves` into `playerPositions` (the pair
   right before `this.pendingMoves = {}`) with a portal-aware version, and add the helper:

   ```js
   this.playerPositions.cop = this.applyPortal(this.pendingMoves.cop);
   this.playerPositions.rob = this.applyPortal(this.pendingMoves.rob);
   this.pendingMoves = {};   // unchanged - still comes right after

   applyPortal(node) {
       const pair = (this.map.portals || []).find((p) => p.includes(node));
       return pair ? pair.find((n) => n !== node) : node;
   }
   ```

   Decide deliberately what this means for catching: since both moves resolve simultaneously, a Robber stepping
   onto a portal the same round the Cop lands on that same node will *still* get caught before teleporting (the
   win check runs against the pre-teleport position if you check before remapping, post-teleport if after) -
   that's a real game-design choice, not an implementation detail, so pick one on purpose.
3. **Client**: `MapGUI` needs a visual treatment for portal nodes (a distinct colour or icon in `_colour_nodes`,
   sourced from `mapInfo.portals`), and `update_game_state` in `gameController.js` already receives the
   post-teleport `cop`/`rob` positions from `updateGame` as-is, so no client-side teleport logic is needed - it
   just renders wherever the server says the pieces ended up.

## Known rough edges

- `scenes/player.js` is dead code - a `Player` class nothing imports. Safe to delete whenever someone's in
  there; not removed here to keep this change purely additive.
- There's no map-selection UI yet even though the server-side plumbing (`mapId` parameters) supports it - see
  [How to add a new map](#how-to-add-a-new-map).
- A spectator or reconnecting player only gets caught up via the `sync` snapshot sent *to them* on join; there's
  no periodic re-sync, so if you add state that can drift (see the edge-mutation example above) make sure
  everything that changes it also broadcasts the change.
