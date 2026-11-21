// Procedural car models + arcade-realistic driving physics (weight transfer,
// tire grip & drift, suspension, jumps, collisions and visible damage).
import * as THREE from 'three';
import { clamp, damp, lerp, angleDiff } from '../core/utils.js';
import { obbOverlap } from '../world/collision.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Merge a group's direct mesh children per material (fewer draw calls). */
function mergeChildren(parent, keep) {
  const buckets = new Map();
  for (const ch of [...parent.children]) {
    if (!ch.isMesh || keep.has(ch)) continue;
    ch.updateMatrix();
    const g = ch.geometry.clone().applyMatrix4(ch.matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.index) { const idx = []; for (let i = 0; i < g.attributes.position.count; i++) idx.push(i); g.setIndex(idx); }
    if (!buckets.has(ch.material)) buckets.set(ch.material, []);
    buckets.get(ch.material).push(g);
    parent.remove(ch); ch.geometry.dispose();
  }
  for (const [mtl, geos] of buckets) {
    const m = new THREE.Mesh(mergeGeometries(geos, false), mtl);
    m.castShadow = true; m.receiveShadow = true; parent.add(m);
    geos.forEach((g) => g.dispose());
  }
}
const wheelGeoCache = new Map();
function wheelGeos(wr) {
  if (wheelGeoCache.has(wr)) return wheelGeoCache.get(wr);
  const tire = new THREE.CylinderGeometry(wr, wr, 0.24, 18); tire.rotateZ(Math.PI / 2);
  const parts = [];
  const rim = new THREE.CylinderGeometry(wr * 0.66, wr * 0.66, 0.25, 10); rim.rotateZ(Math.PI / 2); parts.push(rim);
  for (let i = 0; i < 5; i++) { const sp = new THREE.BoxGeometry(0.26, wr * 1.1, 0.05); sp.rotateX((i / 5) * Math.PI); parts.push(sp); }
  for (const g of parts) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  const r = { tire, rim: mergeGeometries(parts, false) };
  r.tire.userData.shared = true; r.rim.userData.shared = true;
  wheelGeoCache.set(wr, r);
  return r;
}
import { SEA_LEVEL, WORLD } from '../world/layout.js';

export const CAR_TYPES = {
  compact: { name: 'Pico Hatch', len: 3.9, wid: 1.76, hgt: 1.48, wb: 2.45, mass: 1100, power: 7.5, top: 44, brake: 11, grip: 1.0, profile: 'hatch' },
  sedan: { name: 'Meridian Sedan', len: 4.75, wid: 1.86, hgt: 1.45, wb: 2.8, mass: 1450, power: 8.8, top: 52, brake: 12, grip: 1.0, profile: 'sedan' },
  sports: { name: 'Vento GT', len: 4.45, wid: 1.96, hgt: 1.22, wb: 2.62, mass: 1300, power: 13.5, top: 70, brake: 14, grip: 1.2, profile: 'coupe' },
  suv: { name: 'Sierra SUV', len: 4.85, wid: 1.98, hgt: 1.8, wb: 2.9, mass: 2000, power: 9.5, top: 48, brake: 11, grip: 0.95, profile: 'suv' },
  van: { name: 'Bayline Van', len: 5.2, wid: 2.0, hgt: 2.25, wb: 3.2, mass: 2400, power: 7.2, top: 40, brake: 10, grip: 0.9, profile: 'van' },
  taxi: { name: 'Solara Cab', len: 4.75, wid: 1.86, hgt: 1.45, wb: 2.8, mass: 1450, power: 9, top: 52, brake: 12, grip: 1.0, profile: 'sedan', taxi: true },
  police: { name: 'Interceptor', len: 4.9, wid: 1.9, hgt: 1.48, wb: 2.9, mass: 1600, power: 12, top: 64, brake: 14, grip: 1.15, profile: 'sedan', police: true },
};
export const PAINTS = [0xf4f4f4, 0x111214, 0x8a1a1a, 0x1a3a7a, 0x5a6066, 0xb8bcc4, 0x2a5a3a, 0xe0b020, 0x6a2a6a, 0xd8602a, 0x2a8aa8, 0x3a2a22];

