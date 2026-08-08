// A stable per-browser, per-game identity, so a refreshed page can be
// recognised by the server as the same player rather than a new joiner.
function generateToken() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return 'p-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getPlayerToken(gameId) {
    const key = `cops-and-robbers:${gameId}`;
    let token = localStorage.getItem(key);
    if (!token) {
        token = generateToken();
        localStorage.setItem(key, token);
    }
    return token;
}

export { getPlayerToken };
