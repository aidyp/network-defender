// A thin wrapper around the status <p> in game.html, for role/error/win text.
class StatusLine {
    constructor() {
        this.el = document.getElementById('status-line');
    }

    set(text) {
        this.el.textContent = text;
    }
}

export { StatusLine };
