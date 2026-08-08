import { CommitButton } from './commitButton.js';
import { eventsRouter } from './eventsRouter.js';
import { PlayerBadge } from './playerBadge.js';
import { StartButton } from './startButton.js';
import { StatusLine } from './statusLine.js';
import { MapGUI } from './graphicsObjects.js';
import { TEAM_COP, TEAMS, isPlayableTeam } from './teams.js';

const SPECTATING_MESSAGE = "Both player slots are taken - you're spectating this game.";

class GameController {
  constructor(scene, socket) {
    this.scene = scene;
    this.socket = socket;
    this.badge = new PlayerBadge();
    this.status = new StatusLine();
    this.status.set('Connecting...');
    this.start_button = new StartButton();
    this.commit_button = new CommitButton();
    this.set_up_listeners();
    this.team = null;
    this.game_state = null;
    this.updated = false;
    this.committed = false;
    this.ready_clicked = false;
    this.opponent_ready = false;
    this.next_start_label = 'Start Game';
  }

  set_up_listeners() {
    eventsRouter.on('start_button_clicked', this.request_game_start, this);
    eventsRouter.on('server_sync', this.handle_sync, this);
    eventsRouter.on('server_started_game', this.start_game, this);
    eventsRouter.on('server_updated_game', this.update_game_state, this);
    eventsRouter.on('player_committed_move', this.send_move_to_server, this);
    eventsRouter.on('node_clicked', this.handle_node_click, this);
    eventsRouter.on('server_join_error', this.handle_join_error, this);
    eventsRouter.on('server_opponent_ready', this.handle_opponent_ready, this);
    eventsRouter.on('server_opponent_disconnected', this.handle_opponent_disconnected, this);
    eventsRouter.on('server_opponent_reconnected', this.handle_opponent_reconnected, this);
  }

  /**
   * The server's snapshot of where we stand, sent right after we join -
   * whether this is our first time here or we're picking back up after
   * a refresh mid-match.
   */
  handle_sync(snapshot) {
    if (this.team != null) {return} // Idempotence - only the first sync sets us up
    this.team = snapshot.team;

    if (!isPlayableTeam(this.team)) {
      this.badge.set('Spectating', null);
      if (snapshot.started) {
        this.render_board(snapshot.map, snapshot.positions);
      } else {
        this.status.set(SPECTATING_MESSAGE);
      }
      return;
    }

    const info = TEAMS[this.team];
    this.badge.set(`You are the ${info.name}`, info.colourName);
    this.colour = info.colour;

    if (snapshot.started) {
      this.resume_match(snapshot);
      return;
    }

    if (snapshot.ready) {
      // We'd already clicked ready before whatever knocked us out
      this.ready_clicked = true;
      this.status.set('Waiting for the other player to start...');
      return;
    }

    this.show_ready_prompt('Start Game');
  }

  /**
   * Rebuilds the board and turn state for a player rejoining a match
   * that's already underway, instead of resetting them to a blank lobby.
   */
  resume_match(snapshot) {
    this.render_board(snapshot.map, snapshot.positions);
    this.player_node = (this.team === TEAM_COP ? snapshot.positions.cop : snapshot.positions.rob);
    this.commit_button.show();

    if (snapshot.hasPendingMove) {
      this.committed = true;
      this.commit_button.disable();
      this.status.set('Move committed. Waiting for the other player...');
    } else {
      this.committed = false;
      this.status.set('Your move - click a node, then Commit Move.');
    }
  }

  render_board(mapInfo, positions) {
    if (this.game_state != null) {return}
    this.game_state = {
      nodes: mapInfo.nodes,
      edges: mapInfo.edges,
      positions: mapInfo.positions,
      characters: { cop: positions.cop, robber: positions.rob, honey: mapInfo.characters.honey }
    };
    // The map layout is the same for the whole session (including any
    // rematch), so the MapGUI is built once and reused rather than
    // recreated - draw_map() itself only recolours after the first call.
    if (!this.map) {
      this.map = new MapGUI(this.scene);
    }
    this.map.draw_map(this.game_state);
  }

  handle_join_error(message) {
    this.status.set(message);
  }

  /**
   * Resets the start/rematch button to a fresh "click when ready" state
   * and announces it. Used for a genuinely new prompt (first join, or a
   * reconnect that landed back in the lobby) - NOT after a win, where the
   * outcome message on screen should stay put until something changes it.
   */
  show_ready_prompt(label) {
    this.prepare_ready_button(label);
    this.status.set(this.opponent_ready
      ? `Your opponent is ready! Click ${label} to begin.`
      : `Click ${label} when you're ready.`);
  }

