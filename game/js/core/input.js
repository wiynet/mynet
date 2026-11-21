// Keyboard + mouse input with pointer lock. Systems read `input.down(code)`,
// `input.pressed(code)` (edge, this frame only) and accumulated mouse deltas.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.justPressed = new Set();
    this.justReleased = new Set();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.mouseButtons = new Set();
    this.mousePressed = new Set();
    this.enabled = true; // false while menus are open
    this.locked = false;
    this.lastMouseMove = 0;
    this.wantsLock = true;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); this.justReleased.add(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseButtons.clear(); });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && this.wantsLock) { this.requestLock(); return; }
      this.mouseButtons.add(e.button); this.mousePressed.add(e.button);
    });
    window.addEventListener('mouseup', (e) => this.mouseButtons.delete(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      // without pointer lock (unsupported/denied) fall back to drag-to-look
      if (!this.locked && !(this.mouseButtons.size && !this.wantsLock)) return;
      this.mouseDX += e.movementX; this.mouseDY += e.movementY;
      this.lastMouseMove = performance.now();
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockerror', () => { this.lockFails = (this.lockFails || 0) + 1; if (this.lockFails >= 2) this.wantsLock = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }
  requestLock() {
    const fail = () => { this.lockFails = (this.lockFails || 0) + 1; if (this.lockFails >= 3) this.wantsLock = false; };
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(fail); } catch (_) { fail(); }
  }
  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(code) { return this.enabled && this.keys.has(code); }
  pressed(code) { return this.enabled && this.justPressed.has(code); }
  /** Edge-trigger that also works while gameplay input is disabled (menu hotkeys). */
  pressedRaw(code) { return this.justPressed.has(code); }
  mouseDown(b) { return this.enabled && this.mouseButtons.has(b); }
  mouseClicked(b) { return this.enabled && this.mousePressed.has(b); }
  axis(neg, pos) { return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0); }
  endFrame() {
    this.justPressed.clear(); this.justReleased.clear(); this.mousePressed.clear();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
  }
}
