import { eventsRouter } from './eventsRouter.js';

// A thin wrapper around the real <button> in game.html. Built once and
// toggled with show()/hide() so re-showing it between rounds never
// re-registers a duplicate click listener.
class StartButton {
    constructor() {
        this.el = document.getElementById('start-button');
        this.el.addEventListener('click', () => eventsRouter.emit('start_button_clicked'));
    }

    set_label(text) {
        this.el.textContent = text;
    }

    show() {
        this.el.hidden = false;
    }

    hide() {
        this.el.hidden = true;
    }
}

export { StartButton };
