// NPCs and city life: sidewalk graph, pedestrians with varied behaviors
// (walking, jogging, sitting, chatting, phone calls), reactions (flee, cower,
// fight back), drivers, clerks, mission contacts and enemies.
import * as THREE from 'three';
import { Humanoid, randomAppearance } from './humanoid.js';
import { LINES } from '../world/layout.js';
import { clamp, dampAngle, angleDiff, RNG, damp } from '../core/utils.js';

const N = LINES.length, SW = 8.75;
const LINES_BUMP = ['Hey! Watch it!', 'Excuse me?!', 'Rude.', 'Look where you\'re going!', 'Ow!', 'Seriously?'];
const LINES_FLEE = ['Help!', 'Somebody call the police!', 'Run!', 'Get away from me!', 'Are you crazy?!', 'Not today!'];
const LINES_FIGHT = ['You want some?', 'Bad idea, pal.', 'Come on then!', 'Big mistake!'];
const LINES_CHAT = ['...and then she said no!', 'Traffic is insane today.', 'Did you see the game?', 'This city never sleeps.', 'Rent went up again.', 'Love this weather.', 'I need a coffee.', 'Ha! No way.'];
const LINES_NICECAR = ['Nice ride!', 'Whoa, sweet car.', 'Slow down!'];

function nodeId(gi, gj, c) { return (gi * N + gj) * 4 + c; }
export function buildSidewalkGraph() {
  const nodes = [];
  for (let gi = 0; gi < N; gi++) for (let gj = 0; gj < N; gj++) for (let c = 0; c < 4; c++) {
    const sx = c & 1 ? 1 : -1, sz = c & 2 ? 1 : -1;
    nodes[nodeId(gi, gj, c)] = { id: nodeId(gi, gj, c), gi, gj, sx, sz, x: LINES[gi] + sx * SW, z: LINES[gj] + sz * SW, y: 0.15, edges: [] };
  }
  const cIdx = (sx, sz) => (sx > 0 ? 1 : 0) + (sz > 0 ? 2 : 0);
  for (const n of nodes) {
    const { gi, gj, sx, sz } = n;
    // sidewalk along x toward neighbor intersection in direction sx
    const ni = gi + sx; if (ni >= 0 && ni < N) n.edges.push({ to: nodeId(ni, gj, cIdx(-sx, sz)), cross: -1 });
    const nj = gj + sz; if (nj >= 0 && nj < N) n.edges.push({ to: nodeId(gi, nj, cIdx(sx, -sz)), cross: -1 });
    // crosswalks at this intersection: crossing the NS road (move along x) blocks axis 0; crossing EW road blocks axis 1
    n.edges.push({ to: nodeId(gi, gj, cIdx(-sx, sz)), cross: 0 });
    n.edges.push({ to: nodeId(gi, gj, cIdx(sx, -sz)), cross: 1 });
  }
  return nodes;
}