  prepare_ready_button(label) {
    this.ready_clicked = false;
    this.next_start_label = label;
    this.start_button.set_label(label);
    this.start_button.show();
  }

  request_game_start() {
    this.ready_clicked = true;
    this.opponent_ready = false;
    eventsRouter.emit('ready_to_start', this.team);
    this.start_button.hide();
    this.status.set('Waiting for the other player to start...');
    this.socket.emit('ready');
  }

  handle_opponent_ready() {
    this.opponent_ready = true;
    if (!isPlayableTeam(this.team) || this.ready_clicked || this.game_state != null) {return}
    this.status.set(`Your opponent is ready! Click ${this.next_start_label} to begin.`);
  }

  handle_opponent_disconnected(team) {
    const info = TEAMS[team];
    this.status.set(`${info.name} disconnected - waiting for them to reconnect...`);
  }

  handle_opponent_reconnected(team) {
    const info = TEAMS[team];
    this.status.set(`${info.name} reconnected.`);
  }

  /**
   * Creates a new game for the client
   */
  start_game(mapInfo) {
    if (this.game_state != null) {return} // Idempotence
    this.render_board(mapInfo, { cop: mapInfo.characters.cop, rob: mapInfo.characters.robber });

    if (!isPlayableTeam(this.team)) {
      this.status.set(SPECTATING_MESSAGE);
      return;
    }

    this.player_node = (this.team === TEAM_COP ? this.game_state.characters.cop : this.game_state.characters.robber);
    this.commit_button.show();
    this.status.set('Your move - click a node, then Commit Move.');
  }

  /**
   * Clientside logic for handling server
   * game update message
   */
  update_game_state(update_data) {
    if (this.updated) {return} // Idempotence
    this.game_state.characters.robber = update_data.rob
    this.game_state.characters.cop = update_data.cop
    this.updated = true;

    if (update_data.winner == 'cop' || update_data.winner == 'rob') {
      this.handle_end_state(update_data.winner)
      return;
    }

    this.map.draw_map(this.game_state);
    this.committed = false;

    if (isPlayableTeam(this.team)) {
      this.player_node = (this.team === TEAM_COP ? this.game_state.characters.cop : this.game_state.characters.robber);
      this.commit_button.show();
      this.status.set('Your move - click a node, then Commit Move.');
    }
  }

  handle_end_state(winner) {
    this.map.draw_map(this.game_state);
    this.status.set(this.describe_outcome(winner));
    this.reset_game();
  }

  describe_outcome(winner) {
    if (!isPlayableTeam(this.team)) {
      return winner === 'cop' ? 'The cop wins!' : 'The robber wins!';
    }
    const won = this.team === winner;
    if (winner === 'cop') {
      return won ? 'You caught the robber - you win!' : 'The cop caught you - you lose.';
    }
    return won ? 'You reached the honey - you win!' : 'The robber reached the honey - you lose.';
  }

  reset_game() {
    this.game_state = null;
    this.committed = false;
    this.opponent_ready = false;
    this.commit_button.hide();
    if (isPlayableTeam(this.team)) {
      // Leave the win/lose message on screen - prepare the button without
      // overwriting it with a generic "click when ready" prompt.
      this.prepare_ready_button('Rematch');
    }
  }

  /**
   * On a committed move,
   * send it to the server
   */
  send_move_to_server() {
    if (this.committed) {return}
    this.socket.emit('proposed_move', { move: this.proposed_move });
    this.committed = true;
    this.updated = false;
    this.commit_button.disable();
    this.status.set('Move committed. Waiting for the other player...');
  }

  handle_node_click(node_id) {
    if (!isPlayableTeam(this.team)) {return}
    // Check if the move is 'legal'
    if (!(this._check_edge_exists(this.player_node, node_id))) {return}

    this.map.highlight_node(node_id, this.colour);
    this.map.clear_all_nodes_but(node_id);
    this.propose_move(node_id);
  }

  propose_move(node_id) {
    this.proposed_move = [this.player_node, node_id];
  }

  _check_edge_exists(node_1, node_2) {
    for (var i = 0; i < this.game_state.edges.length; i++) {
        var edge = this.game_state.edges[i];
        if (edge.includes(node_1) && edge.includes(node_2)) {
            return true
        }
    }
    return false;
}

}

export { GameController };
