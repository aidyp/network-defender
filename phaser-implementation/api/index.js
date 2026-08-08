const path = require('path');
const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { GameManager } = require('./components/gameManager');
const { isPlayableTeam } = require('./components/teams');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const gameManager = new GameManager();

app.use(express.static(PUBLIC_DIR));

app.post('/api/games', (req, res) => {
    const session = gameManager.create();
    res.json({ gameId: session.id });
});

app.get('/game/:gameId', (req, res) => {
    if (!gameManager.get(req.params.gameId)) {
        res.status(404).sendFile(path.join(PUBLIC_DIR, 'game-not-found.html'));
        return;
    }
    res.sendFile(path.join(PUBLIC_DIR, 'game.html'));
});

io.on('connection', (socket) => {
    console.log('a user connected:', socket.id);

    socket.on('join_game', ({ gameId, token } = {}) => {
        const session = gameManager.get(gameId);
        if (!session || !token) {
            socket.emit('join_error', 'That game does not exist or has ended.');
            return;
        }
        socket.gameId = gameId;
        socket.playerToken = token;
        socket.join(gameId);

        const { team, reconnected } = session.connectPlayer(token, socket.id);
        socket.emit('sync', session.getSnapshot(token));

        if (reconnected && isPlayableTeam(team)) {
            socket.to(gameId).emit('opponent_reconnected', { team });
        }
        console.log(`${socket.id} ${reconnected ? 'reconnected to' : 'joined'} game ${gameId} as ${team} (${session.playerCount()} players)`);
    });

    socket.on('ready', () => {
        const session = gameManager.get(socket.gameId);
        if (!session || !socket.playerToken) return;
        session.setReady(socket.playerToken);
        socket.to(socket.gameId).emit('opponent_ready', { team: session.teamFor(socket.playerToken) });
        if (session.isReadyToStart()) {
            session.started = true;
            io.to(socket.gameId).emit('startGame', session.mapInfo);
        }
    });

    socket.on('proposed_move', (moveMsg) => {
        const session = gameManager.get(socket.gameId);
        if (!session || !socket.playerToken || !moveMsg) return;
        const update = session.proposeMove(socket.playerToken, moveMsg.move);
        if (update) {
            io.to(socket.gameId).emit('updateGame', update);
        }
    });

    socket.on('disconnect', () => {
        console.log('user disconnected:', socket.id);
        const session = gameManager.get(socket.gameId);
        if (!session || !socket.playerToken) return;
        const team = session.teamFor(socket.playerToken);
        session.disconnectPlayer(socket.playerToken);
        if (isPlayableTeam(team)) {
            socket.to(socket.gameId).emit('opponent_disconnected', { team });
        }
    });
});

setInterval(() => gameManager.pruneStale(), 30 * 60 * 1000);

server.listen(8081, function () {
    console.log(`Listening on ${server.address().port}`);
});
