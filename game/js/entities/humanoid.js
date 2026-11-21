// Procedural skinned humanoid: one merged geometry bound to a 17-bone skeleton
// (single draw call per character) with fully procedural animation.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, lerp } from '../core/utils.js';

const B = { hips: 0, spine: 1, chest: 2, neck: 3, head: 4, uaL: 5, faL: 6, haL: 7, uaR: 8, faR: 9, haR: 10, thL: 11, shL: 12, ftL: 13, thR: 14, shR: 15, ftR: 16 };
const BONE_DEFS = [
  ['hips', -1, 0, 0.95, 0], ['spine', 0, 0, 0.1, 0], ['chest', 1, 0, 0.2, 0], ['neck', 2, 0, 0.24, 0], ['head', 3, 0, 0.08, 0],
  ['uaL', 2, 0.19, 0.17, 0], ['faL', 5, 0, -0.29, 0], ['haL', 6, 0, -0.26, 0],
  ['uaR', 2, -0.19, 0.17, 0], ['faR', 8, 0, -0.29, 0], ['haR', 9, 0, -0.26, 0],
  ['thL', 0, 0.1, -0.03, 0], ['shL', 11, 0, -0.44, 0], ['ftL', 12, 0, -0.42, 0],
  ['thR', 0, -0.1, -0.03, 0], ['shR', 14, 0, -0.44, 0], ['ftR', 15, 0, -0.42, 0],
];

export const SKIN_TONES = [0xf5d7c4, 0xe8b996, 0xd29f7a, 0xb07a52, 0x8a5a3a, 0x5e3a24];
export const HAIR_COLORS = [0x141010, 0x3a2416, 0x6a4422, 0xb8884a, 0xe0c890, 0x8a8a8a, 0xa83a2a, 0x2a3a6a];
export const HAIR_STYLES = ['short', 'buzz', 'long', 'bun', 'curly', 'bald'];
export const TOP_STYLES = ['tee', 'long', 'jacket', 'hoodie', 'tank'];
export const LEG_STYLES = ['pants', 'shorts', 'skirt'];
export const HATS = ['none', 'cap', 'beanie'];
export const CLOTH_COLORS = [0xf2f2f2, 0x1a1a1e, 0x2a3a5a, 0x8a2a2a, 0x2a5a3a, 0xc8a050, 0x5a5a62, 0xe08a3a, 0x6a3a7a, 0x3a8ab0, 0xd8c8b0, 0x9a6a4a, 0xe8a0b0, 0x283c28];

export function randomAppearance(rng = Math) {
  const r = () => (rng.next ? rng.next() : Math.random());
  const pick = (a) => a[Math.floor(r() * a.length)];
  const sex = r() < 0.5 ? 'm' : 'f';
  return {
    sex, skin: pick(SKIN_TONES), hair: sex === 'f' ? pick(['long', 'bun', 'curly', 'short']) : pick(['short', 'buzz', 'curly', 'bald', 'short']),
    hairColor: pick(HAIR_COLORS.slice(0, 6)), top: pick(TOP_STYLES), topColor: pick(CLOTH_COLORS), innerColor: pick(CLOTH_COLORS),
    legs: sex === 'f' ? pick(['pants', 'skirt', 'shorts', 'pants']) : pick(['pants', 'pants', 'shorts']), legColor: pick([0x1f2a44, 0x2a2a2e, 0x5a4a3a, 0xc8b8a0, 0x3a4a5a, 0x1a1a1a]),
    shoeColor: pick([0x111111, 0xf0f0f0, 0x5a3a22, 0x8a2a2a, 0x2a3a6a]), hat: r() < 0.15 ? pick(['cap', 'beanie']) : 'none', hatColor: pick(CLOTH_COLORS),
    height: 0.94 + r() * 0.12, build: 0.9 + r() * 0.25, glasses: r() < 0.15, bag: r() < 0.2,
  };
}

const _c = new THREE.Color();
function part(geo, bone, color) {
  const n = geo.attributes.position.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), col = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) { si[i * 4] = bone; sw[i * 4] = 1; col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (!geo.index) { const idx = []; for (let i = 0; i < n; i++) idx.push(i); geo.setIndex(idx); }
  return geo;
}
const cap = (r, len, sx = 1, sz = 1) => { const g = new THREE.CapsuleGeometry(r, len, 3, 8); g.scale(sx, 1, sz); return g; };
const sph = (r, sx = 1, sy = 1, sz = 1, w = 10, h = 7) => { const g = new THREE.SphereGeometry(r, w, h); g.scale(sx, sy, sz); return g; };

