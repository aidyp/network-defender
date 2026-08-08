const TEAM_COP = 'cop';
const TEAM_ROB = 'rob';
const SPECTATOR = 'spectator';
const PLAYABLE_TEAMS = [TEAM_COP, TEAM_ROB];

function isPlayableTeam(team) {
    return PLAYABLE_TEAMS.includes(team);
}

module.exports = { TEAM_COP, TEAM_ROB, SPECTATOR, PLAYABLE_TEAMS, isPlayableTeam };