const paintCache = new Map();
function paintMat(hex) {
  if (!paintCache.has(hex)) paintCache.set(hex, new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 }));
  return paintCache.get(hex);
}
const M = {};
function mats() {
  if (M.glass) return M;
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1218, metalness: 0.2, roughness: 0.04, transparent: true, opacity: 0.62, clearcoat: 1 });
  M.trim = new THREE.MeshStandardMaterial({ color: 0x151618, roughness: 0.6 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.12 });
  M.tire = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  M.rim = new THREE.MeshStandardMaterial({ color: 0xbfc4c8, metalness: 0.9, roughness: 0.25 });
  M.interior = new THREE.MeshStandardMaterial({ color: 0x1e1e22, roughness: 0.9 });
  M.headOff = new THREE.MeshStandardMaterial({ color: 0xe8eef4, emissive: 0xfff4e0, emissiveIntensity: 0.2, roughness: 0.1, metalness: 0.4 });
  M.headOn = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 6, roughness: 0.1 });
  M.tailOff = new THREE.MeshStandardMaterial({ color: 0x5a0a0a, emissive: 0xff1a0a, emissiveIntensity: 0.25, roughness: 0.2 });
  M.tailOn = new THREE.MeshStandardMaterial({ color: 0x8a1010, emissive: 0xff1a0a, emissiveIntensity: 1.6, roughness: 0.2 });
  M.tailBrake = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1a0a, emissiveIntensity: 5, roughness: 0.2 });
  M.plate = new THREE.MeshStandardMaterial({ color: 0xf2f2ea, roughness: 0.5 });
  M.sirenR = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff0000, emissiveIntensity: 0, roughness: 0.3 });
  M.sirenB = new THREE.MeshStandardMaterial({ color: 0x000040, emissive: 0x0040ff, emissiveIntensity: 0, roughness: 0.3 });
  M.taxiSign = new THREE.MeshStandardMaterial({ color: 0xfff4c0, emissive: 0xffd040, emissiveIntensity: 0.8 });
  M.decal = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.2 });
  return M;
}

/** Side profile (z forward, y up) per body style, in meters given len/hgt. */
function profile(t) {
  const L = t.len / 2, H = t.hgt;
  const P = {
    sedan: { lower: [[-L, 0.32], [-L, 0.78], [-L + 0.2, 0.92], [-L + 1.0, 0.98], [L - 1.2, 0.98], [L - 0.25, 0.82], [L, 0.66], [L, 0.32]], cabin: [[-L + 0.95, 0.96], [-L + 1.65, H - 0.04], [L - 2.0, H - 0.04], [L - 1.2, 0.96]] },
    hatch: { lower: [[-L, 0.34], [-L, 0.85], [-L + 0.1, 0.98], [L - 0.95, 0.98], [L - 0.2, 0.82], [L, 0.64], [L, 0.34]], cabin: [[-L + 0.12, 0.96], [-L + 0.3, H - 0.05], [L - 1.7, H - 0.05], [L - 0.95, 0.96]] },
    coupe: { lower: [[-L, 0.3], [-L, 0.72], [-L + 0.25, 0.82], [L - 1.25, 0.82], [L - 0.2, 0.66], [L, 0.52], [L, 0.3]], cabin: [[-L + 0.6, 0.8], [-L + 1.6, H - 0.03], [L - 2.05, H - 0.03], [L - 1.25, 0.8]] },
    suv: { lower: [[-L, 0.42], [-L, 1.02], [-L + 0.12, 1.12], [L - 1.05, 1.12], [L - 0.2, 1.0], [L, 0.82], [L, 0.42]], cabin: [[-L + 0.15, 1.1], [-L + 0.3, H - 0.05], [L - 1.75, H - 0.05], [L - 1.05, 1.1]] },
    van: { lower: [[-L, 0.4], [-L, 1.1], [L - 0.7, 1.1], [L - 0.1, 0.95], [L, 0.8], [L, 0.4]], cabin: [[-L + 0.05, 1.08], [-L + 0.05, H - 0.05], [L - 1.25, H - 0.05], [L - 0.7, 1.08]] },
  };
  return P[t.profile];
}
function extrude(points, width, bevel = 0.06) {
  const s = new THREE.Shape();
  points.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 2 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2); // shape x (length) -> world z
  g.computeVertexNormals();
  return g;
}

