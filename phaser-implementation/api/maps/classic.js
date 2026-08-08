// Each map is a plain object: node ids, the edges between them, and a
// normalised (0-1) position per node. The client scales positions up to
// the canvas size at render time, so maps stay resolution-independent.
const classic = {
    id: 'classic',
    name: 'Classic Network',
    nodes: [0,1,2,3,4,5,6,7,8,9,10],
    edges: [[0,1],
            [1,2],
            [1,3],
            [1,4],
            [2,3],
            [2,4],
            [2,5],
            [3,5],
            [3,7],
            [4,5],
            [4,6],
            [5,6],
            [5,7],
            [5,8],
            [6,8],
            [6,9],
            [7,8],
            [7,9],
            [8,9],
            [9,10]],
    positions: {
        0: [0.1,0.5],
        1: [0.2,0.5],
        2: [0.3, 0.5],
        3: [0.4, 0.4],
        4: [0.4, 0.6],
        5: [0.5, 0.5],
        6: [0.6, 0.6],
        7: [0.6, 0.4],
        8: [0.7, 0.5],
        9: [0.8, 0.5],
        10: [0.9, 0.5]
    },
    characters: {
        cop: 0,
        robber: 10,
        honey: 5
    }
};

module.exports = classic;