function buildGeometry(a) {
  const parts = [];
  const f = a.sex === 'f';
  const sh = f ? 0.17 : 0.19, bw = a.build;
  const skin = a.skin, top = a.topColor, legs = a.legColor;
  const sleeveCol = a.top === 'tank' ? skin : top;
  const foreCol = (a.top === 'long' || a.top === 'jacket' || a.top === 'hoodie') ? top : skin;
  const add = (g, bone, color, x = 0, y = 0, z = 0) => { g.translate(x, y, z); parts.push(part(g, bone, color)); };
  // torso
  add(sph(0.16, (f ? 1.12 : 1.02) * bw, 0.72, 0.74), B.hips, a.legs === 'skirt' ? legs : legs, 0, 0.93, 0);
  add(cap(0.135, 0.1, (f ? 1.0 : 1.08) * bw, 0.76), B.spine, a.top === 'jacket' ? a.innerColor : top, 0, 1.1, 0);
  add(cap(0.155, 0.15, (f ? 1.06 : 1.2) * bw, 0.72), B.chest, top, 0, 1.3, 0);
  if (a.top === 'jacket') {
    add(cap(0.162, 0.2, 1.24 * bw, 0.62), B.chest, top, 0, 1.28, -0.02);
    add(new THREE.BoxGeometry(0.1, 0.36, 0.02), B.chest, a.innerColor, 0, 1.26, 0.118);
  }
  if (a.top === 'hoodie') add(sph(0.12, 1.25, 0.6, 0.9), B.chest, top, 0, 1.45, -0.08);
  if (f) add(sph(0.07, 1, 0.9, 0.8), B.chest, top, 0.06, 1.3, 0.085), add(sph(0.07, 1, 0.9, 0.8), B.chest, top, -0.06, 1.3, 0.085);
  // neck + head
  add(new THREE.CylinderGeometry(0.048, 0.055, 0.12, 8), B.neck, skin, 0, 1.5, 0);
  add(sph(0.105, 0.92, 1.12, 1.0), B.head, skin, 0, 1.645, 0);
  add(sph(0.075, 0.95, 0.8, 1), B.head, skin, 0, 1.585, 0.025);
  add(sph(0.018, 0.9, 1.1, 1.3), B.head, _c.set(skin).multiplyScalar(0.9).getHex(), 0, 1.625, 0.105);
  for (const s of [-1, 1]) {
    add(sph(0.014, 1, 1, 0.6, 8, 6), B.head, 0x1a1410, s * 0.036, 1.66, 0.092);
    add(new THREE.BoxGeometry(0.035, 0.008, 0.01), B.head, a.hair === 'bald' ? _c.set(skin).multiplyScalar(0.7).getHex() : a.hairColor, s * 0.036, 1.685, 0.097);
    add(sph(0.024, 0.5, 1, 0.8, 8, 6), B.head, skin, s * 0.098, 1.64, -0.005);
  }
  add(new THREE.BoxGeometry(0.035, 0.006, 0.01), B.head, 0x8a4a42, 0, 1.585, 0.1);
  if (a.glasses) for (const s of [-1, 1]) add(new THREE.TorusGeometry(0.02, 0.004, 4, 12), B.head, 0x111111, s * 0.036, 1.66, 0.1);
  // hair
  const hc = a.hairColor;
  const capG = (th) => { const g = new THREE.SphereGeometry(0.113, 14, 8, 0, Math.PI * 2, 0, Math.PI * th); g.scale(0.95, 1.08, 1.04); return g; };
  if (a.hair === 'short') add(capG(0.52), B.head, hc, 0, 1.655, -0.006);
  if (a.hair === 'buzz') add(capG(0.45), B.head, hc, 0, 1.65, -0.004);
  if (a.hair === 'curly') { add(capG(0.55), B.head, hc, 0, 1.66, -0.006); for (let i = 0; i < 8; i++) { const an = (i / 8) * Math.PI * 2; add(sph(0.045), B.head, hc, Math.cos(an) * 0.08, 1.73, Math.sin(an) * 0.08 - 0.01); } }
  if (a.hair === 'long') { add(capG(0.56), B.head, hc, 0, 1.655, -0.006); add(cap(0.085, 0.2, 1.3, 0.6), B.head, hc, 0, 1.53, -0.06); }
  if (a.hair === 'bun') { add(capG(0.54), B.head, hc, 0, 1.655, -0.006); add(sph(0.055), B.head, hc, 0, 1.74, -0.08); }
  if (a.hat === 'cap') { add(capG(0.5), B.head, a.hatColor, 0, 1.67, -0.004); add(new THREE.BoxGeometry(0.17, 0.012, 0.1), B.head, a.hatColor, 0, 1.705, 0.12); }
  if (a.hat === 'beanie') add(capG(0.58), B.head, a.hatColor, 0, 1.672, -0.004);
  if (a.bag) add(new THREE.BoxGeometry(0.26, 0.34, 0.12), B.chest, 0x3a3a40, 0, 1.25, -0.16);
  // arms
  for (const [s, ua, fa, ha] of [[1, B.uaL, B.faL, B.haL], [-1, B.uaR, B.faR, B.haR]]) {
    const x = s * sh * bw;
    add(cap(0.052, 0.19), ua, sleeveCol, x, 1.275, 0);
    if (a.top === 'tee') add(cap(0.05, 0.08), ua, skin, x, 1.19, 0);
    add(cap(0.043, 0.18), fa, foreCol, x, 1.0, 0);
    add(sph(0.045, 0.8, 1.25, 0.55), ha, skin, x, 0.82, 0.01);
  }
  // legs
  for (const [s, th, shb, ft] of [[1, B.thL, B.shL, B.ftL], [-1, B.thR, B.shR, B.ftR]]) {
    const x = s * 0.1 * (f ? 1.05 : 1) * bw;
    const thighCol = a.legs === 'skirt' ? skin : legs;
    add(cap(0.075 * (f ? 1.05 : 1), 0.3), th, thighCol, x, 0.7, 0);
    add(cap(0.058, 0.32), shb, a.legs === 'pants' ? legs : skin, x, 0.27, 0);
    if (a.legs === 'shorts') add(cap(0.08, 0.12), th, legs, x, 0.8, 0);
    const fg = new THREE.BoxGeometry(0.1, 0.075, 0.25); fg.translate(0, 0, 0.045);
    add(fg, ft, a.shoeColor, x, 0.04, 0);
  }
  if (a.legs === 'skirt') { const g = new THREE.CylinderGeometry(0.17 * bw, 0.27 * bw, 0.4, 14, 1, true); add(g, B.hips, legs, 0, 0.74, 0); }
  // Normalize attribute sets before merging.
  for (const g of parts) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k); }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