export function buildCarModel(type, color) {
  const t = CAR_TYPES[type], m = mats();
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const pr = profile(t);
  const paint = paintMat(t.police ? 0xf4f4f4 : t.taxi ? 0xf2c21a : color);
  const lower = new THREE.Mesh(extrude(pr.lower, t.wid, 0.1), paint);
  lower.castShadow = true; lower.receiveShadow = true; body.add(lower);
  const cabin = new THREE.Mesh(extrude(pr.cabin, t.wid - 0.22, 0.05), m.glass); body.add(cabin);
  // roof panel over glass
  const rz0 = pr.cabin[1][0], rz1 = pr.cabin[2][0];
  const roof = new THREE.Mesh(new THREE.BoxGeometry(t.wid - 0.26, 0.05, rz1 - rz0 + 0.04), paint);
  roof.position.set(0, t.hgt - 0.03, (rz0 + rz1) / 2); roof.castShadow = true; body.add(roof);
  // pillars
  const pil = (z0, y0, z1, y1) => {
    for (const s of [-1, 1]) {
      const len = Math.hypot(z1 - z0, y1 - y0);
      const g = new THREE.BoxGeometry(0.06, len, 0.08);
      const p = new THREE.Mesh(g, paint);
      p.position.set(s * (t.wid / 2 - 0.12), (y0 + y1) / 2, (z0 + z1) / 2);
      p.rotation.x = Math.atan2(z1 - z0, y1 - y0); body.add(p);
    }
  };
  const c = pr.cabin;
  pil(c[3][0], c[3][1], c[2][0], c[2][1]); // A
  pil(c[0][0], c[0][1], c[1][0], c[1][1]); // C
  pil((c[1][0] + c[2][0]) / 2 - 0.1, c[0][1], (c[1][0] + c[2][0]) / 2 - 0.1, t.hgt - 0.05); // B
  // bumpers, grille, lights
  const L = t.len / 2, W = t.wid / 2;
  const front = pr.lower[pr.lower.length - 2][1];
  const box = (sx, sy, sz, x, y, z, mtl, parent = body) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mtl); b.position.set(x, y, z); parent.add(b); return b; };
  box(t.wid - 0.05, 0.22, 0.2, 0, 0.36, L - 0.02, m.trim); box(t.wid - 0.05, 0.22, 0.2, 0, 0.38, -L + 0.02, m.trim);
  box(t.wid * 0.5, 0.16, 0.05, 0, front - 0.14, L + 0.01, m.trim);
  const heads = [], tails = [];
  for (const s of [-1, 1]) {
    heads.push(box(0.34, 0.11, 0.06, s * (W - 0.3), front - 0.06, L + 0.02, m.headOff));
    tails.push(box(0.36, 0.1, 0.05, s * (W - 0.28), pr.lower[1][1] - 0.12, -L - 0.01, m.tailOff));
    box(0.12, 0.08, 0.18, s * (W + 0.04), c[3][1] + 0.08, c[3][0] - 0.1, paint); // mirrors
  }
  box(0.42, 0.12, 0.02, 0, 0.42, L + 0.12, m.plate); box(0.42, 0.12, 0.02, 0, 0.5, -L - 0.12, m.plate);
  box(0.08, 0.08, 0.2, W - 0.4, 0.28, -L - 0.05, m.chrome);
  // interior: seats, dash, wheel
  const seatZ = (c[1][0] + c[2][0]) / 2 + 0.25;
  for (const s of [-1, 1]) { box(0.5, 0.12, 0.5, s * 0.38, 0.55, seatZ, m.interior); box(0.5, 0.6, 0.1, s * 0.38, 0.85, seatZ - 0.28, m.interior); }
  box(t.wid - 0.3, 0.5, 0.25, 0, 0.75, c[3][0] - 0.05, m.interior);
  if (t.profile !== 'van' && t.profile !== 'hatch' && t.profile !== 'suv') box(t.wid - 0.3, 0.3, 0.4, 0, 0.8, seatZ - 0.95, m.interior);
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 16), m.interior);
  sw.position.set(0.38, 0.95, c[3][0] - 0.3); sw.rotation.x = -0.4; body.add(sw);
  if (t.police) {
    const bar = new THREE.Group(); bar.position.set(0, t.hgt + 0.02, (rz0 + rz1) / 2); body.add(bar);
    box(1.2, 0.1, 0.3, 0, 0.05, 0, m.trim, bar);
    root.userData.sirenR = box(0.5, 0.12, 0.26, -0.3, 0.1, 0, m.sirenR.clone(), bar);
    root.userData.sirenB = box(0.5, 0.12, 0.26, 0.3, 0.1, 0, m.sirenB.clone(), bar);
    for (const s of [-1, 1]) box(0.02, 0.3, 1.6, s * (W + 0.005), 0.72, 0.1, new THREE.MeshStandardMaterial({ color: 0x1a2a6a, roughness: 0.4 }));
  }
  if (t.taxi) {
    const sg = box(0.6, 0.18, 0.25, 0, t.hgt + 0.1, (rz0 + rz1) / 2, m.taxiSign);
    root.userData.taxiSign = sg;
    for (const s of [-1, 1]) box(0.02, 0.12, 2.4, s * (W + 0.005), 0.78, 0, m.trim);
  }
  // wheels
  const wr = t.profile === 'suv' || t.profile === 'van' ? 0.4 : t.profile === 'coupe' ? 0.35 : 0.34;
  const wheels = [];
  const wbz = t.wb / 2;
  for (const [x, z, front] of [[W - 0.12, wbz, true], [-W + 0.12, wbz, true], [W - 0.12, -wbz, false], [-W + 0.12, -wbz, false]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, wr, z); root.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    const wg = wheelGeos(wr);
    const tire = new THREE.Mesh(wg.tire, m.tire); tire.castShadow = true; spin.add(tire);
    spin.add(new THREE.Mesh(wg.rim, m.rim));
    wheels.push({ pivot, spin, front, x, z, r: wr });
  }
  // wheel arches (dark) to hide gaps
  for (const wv of wheels) box(0.26, wr * 0.55, wr * 2.3, wv.x + Math.sign(wv.x) * 0.02, wr * 1.62, wv.z, m.trim);
  const keep = new Set([lower, cabin, ...heads, ...tails]);
  if (root.userData.taxiSign) keep.add(root.userData.taxiSign);
  mergeChildren(body, keep);
  root.userData.heads = heads; root.userData.tails = tails; root.userData.wheels = wheels; root.userData.body = body;
  root.userData.lower = lower;
  return root;
}