export class NPC {
  constructor(world, appearance, opts = {}) {
    this.world = world;
    this.h = new Humanoid(appearance || randomAppearance());
    world.scene.add(this.h.root);
    this.pos = new THREE.Vector3(opts.x || 0, opts.y || 0.15, opts.z || 0);
    this.heading = opts.heading || 0;
    this.role = opts.role || 'ped';
    this.state = opts.state || 'walk';
    this.timer = 0; this.speed = 0; this.walkSpeed = 1.15 + Math.random() * 0.45;
    this.health = opts.health || 100; this.maxHealth = this.health;
    this.offset = (Math.random() - 0.5) * 1.6;
    this.anim = { speed: 0 };
    this.tough = opts.tough != null ? opts.tough : Math.random() < 0.12;
    this.name = opts.name || null;
    this.attackT = 0; this.fear = 0; this.knocked = false; this.stunned = 0;
    this.vel = new THREE.Vector3(); this.airV = 0;
    this.persistent = !!opts.persistent;
    this.talkT = 0; this.sayT = 0; this.punchT = -1; this.punchHand = 'R';
    this.lastBump = 0; this.target = null;
    this.home = opts.home || null; this.onDefeat = opts.onDefeat || null;
  }
  say(text, dur = 2.2) { if (this.sayT <= 0) { this.world.game.hud.bubble(this, text, dur); this.sayT = dur + 1.5; } }
  setPos(x, y, z) { this.pos.set(x, y, z); }
  get alive() { return !this.removed; }
  /** Non-graphic takedown: falls, lies dizzy, gets back up. */
  knockDown(dur = 4, from = null) {
    if (this.knocked) { this.timer = Math.max(this.timer, dur * 0.5); return; }
    this.knocked = true; this.state = 'knocked'; this.timer = dur;
    if (from) { const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1; this.vel.set(dx / d * 3, 0, dz / d * 3); this.heading = Math.atan2(-dx, -dz); }
    this.world.audio.punch();
  }
  hit(dmg, from, kind = 'punch') {
    this.health -= dmg;
    this.world.particles.emit('impact', this.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), null, 1);
    if (kind === 'zap') { this.knockDown(5.5, from); this.health = Math.max(this.health, 1); this.stunned = 6; }
    else if (this.health <= 0) { this.knockDown(this.role === 'thug' || this.role === 'cop' ? 9 : 6, from); this.stunned = 9; if (this.onDefeat) { const f = this.onDefeat; this.onDefeat = null; f(this); } }
    else { this.vel.set(from ? (this.pos.x - from.x) * 1.5 : 0, 0, from ? (this.pos.z - from.z) * 1.5 : 0); this.stagger = 0.35; }
  }
  remove() { this.removed = true; this.world.scene.remove(this.h.root); this.h.dispose(); }
}

