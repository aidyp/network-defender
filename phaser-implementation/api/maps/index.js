const classic = require('./classic');

// Add new maps here - each one just needs the same shape as classic.js
// (nodes, edges, positions, characters).
const MAPS = [classic];
const MAPS_BY_ID = Object.fromEntries(MAPS.map((map) => [map.id, map]));
const DEFAULT_MAP_ID = classic.id;

function getMap(id) {
    return MAPS_BY_ID[id] || MAPS_BY_ID[DEFAULT_MAP_ID];
}

module.exports = { getMap, MAPS, DEFAULT_MAP_ID };
