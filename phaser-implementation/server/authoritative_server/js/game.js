const config = {
    type: Phaser.HEADLESS,
    parent: 'phaser-example',
    autoFocus: false,
    width: 800,
    height: 600,
    physics: {
      default: 'arcade',
      arcade: {
        debug: false,
        gravity: { y: 0 }
      }
    },
    scene: {
      preload: preload,
      create: create,
      update: update
    }
};


// Hardcoded game map for now 

const mapInfo = {
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

const PLAYERS = {
    COP: 0,
    rob: 1
};

var PLAYER_POSITIONS = {
    cop: mapInfo.characters.cop,
    rob: mapInfo.characters.robber
}

var process = {};


// Required for assigning teams at the moment
var COP_PLAYER_ASSIGNED = false;
var ROB_PLAYER_ASSIGNED = false;
players = {};
handlers = {};
const eventsRouter = new Phaser.Events.EventEmitter();

function preload() {
    // Load assets
    this.load.image('ship', 'assets/spaceShips_001.png');
}

// Server game controller 

class ServerGameController {
    
    constructor(mapInfo) {
        /* To Do */
        this.players = {}
        this.mapInfo = mapInfo;
    }

    /* Adds a player to the game controller */
    addPlayer(playerInfo) {
        
    }

    handleClientCommit(commitInfo) {
        /* Check if the server already has a commit for this player for this round */

    }

    processMove(move) {

    }

    


}

class ClientServerSocketHandler {
    constructor(io, socket) {
        this.io = io;
        this.socket = socket;
        this.handler_id = socket.id;

        /* Create SOCKET event listeners for this player's socket connection */
        this.socket.on('disconnect', () => this.handle_disconnect());
        this.socket.on('move_confirmed', (move_data) => this.handle_move(move_data))

        /* Create PHASER event listeners for this player's socket connection */
        //eventsRouter.on('move_processed', this.update_client());
    }

    handle_disconnect() {
        console.log('Client with socket ' + this.handler_id + ' disconnected');

        /* Delete from handlers list */
        delete handlers[this.handler_id];
    }

    handle_move(move_data) {
        console.log('ToDo');
    }

    update_client() {
        console.log('TODO');
    }
}


function create() {
    const self = this;
    this.players = this.physics.add.group();
    io.on('connection', function (socket) {
        console.log('a user connected');
        console.log('Creating socket handler for this client');
        handlers[socket.id] = new ClientServerSocketHandler(io, socket);
        // Check the number of players
        if (checkPlayers(self)) {
            // Create a player object <-- going to cheat here
            players[socket.id] = {
                rotation: 0,
                x: 0,
                y: 0,
                playerId: socket.id,
                team: 0,
                move: [0,0]
            };

            // Add player to the server
            addPlayer(self, players[socket.id]);
            // Send players object to the new player
            socket.emit('currentPlayers', players);
            // update all other players of the new player
            socket.broadcast.emit('newPlayer', players[socket.id]);
            // Send the map 
            socket.emit('newMap', mapInfo);            
        }

    
        // Disconnection event
        socket.on('disconnect', function () {
            console.log('user disconnected');
            removePlayer(self, socket.id);
            delete players[socket.id];
            // emit a message to trigger removal
            socket.broadcast.emit('deletePlayer', socket.id);
        });

        socket.on('move_confirmed', function (movedata) {
            var emit_move = processMove(self, socket.id, movedata);
            if (emit_move) {
                // Update the player positions
                PLAYER_POSITIONS.cop = process["cop"];
                PLAYER_POSITIONS.rob = process["rob"];
                // Emit the updated_move
                io.emit('processedMove', process);
            }
        })
        


    });

}
function update() {}
function addPlayer(self, playerInfo){
    const player = self.physics.add.image(playerInfo.x, playerInfo.y, 'ship').setOrigin(0.5, 0.5).setDisplaySize(53, 40);
    player.setDrag(100);
    player.setAngularDrag(100);
    player.setMaxVelocity(200);
    player.playerId = playerInfo.playerId;

    // Set the team here
    player.team = setTeam();
    // Dirty hack until I fix the object duplication
    playerInfo.team = player.team;
    self.players.add(player);
}

function removePlayer(self, playerId) {
    self.players.getChildren().forEach((player) => {
        if (playerId === player.playerId) {
            // Set the flags so that the player can be re-assigned
            console.log(player.team);
            if (player.team === PLAYERS.COP) {COP_PLAYER_ASSIGNED = false;}
            if (player.team === PLAYERS.ROB) {ROB_PLAYER_ASSIGNED = false;}
            player.destroy();
        }
    });
}

function checkPlayers(self) {
    // Get the number of players 
    var num_players = self.players.getChildren().length;
    return (num_players < 2);
}
/* Sets the team of the player. Stub for now */
function setTeam(self) {
    if (!(COP_PLAYER_ASSIGNED)) {
        COP_PLAYER_ASSIGNED = true; 
        return PLAYERS.COP;
    }
    if (!(ROB_PLAYER_ASSIGNED)) {
        ROB_PLAYER_ASSIGNED = true;
        return PLAYERS.ROB;
    }
    
}
/* Processes the move, emits an event */
function processMove(self, socket_id, move_data) {
    // Validate the move
    console.log(players[socket_id].team);
    console.log(move_data);
    var team = (players[socket_id].team == 0) ? "cop" : "rob";
    var valid = validateMove(team, move_data[0]);

    
    // Add the move to this turns process state
    if (valid) {
        // Extract the target node. Luckily for us, it's always the second
        // (TODO, adjust this in case someone is tricky)
        var new_position = move_data[0][1];
        // Push the move if it doesn't already exist
        if (!(team in process)) {
            process[team] = new_position;
        }
    }

    // Check whether or not it's time to emit a new move
    if (Object.keys(process).length === 2) {
        return true;
    }
    return false;


    

}

function check_edge_exists(node_1, node_2) {
    for (var i = 0; i < mapInfo.edges.length; i++) {
        var edge = mapInfo.edges[i];
        if (edge.includes(node_1) && edge.includes(node_2)) {
            return true
        }
    }
    return false;
}

/* Check whether or not this player can make that move */
function validateMove(player, move) {

    // Check that the edge exists 
    var edge_exists = check_edge_exists(move[0], move[1]);
    
    // Check that the player exists on one of those edges
    var player_node = PLAYER_POSITIONS[player];
    var player_present = move.includes(player_node);

    return (edge_exists && player_present);
    

}

const game = new Phaser.Game(config);
window.gameLoaded();