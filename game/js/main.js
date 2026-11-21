// Entry point: boots the game behind a loading screen.
import { Game } from './game.js';

const bar = document.getElementById('loadBar'), label = document.getElementById('loadLabel');
function fail(err) {
  console.error(err);
  label.textContent = 'Could not start: ' + (err && err.message ? err.message : err);
  document.getElementById('loading').classList.add('error');
}
try {
  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2')) throw new Error('WebGL 2 is not available in this browser.');
  const game = new Game();
  window.__game = game;
  game.load((pct, text) => { bar.style.width = pct + '%'; label.textContent = text; })
    .then(() => { document.getElementById('loading').classList.add('done'); })
    .catch(fail);
} catch (e) { fail(e); }
