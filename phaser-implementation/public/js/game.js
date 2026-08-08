import { eventsRouter } from './scenes/eventsRouter.js'
import { GameController } from './scenes/gameController.js';
import { getPlayerToken } from './scenes/playerToken.js';
import { PHASER_RENDER_CONFIG } from './scenes/renderConfig.js';

/* Phaser Config setup */
var config = {
  type: Phaser.AUTO,
  parent: 'phaser-parent',
  width: PHASER_RENDER_CONFIG.width,
  height: PHASER_RENDER_CONFIG.height,
  scene: {
    preload: preload,
    create: create
  }
};
var game = new Phaser.Game(config);

function get_game_id() {
  var parts = window.location.pathname.split('/').filter(Boolean);
  return parts[0] === 'game' ? parts[1] : null;
}

function preload() {}
function create() {
  var self = this;
  this.socket = io();
  this.controller = new GameController(self, this.socket)

  const gameId = get_game_id();
  if (!gameId) {
    eventsRouter.emit('server_join_error', 'No game selected. Create a game from the home page.');
    return;
  }

  // Registered once here (not per-frame) so we never accumulate duplicate
  // socket listeners over the life of a session.
  this.socket.on('sync', (snapshot) => {
    eventsRouter.emit('server_sync', snapshot)
  });
  this.socket.on('startGame', (game_data) => {
    eventsRouter.emit('server_started_game', game_data)
  });
  this.socket.on('updateGame', (update_data) => {
    eventsRouter.emit('server_updated_game', update_data);
  });
  this.socket.on('join_error', (message) => {
    eventsRouter.emit('server_join_error', message);
  });
  this.socket.on('opponent_ready', ({ team }) => {
    eventsRouter.emit('server_opponent_ready', team);
  });
  this.socket.on('opponent_disconnected', ({ team }) => {
    eventsRouter.emit('server_opponent_disconnected', team);
  });
  this.socket.on('opponent_reconnected', ({ team }) => {
    eventsRouter.emit('server_opponent_reconnected', team);
  });

  const token = getPlayerToken(gameId);
  this.socket.emit('join_game', { gameId, token });
}
