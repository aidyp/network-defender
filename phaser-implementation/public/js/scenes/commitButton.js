import { eventsRouter } from './eventsRouter.js';

// A thin wrapper around the real <button> in game.html. Built once and
// toggled with show()/hide()/enable()/disable() so re-showing it between
// rounds never re-registers a duplicate listener on 'node_clicked'.
class CommitButton {
    constructor() {
        this.el = document.getElementById('commit-button');
        this.el.addEventListener('click', () => eventsRouter.emit('player_committed_move'));
        eventsRouter.on('node_clicked', this.enable, this);
    }

    show() {
        this.el.hidden = false;
        this.disable();
    }

    hide() {
        this.el.hidden = true;
    }

    enable() {
        this.el.disabled = false;
    }

    disable() {
        this.el.disabled = true;
    }
}

export { CommitButton };
