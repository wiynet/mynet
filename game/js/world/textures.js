// Procedural canvas textures: asphalt, concrete, facades with night windows,
// interior surfaces, signage. Everything is generated at load time.
import * as THREE from 'three';
import { mulberry32, fbm } from '../core/utils.js';

let maxAniso = 8;
export function setAnisotropy(a) { maxAniso = a; }

function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
function noiseFill(ctx, w, h, base, amp, seed = 1, scale = 1) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data, r = mulberry32(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amp * scale;
    d[i] = base[0] + n; d[i + 1] = base[1] + n; d[i + 2] = base[2] + n; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
function speckle(ctx, w, h, count, colors, rmin, rmax, seed) {
  const r = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = rmin + r() * (rmax - rmin);
    ctx.globalAlpha = 0.2 + r() * 0.5;
    ctx.fillRect(r() * w, r() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

const cache = {};
const once = (k, f) => cache[k] || (cache[k] = f());

export const Tex = {
  asphalt: () => once('asphalt', () => {
    const c = canvas(512), x = c.getContext('2d');
    noiseFill(x, 512, 512, [58, 60, 64], 26, 3);
    speckle(x, 512, 512, 2500, ['#2a2b2e', '#77787c', '#4a4b4f'], 1, 3, 7);
    // patches and cracks
    const r = mulberry32(11);
    for (let i = 0; i < 14; i++) {
      x.fillStyle = `rgba(${30 + r() * 20},${30 + r() * 20},${34 + r() * 20},0.25)`;
      x.beginPath(); x.ellipse(r() * 512, r() * 512, 20 + r() * 70, 10 + r() * 40, r() * 3, 0, 7); x.fill();
    }
    x.strokeStyle = 'rgba(20,20,22,0.5)'; x.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      let px = r() * 512, py = r() * 512; x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 8; k++) { px += (r() - 0.5) * 40; py += (r() - 0.5) * 40; x.lineTo(px, py); }
      x.stroke();
    }
    return tex(c);
  }),
  /** Greyscale mask: white = puddle. Used for wet road reflections and roughness. */
  puddles: () => once('puddles', () => {
    const S = 256, c = canvas(S), x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      // tileable: sample noise on a torus
      const a = (i / S) * Math.PI * 2, b = (j / S) * Math.PI * 2;
      const n = fbm(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + Math.cos(b) * 2 + Math.sin(b) * 2, 5);
      const v = Math.max(0, Math.min(1, (n - 0.42) * 4)) * 255;
      const k = (j * S + i) * 4; d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return tex(c, { srgb: false });
  }),
  sidewalk: () => once('sidewalk', () => {
    const c = canvas(512), x = c.getContext('2d');
    noiseFill(x, 512, 512, [150, 148, 142], 22, 5);
    x.strokeStyle = 'rgba(70,68,64,0.6)'; x.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 128, 0); x.lineTo(i * 128, 512); x.stroke(); x.beginPath(); x.moveTo(0, i * 128); x.lineTo(512, i * 128); x.stroke(); }
    speckle(x, 512, 512, 900, ['#6d6b66', '#b8b5ae'], 1, 3, 9);
    return tex(c);
  }),
  paving: () => once('paving', () => {
    const c = canvas(512), x = c.getContext('2d'), r = mulberry32(21);
    x.fillStyle = '#7d7468'; x.fillRect(0, 0, 512, 512);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 8; i++) {
      const off = (j % 2) * 32, v = 130 + r() * 50;
      x.fillStyle = `rgb(${v},${v * 0.93},${v * 0.84})`;
      x.fillRect(i * 64 + off + 2, j * 32 + 2, 60, 28);
    }
    speckle(x, 512, 512, 800, ['#5a5249', '#c8bfb2'], 1, 2, 22);
    return tex(c);
  }),
  grass: () => once('grass', () => {
    const c = canvas(512), x = c.getContext('2d');
    noiseFill(x, 512, 512, [70, 104, 48], 30, 8);
    const r = mulberry32(4);
    for (let i = 0; i < 9000; i++) {
      const g = 80 + r() * 80; x.strokeStyle = `rgba(${g * 0.55},${g},${g * 0.35},0.6)`;
      const px = r() * 512, py = r() * 512; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 4, py - 3 - r() * 5); x.stroke();
    }
    return tex(c);
  }),
  sand: () => once('sand', () => {
    const c = canvas(512), x = c.getContext('2d');
    noiseFill(x, 512, 512, [214, 196, 160], 30, 12);
    speckle(x, 512, 512, 3000, ['#bfa577', '#efe0c0', '#9c8a66'], 1, 2, 13);
    return tex(c);
  }),
  terrain: () => once('terrain', () => {
    const c = canvas(512), x = c.getContext('2d');
    noiseFill(x, 512, 512, [128, 128, 128], 60, 14);
    speckle(x, 512, 512, 3000, ['#555', '#aaa', '#888'], 1, 4, 15);
    return tex(c);
  }),
  wood: () => once('wood', () => {
    const c = canvas(512), x = c.getContext('2d'), r = mulberry32(31);
    for (let i = 0; i < 8; i++) {
      const v = 120 + r() * 40;
      x.fillStyle = `rgb(${v},${v * 0.72},${v * 0.48})`; x.fillRect(0, i * 64, 512, 64);
      for (let k = 0; k < 40; k++) {
        x.strokeStyle = `rgba(${60 + r() * 30},${40 + r() * 20},${20},0.18)`; x.lineWidth = 1 + r() * 2;
        const y = i * 64 + r() * 64; x.beginPath(); x.moveTo(0, y);
        x.bezierCurveTo(170, y + (r() - 0.5) * 8, 340, y + (r() - 0.5) * 8, 512, y); x.stroke();
      }
      x.fillStyle = 'rgba(30,18,8,0.5)'; x.fillRect(0, i * 64, 512, 2);
      x.fillRect(r() * 512, i * 64, 2, 64);
    }
    return tex(c);
  }),
  marble: () => once('marble', () => {
    const c = canvas(512), x = c.getContext('2d'), r = mulberry32(41);
    x.fillStyle = '#e9e6e1'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 26; i++) {
      x.strokeStyle = `rgba(120,115,110,${0.08 + r() * 0.15})`; x.lineWidth = 0.5 + r() * 2.5;
      let px = r() * 512, py = r() * 512; x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 12; k++) { px += (r() - 0.3) * 60; py += (r() - 0.5) * 40; x.lineTo(px, py); }
      x.stroke();
    }
    x.strokeStyle = 'rgba(160,155,150,0.6)'; x.lineWidth = 2;
    x.strokeRect(0, 0, 256, 256); x.strokeRect(256, 256, 256, 256); x.strokeRect(256, 0, 256, 256); x.strokeRect(0, 256, 256, 256);
    return tex(c);
  }),
  tiles: () => once('tiles', () => {
    const c = canvas(256), x = c.getContext('2d');
    x.fillStyle = '#9aa3a8'; x.fillRect(0, 0, 256, 256);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const v = 225 + ((i + j) % 2) * 15; x.fillStyle = `rgb(${v},${v},${v + 4})`; x.fillRect(i * 32 + 1, j * 32 + 1, 30, 30); }
    return tex(c);
  }),
  carpet: () => once('carpet', () => {
    const c = canvas(256), x = c.getContext('2d');
    noiseFill(x, 256, 256, [150, 140, 128], 30, 51);
    return tex(c);
  }),
  rug: () => once('rug', () => {
    const c = canvas(512), x = c.getContext('2d');
    x.fillStyle = '#2f3a4a'; x.fillRect(0, 0, 512, 512);
    x.strokeStyle = '#c9b48a'; x.lineWidth = 10; x.strokeRect(24, 24, 464, 464);
    x.lineWidth = 3; x.strokeRect(50, 50, 412, 412);
    x.fillStyle = 'rgba(201,180,138,0.4)';
    for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(256, 256, 40 + i * 30, 0, 7); x.lineWidth = 2; x.strokeStyle = 'rgba(201,180,138,0.35)'; x.stroke(); }
    return tex(c);
  }),
  brick: () => once('brick', () => {
    const c = canvas(512), x = c.getContext('2d'), r = mulberry32(61);
    x.fillStyle = '#8f8a84'; x.fillRect(0, 0, 512, 512);
    for (let j = 0; j < 32; j++) for (let i = 0; i < 9; i++) {
      const off = (j % 2) * 30, v = r();
      x.fillStyle = `rgb(${140 + v * 50},${70 + v * 30},${55 + v * 20})`;
      x.fillRect(i * 60 - off + 2, j * 16 + 2, 56, 13);
    }
    return tex(c);
  }),
  painting: (seed) => {
    const c = canvas(256, 192), x = c.getContext('2d'), r = mulberry32(seed);
    const g = x.createLinearGradient(0, 0, 256, 192);
    g.addColorStop(0, `hsl(${r() * 360},50%,${40 + r() * 30}%)`); g.addColorStop(1, `hsl(${r() * 360},50%,${30 + r() * 30}%)`);
    x.fillStyle = g; x.fillRect(0, 0, 256, 192);
    for (let i = 0; i < 6; i++) { x.fillStyle = `hsla(${r() * 360},60%,${40 + r() * 40}%,0.7)`; x.beginPath(); x.arc(r() * 256, r() * 192, 10 + r() * 60, 0, 7); x.fill(); }
    x.strokeStyle = '#d8c79a'; x.lineWidth = 10; x.strokeRect(0, 0, 256, 192);
    return tex(c, { repeat: false });
  },

  /**
   * Building facade with a matching emissive (night window) map.
   * kind: glass | office | apartment | brick | stucco | shophouse
   */
  facade: (kind, seed = 1) => once('facade_' + kind + seed, () => {
    const W = 512, H = 1024, cols = 8, rows = 16;
    const c = canvas(W, H), x = c.getContext('2d');
    const e = canvas(W, H), ex = e.getContext('2d');
    const r = mulberry32(seed * 97 + kind.length);
    ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
    const cw = W / cols, rh = H / rows;
    const warm = ['#ffd9a0', '#ffe8c4', '#fff2dc', '#cfe4ff', '#ffc98a'];
    if (kind === 'glass') {
      const g = x.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#5a7d94'); g.addColorStop(0.5, '#3a5a72'); g.addColorStop(1, '#64849a');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const v = r() * 25; x.fillStyle = `rgba(${150 + v},${190 + v},${215 + v},${0.08 + r() * 0.12})`;
        x.fillRect(i * cw + 2, j * rh + 2, cw - 4, rh - 4);
        if (r() < 0.32) { ex.fillStyle = warm[Math.floor(r() * warm.length)]; ex.globalAlpha = 0.5 + r() * 0.5; ex.fillRect(i * cw + 2, j * rh + 3, cw - 4, rh - 6); }
      }
      x.fillStyle = '#2b3a46';
      for (let i = 0; i <= cols; i++) x.fillRect(i * cw - 2, 0, 4, H);
      for (let j = 0; j <= rows; j++) x.fillRect(0, j * rh - 3, W, 6);
    } else {
      const bases = { office: '#b7b2a8', apartment: '#d8cbb6', brick: '#8a4f3d', stucco: '#efe4d0', shophouse: '#cfc2a6' };
      x.fillStyle = bases[kind] || '#aaa'; x.fillRect(0, 0, W, H);
      if (kind === 'brick') {
        for (let j = 0; j < H / 8; j++) for (let i = 0; i < W / 24 + 1; i++) {
          const v = r() * 30; x.fillStyle = `rgb(${130 + v},${70 + v * 0.5},${55 + v * 0.4})`;
          x.fillRect(i * 24 - (j % 2) * 12 + 1, j * 8 + 1, 22, 6);
        }
      } else {
        speckle(x, W, H, 4000, ['rgba(0,0,0,0.3)', 'rgba(255,255,255,0.3)'], 1, 2, seed);
      }
      const wf = kind === 'office' ? 0.78 : 0.5, hf = kind === 'office' ? 0.62 : 0.55;
      for (let j = 0; j < rows; j++) {
        // floor band
        x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, j * rh + rh - 6, W, 6);
        for (let i = 0; i < cols; i++) {
          const wx = i * cw + cw * (1 - wf) / 2, wy = j * rh + rh * 0.2, ww = cw * wf, wh = rh * hf;
          x.fillStyle = '#1c242b'; x.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
          const gl = x.createLinearGradient(wx, wy, wx + ww, wy + wh);
          gl.addColorStop(0, '#6f8aa0'); gl.addColorStop(1, '#2d3d4b');
          x.fillStyle = gl; x.fillRect(wx, wy, ww, wh);
          // blinds / curtains variety
          if (r() < 0.3) { x.fillStyle = `rgba(${200 + r() * 55},${180 + r() * 60},${150 + r() * 60},0.55)`; x.fillRect(wx, wy, ww, wh * (0.3 + r() * 0.6)); }
          x.fillStyle = 'rgba(255,255,255,0.7)'; x.fillRect(wx + ww / 2 - 1, wy, 2, wh);
          if (kind === 'apartment' || kind === 'stucco') { x.fillStyle = 'rgba(60,60,60,0.5)'; x.fillRect(wx - 4, wy + wh + 3, ww + 8, 5); }
          if (r() < (kind === 'office' ? 0.28 : 0.36)) {
            ex.fillStyle = warm[Math.floor(r() * warm.length)]; ex.globalAlpha = 0.45 + r() * 0.55;
            ex.fillRect(wx, wy, ww, wh);
          }
        }
      }
    }
    ex.globalAlpha = 1;
    return { map: tex(c), emissive: tex(e) };
  }),

  /** Storefront ground floor: big glass with lit interior. */
  storefront: (seed = 1) => once('store' + seed, () => {
    const W = 512, H = 256, c = canvas(W, H), x = c.getContext('2d'), e = canvas(W, H), ex = e.getContext('2d'), r = mulberry32(seed);
    x.fillStyle = '#2a2d31'; x.fillRect(0, 0, W, H); ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
    for (let i = 0; i < 4; i++) {
      const gx = i * 128 + 8, gy = 40;
      const g = x.createLinearGradient(gx, gy, gx, H);
      const hue = r() * 360;
      g.addColorStop(0, `hsl(${hue},16%,52%)`); g.addColorStop(1, `hsl(${hue},12%,22%)`);
      x.fillStyle = g; x.fillRect(gx, gy, 112, H - gy - 8);
      for (let k = 0; k < 6; k++) { x.fillStyle = `hsla(${r() * 360},50%,60%,0.6)`; x.fillRect(gx + 8 + r() * 80, gy + 60 + r() * 120, 10 + r() * 20, 10 + r() * 30); }
      ex.fillStyle = `hsl(${hue},22%,58%)`; ex.globalAlpha = 0.6; ex.fillRect(gx, gy, 112, H - gy - 8);
    }
    x.fillStyle = '#111'; x.fillRect(0, 0, W, 36);
    return { map: tex(c), emissive: tex(e) };
  }),

  /** Text sign (shop names, neon). Returns a texture usable as map + emissive. */
  sign: (text, { bg = '#111', fg = '#fff', w = 512, h = 128, font = 'bold 64px sans-serif', glow = null, vertical = false } = {}) => {
    const c = canvas(w, h), x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.strokeStyle = fg; x.globalAlpha = 0.6; x.lineWidth = 4; x.strokeRect(6, 6, w - 12, h - 12); x.globalAlpha = 1;
    x.fillStyle = fg; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (glow) { x.shadowColor = glow; x.shadowBlur = 18; }
    if (vertical) {
      const chars = [...text], step = (h - 20) / chars.length;
      chars.forEach((ch, i) => x.fillText(ch, w / 2, 10 + step * (i + 0.5)));
    } else x.fillText(text, w / 2, h / 2 + 2);
    return tex(c, { repeat: false });
  },
  laneDash: () => once('lane', () => {
    const c = canvas(64, 256), x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, 64, 256);
    x.fillStyle = '#fff'; x.fillRect(0, 0, 64, 128);
    return tex(c, { srgb: false });
  }),
  oceanNormal: () => once('oceanN', () => {
    const S = 256, c = canvas(S), x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data;
    const h = new Float32Array(S * S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const a = (i / S) * Math.PI * 2, b = (j / S) * Math.PI * 2;
      h[j * S + i] = fbm(Math.cos(a) * 1.5 + 10, Math.sin(a) * 1.5 + Math.cos(b) * 1.5 + Math.sin(b) * 1.5, 5);
    }
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const dx = h[j * S + ((i + 1) % S)] - h[j * S + ((i - 1 + S) % S)];
      const dy = h[((j + 1) % S) * S + i] - h[((j - 1 + S) % S) * S + i];
      const k = (j * S + i) * 4; d[k] = 128 - dx * 900; d[k + 1] = 128 - dy * 900; d[k + 2] = 255; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return tex(c, { srgb: false });
  }),
  radial: (inner = 'rgba(255,220,160,1)') => once('radial' + inner, () => {
    const c = canvas(128), x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, inner); g.addColorStop(0.4, inner.replace(/[\d.]+\)$/, '0.45)')); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return tex(c, { repeat: false });
  }),
};