let uid = 1;
export class Vehicle {
  constructor(world, type = 'sedan', color = PAINTS[0], opts = {}) {
    this.id = uid++;
    this.world = world; this.type = type; this.spec = CAR_TYPES[type]; this.color = color;
    this.model = buildCarModel(type, color);
    // unique geometry for dents
    const lower = this.model.userData.lower; lower.geometry = lower.geometry.clone();
    this.wheels = this.model.userData.wheels; this.body = this.model.userData.body;
    world.scene.add(this.model);
    this.pos = new THREE.Vector3(opts.x || 0, opts.y || 0, opts.z || 0);
    this.heading = opts.heading || 0;
    this.vel = new THREE.Vector2(); this.vy = 0; this.yawRate = 0;
    this.steer = 0; this.throttle = 0; this.brake = 0; this.handbrake = 0;
    this.health = 1000; this.engineOn = false; this.dead = false;
    this.driver = null; this.mode = opts.mode || 'physics';
    this.lights = false; this.braking = false; this.siren = false; this.horn = 0;
    this.pitch = 0; this.roll = 0; this.pitchV = 0; this.rollV = 0;
    this.airborne = false; this.wheelSpin = 0; this.skid = 0; this.rpm = 0;
    this.lastHit = 0; this.smokeT = 0; this.sunk = false;
    this.persistent = !!opts.persistent; this.missionTag = opts.missionTag || null;
    this.ground(true);
    this.syncVisual(0);
  }
  get speed() { return this.vel.length(); }
  get forwardSpeed() { return this.vel.x * Math.sin(this.heading) + this.vel.y * Math.cos(this.heading); }
  obb() { return { x: this.pos.x, z: this.pos.z, hx: this.spec.wid / 2, hz: this.spec.len / 2, angle: this.heading }; }
  /** Door position (driver side = left, +x local). */
  doorPos(out = new THREE.Vector3()) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading), lx = this.spec.wid / 2 + 0.7, lz = 0.3;
    return out.set(this.pos.x + lx * c + lz * s, this.pos.y, this.pos.z - lx * s + lz * c);
  }
  seatPos(out = new THREE.Vector3()) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading), lx = 0.38, lz = 0.05;
    return out.set(this.pos.x + lx * c + lz * s, this.pos.y + 0.05, this.pos.z - lx * s + lz * c);
  }
  ground(snap = false) {
    const col = this.world.collision, h = this.heading, c = Math.cos(h), s = Math.sin(h);
    const hl = this.spec.wb / 2, hw = this.spec.wid / 2 - 0.15;
    const sample = (lx, lz) => col.driveHeight(this.pos.x + lx * c + lz * s, this.pos.z - lx * s + lz * c);
    const fl = sample(hw, hl), fr = sample(-hw, hl), rl = sample(hw, -hl), rr = sample(-hw, -hl);
    const g = (fl + fr + rl + rr) / 4;
    this.groundPitch = Math.atan2(((fl + fr) - (rl + rr)) / 2, this.spec.wb);
    this.groundRoll = Math.atan2(((fl + rl) - (fr + rr)) / 2, hw * 2);
    if (snap) { this.pos.y = g; this.vy = 0; }
    return g;
  }

  /** Physics step for player-driven / free vehicles. */
  update(dt, input) {
    const sp = this.spec;
    if (this.mode === 'ai') return; // traffic controller moves it
    const wet = this.world.env ? this.world.env.wetness : 0;
    if (input) {
      this.throttle = input.throttle; this.brake = input.brake; this.handbrake = input.handbrake;
      this.steer = damp(this.steer, input.steer, input.steer === 0 ? 6 : 4, dt);
    } else if (!this.driver) { this.throttle = 0; this.brake = 0; this.handbrake = 0.3; this.steer = damp(this.steer, 0, 3, dt); }
    if (this.dead || this.sunk) { this.throttle = 0; }
    const h = this.heading, fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
    let vF = this.vel.x * fx + this.vel.y * fz;
    let vL = this.vel.x * rx + this.vel.y * rz;
    const spd = Math.abs(vF);
    const maxSteer = lerp(0.6, 0.14, clamp(spd / sp.top, 0, 1) ** 0.7);
    const delta = -this.steer * maxSteer; // left positive
    let acc = 0;
    if (!this.airborne) {
      if (this.throttle > 0) {
        if (vF < -0.5) acc += sp.brake * this.throttle;
        else acc += this.throttle * sp.power * Math.max(0, 1 - (vF / sp.top) ** 2) * (this.health < 200 ? 0.5 : 1);
      }
      if (this.brake > 0) {
        if (vF > 0.5) acc -= sp.brake * this.brake;
        else acc -= this.brake * sp.power * 0.55 * Math.max(0, 1 - (-vF / 14) ** 2);
      }
      if (this.handbrake > 0) acc -= Math.sign(vF) * 5 * this.handbrake * Math.min(1, spd);
      acc -= vF * 0.08 + Math.sign(vF) * 0.25 * Math.min(1, spd) + vF * Math.abs(vF) * 0.0009;
      // slope
      acc -= Math.sin(this.groundPitch || 0) * 9.81 * 0.9;
      vF += acc * dt;
      if (Math.abs(vF) < 0.05 && this.throttle === 0 && this.brake === 0) vF = 0;
      // lateral grip
      const mu = sp.grip * (1 - wet * 0.28) * (this.handbrake > 0.5 ? 0.42 : 1);
      const maxLat = mu * 9.81 * 1.25;
      const latFix = clamp(vL * 10, -maxLat, maxLat) * dt;
      this.skid = clamp(Math.abs(vL) / 4 - 0.3, 0, 1) * (spd > 3 ? 1 : 0) + (this.handbrake > 0.5 && spd > 6 ? 0.6 : 0);
      if (Math.abs(latFix) > Math.abs(vL)) vL = 0; else vL -= latFix;
      // yaw
      const wKin = (vF * Math.tan(delta)) / sp.wb;
      const yawGrip = this.handbrake > 0.5 ? 2.2 : 9 * mu;
      this.yawRate += (wKin - this.yawRate) * Math.min(1, dt * yawGrip);
      if (this.handbrake > 0.5 && spd > 5) this.yawRate += delta * 1.6 * dt * Math.sign(vF);
    } else {
      this.yawRate *= 1 - dt * 0.5;
    }
    this.heading += this.yawRate * dt;
    // velocity stays in the old frame; the heading change becomes lateral slip next step
    this.vel.set(fx * vF + rx * vL, fz * vF + rz * vL);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.y * dt;
    // weight transfer visuals
    this.pitchV += (-acc * 0.012 - this.pitch) * 60 * dt - this.pitchV * 8 * dt;
    this.rollV += (vF * this.yawRate * 0.012 - this.roll) * 60 * dt - this.rollV * 8 * dt;
    this.pitch += this.pitchV * dt; this.roll += this.rollV * dt;
    this.pitch = clamp(this.pitch, -0.08, 0.08); this.roll = clamp(this.roll, -0.09, 0.09);
    // vertical
    const g = this.ground();
    if (this.airborne) {
      this.vy -= 9.81 * dt; this.pos.y += this.vy * dt;
      if (this.pos.y <= g) { this.pos.y = g; if (this.vy < -7) { this.damage(-this.vy * 10); this.world.audio.crash(0.4); } this.vy = 0; this.airborne = false; }
    } else if (g < this.pos.y - 0.15 && this.vy > -2) {
      this.airborne = true; this.pos.y += this.vy * dt; // ground fell away: fly off the crest
    } else {
      this.vy = clamp((g - this.pos.y) / Math.max(dt, 1e-3), -20, 9);
      this.pos.y = g;
    }
    // water
    if (this.pos.y < SEA_LEVEL - 0.6) {
      if (!this.sunk) { this.sunk = true; this.engineOn = false; this.world.particles.emit('splash', this.pos, null, 30); }
      this.vel.multiplyScalar(1 - dt * 2);
    }
    // bounds
    this.pos.x = clamp(this.pos.x, WORLD.minX + 5, WORLD.maxX - 5); this.pos.z = clamp(this.pos.z, WORLD.minZ + 5, WORLD.maxZ - 5);
    this.collideStatic();
    // rpm (fake gears)
    const sn = Math.abs(vF) / sp.top;
    const gear = Math.min(5, Math.floor(sn * 5.5));
    this.gear = vF < -0.5 ? 'R' : gear + 1;
    this.rpm = clamp((sn * 5.5 - gear) * 0.75 + 0.2 + this.throttle * 0.1, 0.1, 1);
    this.braking = this.brake > 0 && vF > 0.5;
    this.wheelSpin += (vF / this.wheels[0].r) * dt;
  }

  collideStatic() {
    const sp = this.spec, R = sp.len / 2 + 0.5;
    const list = this.world.collision.query(this.pos.x - R, this.pos.z - R, this.pos.x + R, this.pos.z + R, this._q || (this._q = []));
    const a = this.obb();
    for (const b of list) {
      if (b.low || b.maxY < this.pos.y + 0.35 || b.minY > this.pos.y + sp.hgt) continue;
      const bb = { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, hx: (b.maxX - b.minX) / 2, hz: (b.maxZ - b.minZ) / 2, angle: 0 };
      const hit = obbOverlap(a, bb);
      if (!hit) continue;
      this.pos.x += hit.nx * hit.depth; this.pos.z += hit.nz * hit.depth;
      a.x = this.pos.x; a.z = this.pos.z;
      const vn = this.vel.x * hit.nx + this.vel.y * hit.nz;
      if (vn < 0) {
        this.vel.x -= hit.nx * vn * 1.25; this.vel.y -= hit.nz * vn * 1.25;
        this.vel.multiplyScalar(0.85);
        this.yawRate *= 0.5;
        this.impact(-vn, hit.nx, hit.nz);
      }
    }
  }
  impact(speed, nx, nz) {
    const now = performance.now();
    if (speed > 3 && now - this.lastHit > 250) {
      this.lastHit = now;
      this.damage(speed * speed * 1.6, nx, nz);
      this.world.audio.crash(speed / 20);
      this.world.particles.emit('spark', this.pos.clone().add(new THREE.Vector3(-nx * 1.5, 0.5, -nz * 1.5)), null, Math.min(20, speed));
      if (this.driver === 'player') this.world.game.cameraShake(Math.min(1, speed / 15));
    }
  }
  damage(amount, nx = 0, nz = 0) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    // dent geometry near the impact side
    if (amount > 20 && (nx || nz)) {
      const g = this.model.userData.lower.geometry, p = g.attributes.position;
      const c = Math.cos(this.heading), s = Math.sin(this.heading);
      // impact direction into the car, in local frame
      const lx = -(nx * c - nz * s), lz = -(nx * s + nz * c);
      const sp = this.spec, ix = lx * sp.wid / 2, iz = lz * sp.len / 2;
      const strength = Math.min(0.18, amount / 900);
      for (let i = 0; i < p.count; i++) {
        const dx = p.getX(i) - ix, dz = p.getZ(i) - iz, d = Math.sqrt(dx * dx + dz * dz);
        if (d < 1.2) {
          const k = (1 - d / 1.2) * strength;
          p.setXYZ(i, p.getX(i) - lx * k, p.getY(i) - k * 0.3 * Math.random(), p.getZ(i) - lz * k);
        }
      }
      p.needsUpdate = true; g.computeVertexNormals();
    }
    if (this.health <= 0) { this.dead = true; this.engineOn = false; }
  }
  repair() {
    this.health = 1000; this.dead = false;
    const lower = this.model.userData.lower; lower.geometry.dispose();
    const fresh = buildCarModel(this.type, this.color).userData.lower.geometry;
    lower.geometry = fresh.clone();
  }
  syncVisual(dt) {
    const m = this.model;
    m.position.copy(this.pos);
    m.rotation.set(0, 0, 0); m.rotation.order = 'YXZ';
    m.rotation.y = this.heading;
    const gp = this.groundPitch || 0, gr = this.groundRoll || 0;
    m.rotation.x = -gp; m.rotation.z = gr;
    this.body.rotation.x = this.pitch; this.body.rotation.z = this.roll;
    this.body.position.y = 0.02 + Math.sin(performance.now() * 0.03) * (this.engineOn ? 0.002 : 0);
    for (const w of this.wheels) {
      w.spin.rotation.x = this.wheelSpin;
      if (w.front) w.pivot.rotation.y = -this.steer * 0.5;
    }
    // lights
    const night = this.world.env ? this.world.env.nightF > 0.3 || this.world.env.cur.overcast > 0.7 : false;
    const on = (this.engineOn || this.mode === 'ai') && (this.lights || night) && !this.dead;
    const u = m.userData, Ms = mats();
    for (const h of u.heads) h.material = on ? Ms.headOn : Ms.headOff;
    for (const t of u.tails) t.material = this.braking && (this.engineOn || this.mode === 'ai') ? Ms.tailBrake : on ? Ms.tailOn : Ms.tailOff;
    if (u.sirenR) {
      const t = performance.now() * 0.008;
      u.sirenR.material.emissiveIntensity = this.siren ? (Math.sin(t) > 0 ? 8 : 0) : 0;
      u.sirenB.material.emissiveIntensity = this.siren ? (Math.sin(t) <= 0 ? 8 : 0) : 0;
    }
    // damage smoke
    if (this.health < 400 && dt > 0) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = this.health < 150 ? 0.05 : 0.15;
        const c = Math.cos(this.heading), s = Math.sin(this.heading), lz = this.spec.len / 2 - 0.6;
        this.world.particles.emit('smoke', new THREE.Vector3(this.pos.x + lz * s, this.pos.y + 1.0, this.pos.z + lz * c), new THREE.Vector3(0, 0.5, 0));
      }
    }
    if (this.sunk) { m.position.y = Math.max(this.pos.y, SEA_LEVEL - 1.0); }
  }
  remove() {
    this.world.scene.remove(this.model);
    this.model.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  }
}