let sharedMat = null;
export class Humanoid {
  constructor(appearance) {
    this.appearance = appearance;
    this.root = new THREE.Group();
    this.bones = BONE_DEFS.map(([name]) => { const b = new THREE.Bone(); b.name = name; return b; });
    BONE_DEFS.forEach(([, parent, x, y, z], i) => { this.bones[i].position.set(x, y, z); if (parent >= 0) this.bones[parent].add(this.bones[i]); });
    this.rest = this.bones.map((b) => b.position.clone());
    this.skeleton = new THREE.Skeleton(this.bones);
    if (!sharedMat) sharedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 });
    this.build(appearance);
    this.phase = Math.random() * 6; this.t = Math.random() * 10;
    this.tgt = this.bones.map(() => new THREE.Euler());
    this.hipsY = 0.95; this.lie = 0;
  }
  build(appearance) {
    this.appearance = appearance;
    const s = appearance.height || 1;
    if (this.mesh) { this.root.remove(this.mesh); this.mesh.geometry.dispose(); }
    const geo = buildGeometry(appearance);
    const mesh = new THREE.SkinnedMesh(geo, sharedMat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    // bind in rest pose
    this.bones.forEach((b, i) => { b.position.copy(this.rest ? this.rest[i] : b.position); b.rotation.set(0, 0, 0); });
    mesh.add(this.bones[0]);
    mesh.updateMatrixWorld(true);
    mesh.bind(this.skeleton);
    geo.computeBoundingSphere(); geo.boundingSphere.radius = 1.6;
    mesh.frustumCulled = true;
    this.mesh = mesh; this.root.add(mesh);
    this.mesh.scale.setScalar(s);
  }
  setShadow(v) { this.mesh.castShadow = v; }

  /**
   * p: { speed, crouch, air, punch:{t,hand}, sit, drive, handsUp, cower, phone, knocked, stunned, aim, wave, talk, dt }
   */
  animate(dt, p) {
    this.t += dt;
    const T = this.tgt, sp = p.speed || 0;
    for (const e of T) e.set(0, 0, 0);
    const stride = sp > 5 ? 1.25 : sp > 2.5 ? 1.0 : 0.72;
    this.phase += dt * (sp / stride) * Math.PI * 0.95;
    const ph = this.phase;
    let A = clamp(sp * 0.16, 0, 0.78);
    let hipsY = 0.95, hipsZ = 0;
    const crouch = p.crouch || 0;
    if (sp > 0.1 && !p.sit && !p.drive && !p.air) {
      const sL = Math.sin(ph), sR = -sL;
      T[B.thL].x = -sL * A; T[B.thR].x = -sR * A;
      T[B.shL].x = Math.max(0, Math.sin(ph + 2.1)) * A * 1.6 + 0.06;
      T[B.shR].x = Math.max(0, Math.sin(ph + 2.1 + Math.PI)) * A * 1.6 + 0.06;
      T[B.ftL].x = -T[B.thL].x * 0.25 - T[B.shL].x * 0.35 + 0.05;
      T[B.ftR].x = -T[B.thR].x * 0.25 - T[B.shR].x * 0.35 + 0.05;
      const armA = A * (sp > 5 ? 1.25 : 0.85);
      T[B.uaL].x = sL * armA; T[B.uaR].x = sR * armA;
      T[B.faL].x = -(0.2 + sp * 0.12) - Math.max(0, -sL) * 0.3;
      T[B.faR].x = -(0.2 + sp * 0.12) - Math.max(0, -sR) * 0.3;
      T[B.spine].y = sL * 0.07 * A; T[B.chest].y = sL * 0.06 * A;
      T[B.spine].x = Math.min(0.28, sp * 0.03);
      T[B.head].x = -T[B.spine].x * 0.6;
      hipsY -= Math.abs(Math.cos(ph)) * 0.045 * Math.min(1, sp / 3) - 0.01;
    } else {
      // idle breathing + weight shift
      const br = Math.sin(this.t * 1.6);
      T[B.chest].x = br * 0.015; T[B.spine].z = Math.sin(this.t * 0.4) * 0.015;
      T[B.faL].x = -0.12; T[B.faR].x = -0.12;
      T[B.head].y = Math.sin(this.t * 0.33) * 0.15; T[B.head].x = Math.sin(this.t * 0.21) * 0.04;
    }
    T[B.uaL].z += 0.07; T[B.uaR].z -= 0.07;
    if (crouch > 0) {
      hipsY = lerp(hipsY, 0.6, crouch);
      for (const [th, sh, ft] of [[B.thL, B.shL, B.ftL], [B.thR, B.shR, B.ftR]]) {
        T[th].x = lerp(T[th].x, -1.05 + T[th].x * 0.5, crouch); T[sh].x = lerp(T[sh].x, 1.55, crouch); T[ft].x = lerp(T[ft].x, -0.5, crouch);
      }
      T[B.spine].x += 0.35 * crouch; T[B.head].x -= 0.25 * crouch;
    }
    if (p.air) {
      T[B.thL].x = -0.7; T[B.shL].x = 1.0; T[B.thR].x = -0.15; T[B.shR].x = 0.5;
      T[B.uaL].x = -0.5; T[B.uaL].z = 0.7; T[B.uaR].x = -0.3; T[B.uaR].z = -0.7; T[B.faL].x = -0.6; T[B.faR].x = -0.6;
    }
    if (p.sit || p.drive) {
      hipsY = 0.5; hipsZ = -0.05;
      for (const [th, sh] of [[B.thL, B.shL], [B.thR, B.shR]]) { T[th].x = -1.5; T[sh].x = 1.45; }
      T[B.thL].z = 0.06; T[B.thR].z = -0.06; T[B.spine].x = -0.08;
      if (p.drive) {
        T[B.uaL].x = -0.95; T[B.uaR].x = -0.95; T[B.faL].x = -0.55; T[B.faR].x = -0.55;
        T[B.uaL].z = 0.15 + (p.steer || 0) * 0.25; T[B.uaR].z = -0.15 + (p.steer || 0) * 0.25;
        T[B.head].y = (p.steer || 0) * 0.3;
      } else { T[B.uaL].x = -0.35; T[B.uaR].x = -0.35; T[B.faL].x = -0.7; T[B.faR].x = -0.7; }
    }
    if (p.phone) { T[B.uaR].x = -0.35; T[B.uaR].z = -0.35; T[B.faR].x = -2.3; T[B.head].z = -0.12; }
    if (p.talk) { const g = Math.sin(this.t * 3.2); T[B.uaR].x = -0.4 + g * 0.2; T[B.faR].x = -1.1 + g * 0.3; T[B.uaL].x = -0.2 - g * 0.15; T[B.faL].x = -0.9; T[B.head].x = Math.sin(this.t * 5) * 0.05; }
    if (p.wave) { T[B.uaR].x = -0.2; T[B.uaR].z = -2.5; T[B.faR].z = -0.3 + Math.sin(this.t * 9) * 0.45; }
    if (p.handsUp) { T[B.uaL].z = 2.6; T[B.uaR].z = -2.6; T[B.faL].z = 0.4; T[B.faR].z = -0.4; }
    if (p.cower) {
      hipsY = 0.55;
      for (const [th, sh, ft] of [[B.thL, B.shL, B.ftL], [B.thR, B.shR, B.ftR]]) { T[th].x = -1.6; T[sh].x = 2.1; T[ft].x = -0.5; }
      T[B.spine].x = 0.6; T[B.uaL].x = -2.5; T[B.uaR].x = -2.5; T[B.uaL].z = 0.6; T[B.uaR].z = -0.6; T[B.faL].x = -2.0; T[B.faR].x = -2.0;
    }
    if (p.aim) {
      T[B.uaR].x = -1.5; T[B.uaR].z = 0.05; T[B.faR].x = -0.05;
      T[B.uaL].x = -1.3; T[B.uaL].z = -0.45; T[B.faL].x = -0.5;
      T[B.chest].y = 0.25; T[B.head].y = -0.2;
    }
    if (p.punch) {
      const t = p.punch.t, L = p.punch.hand === 'L';
      const ua = L ? B.uaL : B.uaR, fa = L ? B.faL : B.faR, o = L ? B.uaR : B.uaL, ofa = L ? B.faR : B.faL;
      let ax, ex;
      if (t < 0.3) { const k = t / 0.3; ax = lerp(0, 0.5, k); ex = lerp(-0.3, -2.0, k); }
      else if (t < 0.55) { const k = (t - 0.3) / 0.25; ax = lerp(0.5, -1.55, k); ex = lerp(-2.0, -0.1, k); }
      else { const k = (t - 0.55) / 0.45; ax = lerp(-1.55, -0.6, k); ex = lerp(-0.1, -1.6, k); }
      T[ua].x = ax; T[fa].x = ex; T[ua].z = L ? -0.15 : 0.15;
      T[o].x = -0.9; T[ofa].x = -1.9; T[o].z = L ? -0.25 : 0.25;
      const tw = t < 0.3 ? -0.3 : t < 0.55 ? 0.45 : 0.2;
      T[B.chest].y = L ? -tw : tw; T[B.spine].y = (L ? -tw : tw) * 0.5;
      T[B.thL].x -= 0.25; T[B.thR].x += 0.25; T[B.shR].x += 0.2;
      if (p.punch.kick) { T[B.thR].x = t < 0.55 ? -1.6 * Math.sin((t / 0.55) * Math.PI * 0.5) : -1.6 * (1 - (t - 0.55) / 0.45); T[B.shR].x = t < 0.3 ? 1.6 : 0.2; }
    }
    if (p.stunned) { T[B.head].z = Math.sin(this.t * 4) * 0.25; T[B.spine].z = Math.sin(this.t * 2) * 0.12; T[B.uaL].z = 0.5; T[B.uaR].z = -0.5; }
    // knocked down: lay on back with limbs relaxed
    this.lie = damp(this.lie, p.knocked ? 1 : 0, 6, dt);
    if (this.lie > 0.01) {
      const k = this.lie;
      T[B.uaL].z = lerp(T[B.uaL].z, 1.2, k); T[B.uaR].z = lerp(T[B.uaR].z, -1.2, k);
      T[B.thL].z = lerp(T[B.thL].z, 0.15, k); T[B.thR].z = lerp(T[B.thR].z, -0.15, k);
      T[B.shL].x = lerp(T[B.shL].x, 0.3, k);
    }
    this.mesh.rotation.x = -this.lie * Math.PI / 2;
    this.mesh.position.y = this.lie * 0.12;
    this.mesh.position.z = -this.lie * 0.1;
    // apply with damping
    const lam = p.punch ? 30 : 16;
    for (let i = 0; i < this.bones.length; i++) {
      const b = this.bones[i].rotation, t = T[i];
      b.x = damp(b.x, t.x, lam, dt); b.y = damp(b.y, t.y, lam, dt); b.z = damp(b.z, t.z, lam, dt);
    }
    this.hipsY = damp(this.hipsY, hipsY, 14, dt);
    this.bones[B.hips].position.y = this.hipsY; this.bones[B.hips].position.z = damp(this.bones[B.hips].position.z, hipsZ, 10, dt);
  }
  /** World position of the right hand (for punches / effects). */
  handPos(out, left = false) { return this.bones[left ? B.haL : B.haR].getWorldPosition(out); }
  headPos(out) { return this.bones[B.head].getWorldPosition(out); }
  dispose() { this.mesh.geometry.dispose(); }
}