export class Pedestrians {
  constructor(world) {
    this.world = world; this.list = []; this.graph = buildSidewalkGraph();
    this.density = 34; this.spawnTimer = 0; this.rng = new RNG(7);
    this.loiterSpots = [];
    for (const [x0, x1, z] of [[-265, -95, -171.3], [-265, -95, -188.7], [-175, 175, 8.6], [-175, 175, -8.6], [-85, 85, -98.6], [190, 265, 261], [-265, 265, 280.5]]) {
      for (let x = x0; x < x1; x += 7 + Math.random() * 10) this.loiterSpots.push({ x, z, heading: z > 0 ? (z > 270 ? 0 : Math.PI) : 0 });
    }
  }
  /** True if a world point is behind the camera (safe to pop NPCs in). */
  behind(x, z) {
    const cam = this.world.game.camera, e = cam.matrixWorld.elements;
    return (x - cam.position.x) * -e[8] + (z - cam.position.z) * -e[10] < -4;
  }
  nearestNode(x, z) {
    let best = null, bd = Infinity;
    for (const n of this.graph) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } }
    return best;
  }
  add(npc) { this.list.push(npc); return npc; }
  removeNPC(n) { const i = this.list.indexOf(n); if (i >= 0) this.list.splice(i, 1); n.remove(); }
  makeDriver(veh) {
    const n = new NPC(this.world, randomAppearance(), { role: 'driver', state: 'drive' });
    n.inVehicle = veh; veh.npcDriver = n; this.list.push(n); return n;
  }
  spawnPed(focus, near) {
    const g = this.world.game;
    for (let tries = 0; tries < 10; tries++) {
      const r = this.rng.next();
      if (r < 0.14 && this.world.benches.length) {
        const nb = this.world.benches.filter((x) => !x.taken && Math.abs(x.x - focus.x) < 85 && Math.abs(x.z - focus.z) < 85);
        if (!nb.length) continue;
        const b = nb[Math.floor(this.rng.next() * nb.length)];
        if (b.taken) continue;
        const d = Math.hypot(b.x - focus.x, b.z - focus.z); if (d > 85 || d < 12 || (!near && d < 35 && !this.behind(b.x, b.z))) continue;
        const n = new NPC(this.world, null, { x: b.x, z: b.z, y: b.y || 0.15, heading: b.rot, state: 'sit' });
        n.bench = b; b.taken = true; n.timer = 20 + this.rng.next() * 40; return this.add(n);
      }
      if (r < 0.32) {
        const ns = this.loiterSpots.filter((x) => Math.abs(x.x - focus.x) < 85 && Math.abs(x.z - focus.z) < 85);
        if (!ns.length) continue;
        const s = ns[Math.floor(this.rng.next() * ns.length)];
        const d = Math.hypot(s.x - focus.x, s.z - focus.z); if (d > 85 || d < 12 || (!near && d < 35 && !this.behind(s.x, s.z))) continue;
        const n = new NPC(this.world, null, { x: s.x, z: s.z, heading: s.heading, state: 'idle' });
        n.idleKind = this.rng.pick(['phone', 'look', 'talk', 'talk', 'look']); n.timer = 10 + this.rng.next() * 30;
        this.add(n);
        if (n.idleKind === 'talk') {
          const m = new NPC(this.world, null, { x: s.x + Math.sin(s.heading + 1.2) * 1.2, z: s.z + Math.cos(s.heading + 1.2) * 1.2, state: 'idle' });
          m.idleKind = 'talk'; m.timer = n.timer; m.partner = n; n.partner = m;
          n.heading = Math.atan2(m.pos.x - n.pos.x, m.pos.z - n.pos.z); m.heading = n.heading + Math.PI;
          this.add(m);
        }
        return n;
      }
      const nearNodes = this._nearNodes && this._nearKey === Math.round(focus.x / 20) + ',' + Math.round(focus.z / 20) ? this._nearNodes
        : (this._nearKey = Math.round(focus.x / 20) + ',' + Math.round(focus.z / 20), this._nearNodes = this.graph.filter((n) => Math.hypot(n.x - focus.x, n.z - focus.z) < 110));
      if (!nearNodes.length) return null;
      const node = nearNodes[Math.floor(this.rng.next() * nearNodes.length)];
      const e = node.edges.filter((x) => x.cross < 0); if (!e.length) continue;
      const to = this.graph[e[Math.floor(this.rng.next() * e.length)].to];
      const t = this.rng.next();
      const x = node.x + (to.x - node.x) * t, z = node.z + (to.z - node.z) * t;
      const d = Math.hypot(x - focus.x, z - focus.z);
      if (d > 85 || d < 15 || (!near && d < 45 && !this.behind(x, z))) continue;
      const n = new NPC(this.world, null, { x, z, state: 'walk' });
      n.from = node; n.to = to; n.t = t;
      if (this.rng.next() < 0.1) { n.state = 'walk'; n.jogger = true; n.walkSpeed = 2.8; }
      return this.add(n);
    }
    return null;
  }

  update(dt, focus) {
    const g = this.world.game;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.35;
      const count = this.list.filter((n) => n.role === 'ped').length;
      const target = Math.round(this.density * (g.inCity ? 1 : 0.15) * (this.world.env.cur.rain > 0.5 ? 0.6 : 1) * (this.world.env.nightF > 0.5 ? 0.7 : 1));
      if (count < target) { this.spawnPed(focus, g.time < 3 || count < target * 0.5); if (count < target * 0.7) this.spawnPed(focus, g.time < 3); }
      for (const n of [...this.list]) {
        if (n.role !== 'ped' || n.persistent) continue;
        const d = Math.hypot(n.pos.x - focus.x, n.pos.z - focus.z);
        if (d > 115 || (count > target + 5 && d > 80)) { if (n.bench) n.bench.taken = false; this.removeNPC(n); }
      }
    }
    for (const n of this.list) this.updateNPC(n, dt, focus);
    // separation
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i]; if (a.inVehicle || a.state === 'sit') continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j]; if (b.inVehicle || b.state === 'sit') continue;
        const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.5 && d2 > 1e-6) { const d = Math.sqrt(d2), p = (0.71 - d) * 0.5; a.pos.x += dx / d * p; a.pos.z += dz / d * p; b.pos.x -= dx / d * p; b.pos.z -= dz / d * p; }
      }
    }
  }

  /** React to a disturbance at pos (punch, zap, crash, gunfire-like noise). */
  alert(pos, radius, kind, source = null) {
    for (const n of this.list) {
      if (n === source || n.inVehicle || n.knocked) continue;
      if (n.role === 'clerk' || n.role === 'contact' || n.role === 'cop' || n.role === 'thug') continue;
      const d = Math.hypot(n.pos.x - pos.x, n.pos.z - pos.z);
      if (d > radius) continue;
      n.threat = pos.clone();
      if (n.tough && d < 6 && kind === 'attacked') { n.state = 'fight'; n.timer = 20; n.say(LINES_FIGHT[Math.floor(Math.random() * LINES_FIGHT.length)]); continue; }
      if (n.state === 'flee' || n.state === 'cower') { n.timer = Math.max(n.timer, 6); continue; }
      if (n.state === 'sit' && n.bench) n.bench.taken = false;
      if (Math.random() < (kind === 'zap' ? 0.4 : 0.2) && d < 12) { n.state = 'cower'; n.timer = 3 + Math.random() * 3; }
      else { n.state = 'flee'; n.timer = 7 + Math.random() * 5; n.from = null; }
      if (Math.random() < 0.5) n.say(LINES_FLEE[Math.floor(Math.random() * LINES_FLEE.length)]);
      if (Math.random() < 0.3) this.world.audio.scream();
    }
  }

  moveToward(n, tx, tz, speed, dt, collide = true) {
    const dx = tx - n.pos.x, dz = tz - n.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { n.speed = damp(n.speed, 0, 8, dt); return d; }
    n.heading = dampAngle(n.heading, Math.atan2(dx, dz), 8, dt);
    n.speed = damp(n.speed, speed, 5, dt);
    const step = Math.min(d, n.speed * dt);
    n.pos.x += Math.sin(n.heading) * step; n.pos.z += Math.cos(n.heading) * step;
    if (collide) this.world.collision.resolveCylinder(n.pos, 0.3, 1.7);
    return d;
  }

  updateNPC(n, dt, focus) {
    const g = this.world.game, p = g.player;
    const distP = Math.hypot(n.pos.x - focus.x, n.pos.z - focus.z);
    n.sayT -= dt;
    const A = n.anim; A.speed = 0; A.sit = false; A.phone = false; A.talk = false; A.cower = false; A.handsUp = false; A.knocked = false; A.punch = null; A.stunned = false; A.drive = false; A.wave = false; A.crouch = 0;
    // drivers ride along
    if (n.inVehicle) {
      const v = n.inVehicle;
      if (v.removed) return;
      v.seatPos(n.pos); n.heading = v.heading; A.drive = true; A.steer = v.steer;
      n.h.root.visible = distP < 80;
      this.finish(n, dt, distP, v);
      return;
    }
    if (n.stagger > 0) { n.stagger -= dt; n.pos.x += n.vel.x * dt; n.pos.z += n.vel.z * dt; this.world.collision.resolveCylinder(n.pos, 0.3, 1.7); }
    switch (n.state) {
      case 'walk': this.walk(n, dt); break;
      case 'sit': A.sit = true; n.timer -= dt; if (n.timer <= 0) { n.bench.taken = false; n.state = 'walk'; n.from = null; } break;
      case 'idle':
        n.timer -= dt; n.speed = 0;
        if (n.idleKind === 'phone') A.phone = true;
        if (n.idleKind === 'talk' && n.partner && !n.partner.removed) { A.talk = Math.sin(n.h.t * 0.7 + (n.partner.id || 0)) > 0; if (Math.random() < 0.002 && distP < 15) n.say(LINES_CHAT[Math.floor(Math.random() * LINES_CHAT.length)]); }
        if (n.timer <= 0) { n.state = 'walk'; n.from = null; n.partner = null; }
        break;
      case 'flee': {
        n.timer -= dt;
        const th = n.threat || focus;
        if (!n.from || !n.to || n.t >= 1) {
          const at = n.to || this.nearestNode(n.pos.x, n.pos.z);
          n.from = { x: n.pos.x, z: n.pos.z };
          let best = null, bd = -1;
          for (const e of at.edges) { const m = this.graph[e.to]; const d = Math.hypot(m.x - th.x, m.z - th.z); if (d > bd) { bd = d; best = m; } }
          const dHere = Math.hypot(at.x - th.x, at.z - th.z), dPos = Math.hypot(n.pos.x - th.x, n.pos.z - th.z);
          n.to = dHere > dPos ? at : best; n.t = 0;
        }
        const d = this.moveToward(n, n.to.x + n.offset * 0.5, n.to.z, 5.2, dt);
        if (d < 0.6) n.t = 1;
        A.speed = n.speed;
        if (n.timer <= 0) { n.state = 'walk'; n.from = null; n.threat = null; }
        break;
      }
      case 'cower': A.cower = true; n.timer -= dt; n.speed = 0; if (n.timer <= 0) { n.state = 'flee'; n.timer = 6; n.from = null; } break;
      case 'knocked':
        A.knocked = true; n.timer -= dt; n.speed = 0;
        n.pos.x += n.vel.x * dt; n.pos.z += n.vel.z * dt; n.vel.multiplyScalar(1 - dt * 4);
        this.world.collision.resolveCylinder(n.pos, 0.3, 0.6);
        if (n.stunned > 0 && Math.random() < 0.15) { const hp = n.pos.clone(); hp.x += Math.cos(n.h.t * 5) * 0.3; hp.z += Math.sin(n.h.t * 5) * 0.3 - 1.4 * Math.cos(n.heading); hp.y += 0.35; this.world.particles.emit('star', hp); }
        if (n.timer <= 0) {
          n.knocked = false; n.stunned = 0;
          if (n.role === 'thug') { n.state = 'flee'; n.timer = 15; n.health = 30; n.defeated = true; n.say('Okay, okay! I\'m out!'); }
          else if (n.role === 'cop') { n.state = 'chase'; n.health = 60; }
          else { n.state = 'flee'; n.timer = 8; n.from = null; n.health = Math.max(n.health, 40); n.threat = p.position.clone(); }
        }
        break;
      case 'fight': case 'thug': case 'chase': this.combat(n, dt, focus); break;
      case 'stand': n.speed = 0; if (n.role === 'contact') A.talk = n.talking; if (n.role === 'clerk' && Math.random() < 0.001) n.heading += (Math.random() - 0.5); break;
      case 'goto': {
        const d = this.moveToward(n, n.target.x, n.target.z, n.target.run ? 4.5 : n.walkSpeed, dt);
        A.speed = n.speed; if (d < 0.5) { n.state = n.target.then || 'stand'; if (n.target.cb) n.target.cb(n); }
        break;
      }
    }
    // being bumped by player on foot
    if (!p.vehicle && !n.knocked && n.state !== 'sit') {
      const dx = n.pos.x - p.position.x, dz = n.pos.z - p.position.z, d = Math.hypot(dx, dz);
      if (d < 0.65 && d > 0.001 && Math.abs(n.pos.y - p.position.y) < 1) {
        const push = 0.65 - d; n.pos.x += dx / d * push; n.pos.z += dz / d * push;
        if (performance.now() - n.lastBump > 3000 && (n.role === 'ped') && p.speed > 1) {
          n.lastBump = performance.now(); n.say(LINES_BUMP[Math.floor(Math.random() * LINES_BUMP.length)]);
          if (p.speed > 5) { n.stagger = 0.3; n.vel.set(dx / d * 2, 0, dz / d * 2); }
          n.heading = Math.atan2(-dx, -dz);
        }
      }
    }
    // comment on player's sports car
    if (p.vehicle && n.role === 'ped' && n.state === 'walk' && distP < 7 && p.vehicle.type === 'sports' && Math.random() < 0.004) n.say(LINES_NICECAR[Math.floor(Math.random() * LINES_NICECAR.length)]);
    this.finish(n, dt, distP);
  }
  finish(n, dt, distP, veh) {
    // ground + visuals
    if (!n.inVehicle) {
      const gy = this.world.collision.groundAt(n.pos.x, n.pos.z, n.pos.y + 0.5, 0.15);
      n.pos.y = damp(n.pos.y, gy, 20, dt);
    }
    const r = n.h.root;
    r.position.copy(n.pos); r.rotation.y = n.heading;
    const vis = distP < 130;
    r.visible = n.inVehicle ? distP < 80 : vis;
    if (n.punchT >= 0) { n.punchT += dt / 0.5; n.anim.punch = { t: Math.min(1, n.punchT), hand: n.punchHand }; if (n.punchT >= 1) n.punchT = -1; }
    if (vis) {
      // animate less often far away
      n.animAcc = (n.animAcc || 0) + dt;
      const interval = distP < 35 ? 0 : distP < 70 ? 1 / 30 : 1 / 15;
      if (n.animAcc >= interval) { n.h.animate(n.animAcc, n.anim); n.animAcc = 0; }
      n.h.mesh.castShadow = distP < 40;
    }
  }

  walk(n, dt) {
    const L = this.world.game.lights;
    if (!n.to) {
      const node = this.nearestNode(n.pos.x, n.pos.z);
      n.from = { x: n.pos.x, z: n.pos.z, edges: node.edges, id: -1 }; n.to = node; n.waitCross = null;
    }
    const tx = n.to.x + (n.crossing ? 0 : n.offset * 0.6), tz = n.to.z + (n.crossing ? 0 : n.offset * 0.6);
    const sp = n.crossing ? n.walkSpeed * 1.3 : n.walkSpeed;
    if (n.waitCross) {
      // waiting at the curb for the signal
      const st = L.state(L.groupAt(n.waitCross.gi, n.waitCross.gj), n.waitCross.axis);
      n.speed = damp(n.speed, 0, 6, dt);
      if (st === 'red') { n.crossing = true; n.to = n.waitCross.to; n.waitCross = null; }
      if (Math.random() < 0.003) n.anim.phone = true;
      return;
    }
    const d = this.moveToward(n, tx, tz, sp, dt, false);
    n.anim.speed = n.speed;
    if (d < 0.5) {
      // choose next edge
      const at = n.to; n.crossing = false;
      const opts = at.edges.filter((e) => e.to !== (n.from && n.from.id));
      const e = opts.length ? opts[Math.floor(Math.random() * opts.length)] : at.edges[0];
      n.from = at; const next = this.graph[e.to];
      if (e.cross >= 0 && Math.random() < 0.85) {
        n.waitCross = { gi: at.gi, gj: at.gj, axis: e.cross, to: next };
        n.heading = Math.atan2(next.x - at.x, next.z - at.z);
      } else if (e.cross >= 0) {
        // jaywalker / skip crossing -> turn along sidewalk instead
        const side = at.edges.find((x) => x.cross < 0);
        n.to = this.graph[(side || e).to];
      } else n.to = next;
    }
  }

  /** Melee AI for tough peds, thugs and police officers. */
  combat(n, dt, focus) {
    const g = this.world.game, p = g.player;
    const A = n.anim;
    if (n.state === 'fight') { n.timer -= dt; if (n.timer <= 0 || Math.hypot(n.pos.x - p.position.x, n.pos.z - p.position.z) > 30) { n.state = 'walk'; n.from = null; return; } }
    if (p.dead || p.busted) { n.speed = 0; return; }
    const tx = p.position.x, tz = p.position.z;
    const d = Math.hypot(tx - n.pos.x, tz - n.pos.z);
    if (p.vehicle) {
      // can't reach: stand and shout, cops will be handled by police system
      if (d > 3) this.moveToward(n, tx, tz, n.role === 'cop' ? 4.6 : 3.5, dt); else n.speed = 0;
      A.speed = n.speed; if (Math.random() < 0.005) n.say(n.role === 'cop' ? 'Step out of the vehicle!' : 'Get out here!');
      return;
    }
    if (d > 1.25) { this.moveToward(n, tx, tz, d > 6 ? 4.6 : 2.6, dt); A.speed = n.speed; }
    else {
      n.speed = 0; n.heading = dampAngle(n.heading, Math.atan2(tx - n.pos.x, tz - n.pos.z), 10, dt);
      n.attackT -= dt;
      if (n.attackT <= 0 && n.punchT < 0) {
        n.attackT = n.role === 'cop' ? 1.1 : 0.9 + Math.random() * 0.8;
        n.punchT = 0; n.punchHand = Math.random() < 0.5 ? 'L' : 'R';
        setTimeout(() => {
          if (n.removed || n.knocked) return;
          const dd = Math.hypot(p.position.x - n.pos.x, p.position.z - n.pos.z);
          if (dd < 1.6 && !p.vehicle) {
            if (p.blocking) { this.world.audio.whoosh(); return; }
            g.damagePlayer(n.role === 'thug' ? 8 : n.role === 'cop' ? 4 : 6, n.pos);
            if (n.role === 'cop') g.police.arrestProgress(0.25);
          } else this.world.audio.whoosh();
        }, 220);
      }
    }
  }
}
