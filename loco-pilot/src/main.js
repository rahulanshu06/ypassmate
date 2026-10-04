import { Game } from './Game.js';
import { loadFonts } from './core/Fonts.js';

const bootEl = document.getElementById('boot');
const bar = document.querySelector('#boot .boot-bar i');
const msg = document.querySelector('#boot .boot-msg');
const errEl = document.querySelector('#boot .boot-err');

function progress(p, text) {
  bar.style.width = Math.round(p * 100) + '%';
  if (text) msg.textContent = text;
}

function fail(err) {
  console.error(err);
  errEl.style.display = 'block';
  errEl.innerHTML = `<b>Could not start the simulator.</b><br>${String(err && err.message ? err.message : err)}<br><br>
  Loco Pilot needs a browser with WebGL 2 (Chrome, Edge, Firefox or Safari 15+) and hardware acceleration enabled.`;
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

async function start() {
  if (!webglAvailable()) return fail(new Error('WebGL 2 is not available on this device/browser.'));
  progress(0.02, 'Loading fonts…');
  await loadFonts();
  const game = new Game(document.getElementById('app'), document.getElementById('ui'));
  try {
    await game.boot(progress);
    bootEl.classList.add('hide');
    setTimeout(() => bootEl.remove(), 800);
  } catch (err) {
    fail(err);
  }
}

window.addEventListener('error', (e) => {
  if (!document.getElementById('boot')) return;
  if (bootEl.classList.contains('hide')) return;
  fail(e.error || e.message);
});

start();
