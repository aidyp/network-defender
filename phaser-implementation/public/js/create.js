const createButton = document.getElementById('create-button');
const result = document.getElementById('result');
const gameLinkInput = document.getElementById('game-link');
const joinLink = document.getElementById('join-link');
const copyButton = document.getElementById('copy-button');

createButton.addEventListener('click', async () => {
    createButton.disabled = true;
    try {
        const response = await fetch('/api/games', { method: 'POST' });
        const { gameId } = await response.json();
        const url = `${window.location.origin}/game/${gameId}`;
        gameLinkInput.value = url;
        joinLink.href = url;
        result.hidden = false;
    } finally {
        createButton.disabled = false;
    }
});

copyButton.addEventListener('click', async () => {
    await navigator.clipboard.writeText(gameLinkInput.value);
    copyButton.textContent = 'Copied!';
    setTimeout(() => { copyButton.textContent = 'Copy'; }, 1500);
});
