import { PHASER_RENDER_CONFIG } from './renderConfig.js';

const TEAM_COP = 'cop';
const TEAM_ROB = 'rob';
const SPECTATOR = 'spectator';

const TEAMS = {
    [TEAM_COP]: { name: 'Cop', colourName: 'green', colour: PHASER_RENDER_CONFIG.colours.green },
    [TEAM_ROB]: { name: 'Robber', colourName: 'red', colour: PHASER_RENDER_CONFIG.colours.red },
    [SPECTATOR]: { name: 'Spectator', colourName: null, colour: null }
};

function isPlayableTeam(team) {
    return team === TEAM_COP || team === TEAM_ROB;
}

export { TEAM_COP, TEAM_ROB, SPECTATOR, TEAMS, isPlayableTeam };