/** Resolve collisions between vehicles (momentum exchange). */
export function collideVehicles(list, onHit) {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z;
    if (dx * dx + dz * dz > 49) continue;
    if (Math.abs(a.pos.y - b.pos.y) > 2) continue;
    const hit = obbOverlap(a.obb(), b.obb());
    if (!hit) continue;
    const ma = a.spec.mass, mb = b.spec.mass, tot = ma + mb;
    const aStatic = a.mode === 'ai' && b.mode === 'ai';
    if (aStatic) { // AI vs AI: just separate
      a.pos.x += hit.nx * hit.depth * 0.5; a.pos.z += hit.nz * hit.depth * 0.5; b.pos.x -= hit.nx * hit.depth * 0.5; b.pos.z -= hit.nz * hit.depth * 0.5;
      continue;
    }
    a.pos.x += hit.nx * hit.depth * (mb / tot); a.pos.z += hit.nz * hit.depth * (mb / tot);
    b.pos.x -= hit.nx * hit.depth * (ma / tot); b.pos.z -= hit.nz * hit.depth * (ma / tot);
    const rv = (a.vel.x - b.vel.x) * hit.nx + (a.vel.y - b.vel.y) * hit.nz;
    if (rv < 0) {
      const jimp = (-(1.3) * rv) / (1 / ma + 1 / mb);
      a.vel.x += (jimp / ma) * hit.nx; a.vel.y += (jimp / ma) * hit.nz;
      b.vel.x -= (jimp / mb) * hit.nx; b.vel.y -= (jimp / mb) * hit.nz;
      a.yawRate += (Math.random() - 0.5) * Math.min(2, -rv * 0.08); b.yawRate += (Math.random() - 0.5) * Math.min(2, -rv * 0.08);
      a.impact(-rv * (mb / tot) * 1.4, hit.nx, hit.nz); b.impact(-rv * (ma / tot) * 1.4, -hit.nx, -hit.nz);
      if (onHit) onHit(a, b, -rv);
    }
  }
}
