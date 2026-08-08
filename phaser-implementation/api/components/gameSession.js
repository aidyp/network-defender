const { getMap } = require('../maps');
const { SPECTATOR, isPlayableTeam } = require('./teams');
const { TeamAssigner } = require('./teamAssigner');

const RECONNECT_GRACE_MS = 30 * 1000;

/**
 * Authoritative state for a single game. All position/turn logic lives
 * here so the server, not the client, decides what moves are legal -
 * one instance per game, so concurrent games never share state.
 *
 * Players are tracked by a persistent client-side token rather than the
 * ephemeral socket id, so a refreshed browser can reclaim its seat and
 * catch up on the live board instead of being treated as a new joiner.
 */
class GameSession {
    constructor(id, mapId, onEmpty) {
        this.id = id;
        this.map = getMap(mapId);
        this.createdAt = Date.now();
        this.started = false;
        this.players = {}; // token -> { team, ready, socketId, disconnectTimer }
        this.teamAssigner = new TeamAssigner();
        this.pendingMoves = {};
        this.playerPositions = {
            cop: this.map.characters.cop,
            rob: this.map.characters.robber
        };
        this.onEmpty = onEmpty || (() => {});
    }

    get mapInfo() {
        return this.map;
    }

    playerCount() {
        return Object.keys(this.players).length;
    }

    /**
     * Joins or reclaims a seat for this token. Returns the assigned team
     * and whether this was a reconnect (known token) or a fresh join.
     */
    connectPlayer(token, socketId) {
        const existing = this.players[token];
        if (existing) {
            clearTimeout(existing.disconnectTimer);
            existing.disconnectTimer = null;
            existing.socketId = socketId;
            return { team: existing.team, reconnected: true };
        }

        const team = this.teamAssigner.assign();
        this.players[token] = { team, ready: false, socketId, disconnectTimer: null };
        return { team, reconnected: false };
    }

    /**
     * Marks a token's socket as gone. Playable teams get a grace period
     * to reconnect (a page refresh looks identical to this) before their
     * seat is actually released; spectators are dropped immediately.
     */
    disconnectPlayer(token) {
        const player = this.players[token];
        if (!player) return;

        if (!isPlayableTeam(player.team)) {
            this._forget(token);
            return;
        }

        player.socketId = null;
        player.disconnectTimer = setTimeout(() => this._forget(token), RECONNECT_GRACE_MS);
    }

    _forget(token) {
        const player = this.players[token];
        if (!player) return;
        delete this.players[token];
        if (isPlayableTeam(player.team)) {
            this.teamAssigner.release(player.team);
            // A move that was waiting on this player can never resolve now
            this.pendingMoves = {};
        }
        if (this.playerCount() === 0) this.onEmpty();
    }

    setReady(token) {
        const player = this.players[token];
        if (player) player.ready = true;
    }

    isReadyToStart() {
        const activePlayers = Object.values(this.players).filter((player) => player.team !== SPECTATOR);
        return activePlayers.length === 2 && activePlayers.every((player) => player.ready);
    }

    teamFor(token) {
        const player = this.players[token];
        return player ? player.team : null;
    }

    /**
     * A snapshot for a (re)joining client to render immediately, rather
     * than waiting on the next room-wide broadcast.
     */
    getSnapshot(token) {
        const player = this.players[token];
        return {
            team: player.team,
            started: this.started,
            ready: player.ready,
            map: this.started ? this.map : null,
            positions: this.started ? { ...this.playerPositions } : null,
            hasPendingMove: player.team in this.pendingMoves
        };
    }

    edgeExists(a, b) {
        return this.map.edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    }

    /**
     * Validates and applies a proposed move against server-held state.
     * Returns the resulting {cop, rob, winner} update once both players
     * have moved, or null if the move was rejected or we're still
     * waiting on the other player.
     */
    proposeMove(token, move) {
        const team = this.teamFor(token);
        if (!isPlayableTeam(team)) return null;
        if (!Array.isArray(move) || move.length !== 2) return null;
        if (team in this.pendingMoves) return null;

        const [from, to] = move;
        if (from !== this.playerPositions[team]) return null; // must move from your actual position
        if (!this.edgeExists(from, to)) return null;

        this.pendingMoves[team] = to;
        if (Object.keys(this.pendingMoves).length < 2) return null;

        this.playerPositions.cop = this.pendingMoves.cop;
        this.playerPositions.rob = this.pendingMoves.rob;
        this.pendingMoves = {};

        let winner = 'none';
        if (this.playerPositions.rob === this.map.characters.honey) winner = 'rob';
        if (this.playerPositions.cop === this.playerPositions.rob) winner = 'cop';

        const update = { cop: this.playerPositions.cop, rob: this.playerPositions.rob, winner };
        if (winner !== 'none') this.resetRound();
        return update;
    }

    resetRound() {
        this.started = false;
        this.playerPositions = {
            cop: this.map.characters.cop,
            rob: this.map.characters.robber
        };
        this.pendingMoves = {};
        Object.values(this.players).forEach((player) => { player.ready = false; });
    }
}

module.exports = { GameSession };
