// A thin wrapper around the player-badge <div> in game.html. Set once
// when a team is assigned and left alone after that, so it stays visible
// as a constant reminder even as the status line changes every turn.
class PlayerBadge {
    constructor() {
        this.el = document.getElementById('player-badge');
        this.dot = document.getElementById('player-badge-dot');
        this.text = document.getElementById('player-badge-text');
    }

    set(text, colourName) {
        this.text.textContent = text;
        this.dot.hidden = !colourName;
        this.dot.className = 'colour-dot' + (colourName ? ' colour-dot-' + colourName : '');
        this.el.hidden = false;
    }
}

export { PlayerBadge };
