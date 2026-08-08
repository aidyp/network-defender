const { SPECTATOR, PLAYABLE_TEAMS, isPlayableTeam } = require('./teams');

/**
 * Hands out cop/rob in random order as players join a game, and returns
 * spectator once both are taken. A released team (a player leaving)
 * goes back into the pool for the next joiner.
 */
class TeamAssigner {
    constructor() {
        this.available = [...PLAYABLE_TEAMS];
    }

    assign() {
        if (this.available.length === 0) return SPECTATOR;
        const index = Math.floor(Math.random() * this.available.length);
        return this.available.splice(index, 1)[0];
    }

    release(team) {
        if (isPlayableTeam(team) && !this.available.includes(team)) {
            this.available.push(team);
        }
    }
}

module.exports = { TeamAssigner };
