const crypto = require('crypto');
const { GameSession } = require('./gameSession');

const ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L - easy to read and type
const ID_LENGTH = 5;
const STALE_EMPTY_GAME_MS = 2 * 60 * 60 * 1000; // created, never joined, forgotten about

/**
 * Owns every in-progress GameSession, keyed by a short shareable id.
 * Lets the server run any number of concurrent, isolated games.
 */
class GameManager {
    constructor() {
        this.games = new Map();
    }

    generateId() {
        let id;
        do {
            id = Array.from({ length: ID_LENGTH }, () => ID_ALPHABET[crypto.randomInt(ID_ALPHABET.length)]).join('');
        } while (this.games.has(id));
        return id;
    }

    create(mapId) {
        const id = this.generateId();
        const session = new GameSession(id, mapId, () => this.remove(id));
        this.games.set(id, session);
        return session;
    }

    get(id) {
        return this.games.get(id);
    }

    remove(id) {
        this.games.delete(id);
    }

    pruneStale() {
        const now = Date.now();
        for (const [id, session] of this.games) {
            if (session.playerCount() === 0 && now - session.createdAt > STALE_EMPTY_GAME_MS) {
                this.games.delete(id);
            }
        }
    }
}

module.exports = { GameManager };
