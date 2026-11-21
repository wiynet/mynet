// Wanted/heat system: witnesses report crimes, patrol cars pursue using the road
// grid, officers chase on foot, escape by breaking line of sight; or get busted.
import * as THREE from 'three';
import { Vehicle } from './vehicle.js';
import { NPC } from './peds.js';
import { LINES } from '../world/layout.js';
import { clamp, angleDiff } from '../core/utils.js';

const COP_LOOK = { sex: 'm', skin: 0xd29f7a, hair: 'short', hairColor: 0x1a1410, top: 'long', topColor: 0x1d2a4a, innerColor: 0x1d2a4a, legs: 'pants', legColor: 0x141a2a, shoeColor: 0x111111, hat: 'cap', hatColor: 0x141a2a, height: 1.02, build: 1.08 };

export class Police {
  constructor(world) {
    this.world = world; this.heat = 0; this.cars = []; this.cops = [];
    this.lostTimer = 0; this.spawnT = 0; this.arrest = 0; this.seen = false; this.searchPos = new THREE.Vector3();
    this.lastCrime = 0;
  }
  get stars() { return Math.ceil(this.heat - 0.001); }
  crime(level, pos, witnessed = true) {
    if (!witnessed) return;
    const g = this.world.game;
    if (g.missions.noPolice) return;
    const before = this.stars;
    this.heat = clamp(Math.max(this.heat, Math.min(5, this.heat + level)), 0, 5);
    this.searchPos.copy(pos); this.lostTimer = 0; this.lastCrime = g.time;
    if (this.stars > before) { g.hud.flashStars(); if (before === 0) g.hud.notify('The police are after you. Break line of sight to escape.', 4); }
  }
  witnessed(pos, radius = 30) {
    for (const n of this.world.game.peds.list) if (!n.knocked && !n.inVehicle && n.role === 'ped' && Math.hypot(n.pos.x - pos.x, n.pos.z - pos.z) < radius) return true;
    for (const c of this.cops) if (Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z) < 50) return true;
    for (const v of this.cars) if (Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z) < 70) return true;
    return false;
  }
  arrestProgress(a) { this.arrest = Math.min(1, this.arrest + a); }
  clear() {
    this.heat = 0; this.arrest = 0;
    for (const v of this.cars) this.removeCar(v);
    for (const c of this.cops) this.world.game.peds.removeNPC(c);
    this.cars = []; this.cops = [];
  }
  removeCar(v) { const g = this.world.game; const i = g.vehicles.indexOf(v); if (i >= 0) g.vehicles.splice(i, 1); if (g.player.vehicle !== v) v.remove(); }

  spawnCar(pp) {
    // spawn on a road node 70-120m away, preferably behind the player
    let best = null;
    for (let t = 0; t < 20; t++) {
      const i = Math.floor(Math.random() * LINES.length), j = Math.floor(Math.random() * LINES.length);
      const x = LINES[i] + (Math.random() < 0.5 ? 1.9 : -1.9), z = LINES[j] + 20;
      const d = Math.hypot(x - pp.x, z - pp.z);
      if (d > 60 && d < 140) { best = { x, z }; break; }
    }
    if (!best) {
      // outside the grid (hills, beach): spawn along the player's path
      const a = Math.random() * Math.PI * 2; best = { x: pp.x + Math.cos(a) * 80, z: pp.z + Math.sin(a) * 80 };
    }
    const v = new Vehicle(this.world, 'police', 0xffffff, { x: best.x, z: best.z, heading: Math.atan2(pp.x - best.x, pp.z - best.z) });
    v.engineOn = true; v.siren = true; v.police = true; v.stuckT = 0; v.reverseT = 0;
    this.world.game.vehicles.push(v); this.cars.push(v);
    const cop = new NPC(this.world, { ...COP_LOOK, skin: [0xf5d7c4, 0xd29f7a, 0x8a5a3a][Math.floor(Math.random() * 3)] }, { role: 'cop', state: 'drive', tough: true, health: 120 });
    cop.inVehicle = v; v.npcDriver = cop; this.world.game.peds.list.push(cop);
    v.cop = cop;
  }
  /** Simple pursuit controller producing vehicle inputs. */
  steer(v, target, dt) {
    const dx = target.x - v.pos.x, dz = target.z - v.pos.z, d = Math.hypot(dx, dz);
    // navigate along the grid when far: aim at the next grid line crossing towards the target
    let tx = target.x, tz = target.z;
    const inGrid = Math.abs(v.pos.x) < 280 && Math.abs(v.pos.z) < 280;
    if (d > 45 && inGrid) {
      const nearX = LINES.reduce((a, b) => (Math.abs(b - v.pos.x) < Math.abs(a - v.pos.x) ? b : a));
      const nearZ = LINES.reduce((a, b) => (Math.abs(b - v.pos.z) < Math.abs(a - v.pos.z) ? b : a));
      const onX = Math.abs(v.pos.x - nearX) < 6, onZ = Math.abs(v.pos.z - nearZ) < 6;
      if (onX && (!onZ || Math.abs(dz) > Math.abs(dx))) { tx = nearX; tz = v.pos.z + Math.sign(dz) * 30; }
      else if (onZ) { tz = nearZ; tx = v.pos.x + Math.sign(dx) * 30; }
      else { tx = nearX; tz = v.pos.z; }
    }
    const want = Math.atan2(tx - v.pos.x, tz - v.pos.z);
    const diff = angleDiff(v.heading, want);
    const input = { throttle: 0, brake: 0, handbrake: 0, steer: clamp(-diff * 2, -1, 1) };
    const sp = v.forwardSpeed;
    if (v.reverseT > 0) { v.reverseT -= dt; input.brake = 1; input.steer = -input.steer; return input; }
    const pl = this.world.game.player;
    const close = d < 9 && pl.vehicle;
    let desired = close ? 3 : d < 20 ? 12 : 26;
    if (!pl.vehicle && d < 26) desired = Math.max(0, (d - 9) * 0.7); // pull over next to a suspect on foot
    if (sp < desired) input.throttle = Math.abs(diff) > 1.2 ? 0.5 : 1; else input.brake = 0.4;
    if (Math.abs(diff) > 1.1 && sp > 12) { input.brake = 0.6; input.throttle = 0; }
    if (Math.abs(sp) < 1 && input.throttle > 0) { v.stuckT += dt; if (v.stuckT > 1.6) { v.reverseT = 1.4; v.stuckT = 0; } } else v.stuckT = 0;
    return input;
  }

  update(dt) {
    const g = this.world.game, p = g.player, pp = p.position;
    if (p.busted || p.dead) return;
    const stars = this.stars;
    this.world.audio && (this.sirenLevel = 0);
    if (stars === 0) {
      // calm down leftovers
      for (const v of [...this.cars]) { if (Math.hypot(v.pos.x - pp.x, v.pos.z - pp.z) > 120) { this.removeCar(v); this.cars.splice(this.cars.indexOf(v), 1); if (v.cop) g.peds.removeNPC(v.cop); } else { v.siren = false; v.update(dt, { throttle: 0, brake: 1, handbrake: 0, steer: 0 }); } }
      for (const c of [...this.cops]) if (Math.hypot(c.pos.x - pp.x, c.pos.z - pp.z) > 80) { g.peds.removeNPC(c); this.cops.splice(this.cops.indexOf(c), 1); } else if (c.state === 'chase') { c.state = 'walk'; c.from = null; }
      this.arrest = Math.max(0, this.arrest - dt);
      return;
    }
    // spawn units
    const wantCars = Math.min(5, stars + (stars >= 3 ? 1 : 0));
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.cars.length < wantCars) { this.spawnT = 4; this.spawnCar(pp); }
    // visibility of player to any unit
    this.seen = false;
    const eye = new THREE.Vector3(pp.x, pp.y + 1.5, pp.z);
    for (const v of this.cars) if (Math.hypot(v.pos.x - pp.x, v.pos.z - pp.z) < 75 && this.world.collision.visible(v.pos.x, v.pos.y + 1.4, v.pos.z, eye.x, eye.y, eye.z)) this.seen = true;
    for (const c of this.cops) if (!c.knocked && Math.hypot(c.pos.x - pp.x, c.pos.z - pp.z) < 45 && this.world.collision.visible(c.pos.x, c.pos.y + 1.6, c.pos.z, eye.x, eye.y, eye.z)) this.seen = true;
    if (this.seen) { this.searchPos.copy(pp); this.lostTimer = 0; }
    else {
      this.lostTimer += dt;
      if (this.lostTimer > 7 + stars * 3) { this.heat = Math.max(0, this.heat - dt * 0.35); if (this.heat <= 0.001) { this.heat = 0; g.hud.notify('You lost the police.', 3); g.audio.pickup(); } }
    }
    const target = this.seen ? pp : this.searchPos;
    for (const v of this.cars) {
      if (g.player.vehicle === v) continue;
      if (v.cop && v.cop.inVehicle === v) {
        const input = v.dead ? { throttle: 0, brake: 1, handbrake: 1, steer: 0 } : this.steer(v, target, dt);
        v.update(dt, input); v.siren = !v.dead;
        // officers get out when the suspect is on foot nearby or car stopped
        const d = Math.hypot(v.pos.x - pp.x, v.pos.z - pp.z);
        if ((!p.vehicle && d < 16 && v.speed < 4) || (p.vehicle && p.vehicle.speed < 2 && d < 10 && v.speed < 3) || v.dead) {
          const cop = v.cop; cop.inVehicle = null; v.npcDriver = null; v.cop = null;
          v.doorPos(cop.pos); cop.state = 'chase'; cop.say(p.vehicle ? 'Out of the car, now!' : 'Freeze! Police!');
          this.cops.push(cop);
        }
      } else v.update(dt, null);
    }
    // arrest logic: a cop next to the player (on foot or in a stopped car)
    let near = false;
    for (const c of this.cops) {
      if (c.knocked || c.removed) continue;
      if (c.state !== 'chase' && c.state !== 'goto' && c.state !== 'knocked') c.state = 'chase';
      const d = Math.hypot(c.pos.x - pp.x, c.pos.z - pp.z);
      if (d < 1.8 && (!p.vehicle || p.vehicle.speed < 1.5)) near = true;
      // cops return to car when the player drives away far
      if (p.vehicle && d > 40 && c.state === 'chase') { const v = this.cars.find((x) => !x.cop && !x.dead); if (v) { c.state = 'goto'; c.target = { x: v.pos.x, z: v.pos.z, run: true, then: 'stand', cb: () => { if (!v.cop && !v.dead) { c.inVehicle = v; v.cop = c; v.npcDriver = c; this.cops.splice(this.cops.indexOf(c), 1); } } }; } }
    }
    if (near && p.vehicle) this.arrest += dt * 0.35;
    else if (near) this.arrest += dt * 0.12;
    else this.arrest = Math.max(0, this.arrest - dt * 0.2);
    if (this.arrest >= 1) { this.arrest = 0; g.busted(); }
  }
}
