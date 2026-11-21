// Player controller: walking/running/sprinting/crouching/jumping, melee combat
// (non-graphic), the stun gun, interactions and entering/exiting vehicles.
import * as THREE from 'three';
import { Humanoid } from './humanoid.js';
import { clamp, damp, dampAngle, angleDiff } from '../core/utils.js';
import { SEA_LEVEL, WORLD } from '../world/layout.js';

export const DEFAULT_LOOK = { sex: 'm', skin: 0xd29f7a, hair: 'short', hairColor: 0x1a1410, top: 'jacket', topColor: 0x1d2433, innerColor: 0xf2f2f2, legs: 'pants', legColor: 0x2a3a5a, shoeColor: 0xf0f0f0, hat: 'none', hatColor: 0x1a1a1e, height: 1.0, build: 1.0, glasses: false, bag: false };

export class Player {
  constructor(world, appearance = DEFAULT_LOOK) {
    this.world = world;
    this.h = new Humanoid({ ...appearance });
    world.scene.add(this.h.root);
    this.position = new THREE.Vector3(); this.vy = 0; this.heading = 0;
    this.vel = new THREE.Vector2(); this.speed = 0;
    this.health = 100; this.maxHealth = 100; this.stamina = 100;
    this.grounded = true; this.crouch = false; this.walkMode = false; this.sprinting = false;
    this.vehicle = null; this.entering = null;
    this.punchT = -1; this.combo = 0; this.comboT = 0; this.blocking = false; this.aiming = false;
    this.weapon = 'fists'; this.fireCD = 0;
    this.lastDamage = -99; this.dead = false; this.busted = false;
    this.anim = { speed: 0 };
    this.footPhase = 0; this.stepSide = 0;
    this.knockT = 0;
  }
  setAppearance(a) { this.h.build({ ...a }); }
  get onFoot() { return !this.vehicle && !this.entering; }

  update(dt, input, cam) {
    const g = this.world.game;
    if (this.dead || this.busted) { this.anim = { speed: 0, knocked: this.dead }; this.h.animate(dt, this.anim); this.sync(); return; }
    if (this.entering) return this.updateEntering(dt);
    if (this.vehicle) return this.updateDriving(dt, input);
    const A = this.anim; for (const k in A) A[k] = k === 'speed' ? 0 : null;
    // knocked (bailed out / hit by car)
    if (this.knockT > 0) {
      this.knockT -= dt; A.knocked = true;
      this.position.x += this.vel.x * dt; this.position.z += this.vel.y * dt; this.vel.multiplyScalar(1 - dt * 3);
      this.world.collision.resolveCylinder(this.position, 0.32, 0.6);
      this.ground(dt); this.h.animate(dt, A); this.sync(); return;
    }
    // --- movement input relative to camera
    const fwd = input.axis('KeyS', 'KeyW'), side = input.axis('KeyA', 'KeyD');
    const yaw = cam.yaw;
    const lx = Math.sin(yaw), lz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    let mx = lx * fwd + rx * side, mz = lz * fwd + rz * side;
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    if (input.pressed('KeyC')) { if (this.crouch) { if (this.world.collision.ceilingAt(this.position.x, this.position.z, this.position.y + 1.0) > this.position.y + 1.85) this.crouch = false; } else this.crouch = true; }
    if (input.pressed('CapsLock') || input.pressed('KeyZ')) { this.walkMode = !this.walkMode; g.hud.notify(this.walkMode ? 'Walk mode' : 'Run mode', 1.2); }
    const wantSprint = input.down('ShiftLeft') || input.down('ShiftRight');
    this.aiming = input.mouseDown(2) && this.weapon === 'stun';
    this.blocking = input.mouseDown(2) && this.weapon === 'fists';
    let target = this.walkMode ? 1.7 : 4.4;
    this.sprinting = false;
    if (wantSprint && ml > 0.1 && !this.crouch && this.stamina > 1 && !this.exhausted) { target = 7.4 * (g.buffs.energy > 0 ? 1.12 : 1); this.sprinting = true; }
    if (this.crouch) target = 1.4;
    if (this.aiming || this.blocking) target = Math.min(target, 2.2);
    if (this.punchT >= 0) target *= 0.3;
    // stamina
    if (this.sprinting) { this.stamina -= dt * (g.buffs.energy > 0 ? 6 : 16); if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; } }
    else { this.stamina = Math.min(100, this.stamina + dt * (ml > 0.1 ? 9 : 16)); if (this.stamina > 30) this.exhausted = false; }
    const accel = this.grounded ? 11 : 2.5;
    this.vel.x = damp(this.vel.x, mx * target * Math.min(1, ml), accel, dt);
    this.vel.y = damp(this.vel.y, mz * target * Math.min(1, ml), accel, dt);
    this.speed = this.vel.length();
    // facing
    if (this.aiming || this.blocking) this.heading = dampAngle(this.heading, yaw, 14, dt);
    else if (this.speed > 0.3) this.heading = dampAngle(this.heading, Math.atan2(this.vel.x, this.vel.y), 10, dt);
    // jump
    if (input.pressed('Space') && this.grounded && !this.crouch) { this.vy = 5.3; this.grounded = false; this.stamina = Math.max(0, this.stamina - 6); }
    this.position.x += this.vel.x * dt; this.position.z += this.vel.y * dt;
    const height = this.crouch ? 1.2 : 1.78;
    this.world.collision.resolveCylinder(this.position, 0.32, height);
    this.ground(dt);
    // world bounds & water
    this.position.x = clamp(this.position.x, WORLD.minX + 3, WORLD.maxX - 3); this.position.z = clamp(this.position.z, WORLD.minZ + 3, WORLD.maxZ - 3);
    if (this.position.y < SEA_LEVEL - 1.1) { this.position.z -= 6 * dt * 4; if (!this._swimMsg) { g.hud.notify("The water's too deep — head back to shore.", 2.5); this._swimMsg = true; setTimeout(() => (this._swimMsg = false), 4000); } }
    // footsteps
    if (this.grounded && this.speed > 0.5) {
      this.footPhase += dt * this.speed * 1.35;
      if (this.footPhase > 1) { this.footPhase = 0; this.world.audio.footstep(this.world.env.wetness > 0.3 && !g.indoors, this.crouch || this.speed < 2); }
    }
    // --- combat
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    this.fireCD -= dt;
    if (input.pressed('KeyQ')) this.cycleWeapon();
    if (input.mouseClicked(0) && !g.ui.anyOpen) {
      if (this.weapon === 'stun' && this.aiming) this.fireStun(cam);
      else if (this.weapon === 'stun' && !this.aiming) this.fireStun(cam, true);
      else if (this.punchT < 0) { this.punchT = 0; this.combo = (this.combo + 1) % 3; this.comboT = 1.0; this.hitDone = false; this.world.audio.whoosh(); }
    }
    if (this.punchT >= 0) {
      this.punchT += dt / (this.combo === 0 ? 0.6 : 0.42);
      A.punch = { t: Math.min(1, this.punchT), hand: this.combo === 1 ? 'L' : 'R', kick: this.combo === 0 };
      if (!this.hitDone && this.punchT > 0.45) { this.hitDone = true; this.meleeHit(this.combo === 0 ? 48 : 30); }
      if (this.punchT >= 1) this.punchT = -1;
    }
    // health regen
    if (g.time - this.lastDamage > 8 && this.health < 60) this.health = Math.min(60, this.health + dt * 1.5);
    // animation params
    A.speed = this.grounded ? this.speed : 0; A.crouch = this.crouch ? 1 : 0; A.air = !this.grounded && this.vy > -12;
    A.aim = this.aiming; if (this.blocking) { A.aim = false; A.cower = false; A.block = true; }
    this.h.animate(dt, A);
    if (this.blocking) { const b = this.h.bones; b[5].rotation.x = -1.9; b[8].rotation.x = -1.9; b[6].rotation.x = -1.9; b[9].rotation.x = -1.9; b[5].rotation.z = -0.3; b[8].rotation.z = 0.3; }
    this.sync();
  }
  ground(dt) {
    const col = this.world.collision;
    const gy = col.groundAt(this.position.x, this.position.z, this.position.y + 0.45, 0.22);
    if (this.position.y > gy + 0.02 || this.vy > 0) {
      this.vy -= 18 * dt; this.position.y += this.vy * dt;
      const ceil = col.ceilingAt(this.position.x, this.position.z, this.position.y + 0.5);
      if (this.position.y + 1.8 > ceil && this.vy > 0) { this.vy = 0; }
      if (this.position.y <= gy) {
        if (this.vy < -13) this.world.game.damagePlayer(Math.round((-this.vy - 13) * 9), null, 'fall');
        this.position.y = gy; this.vy = 0; this.grounded = true;
      } else this.grounded = this.position.y - gy < 0.08;
    } else {
      // step up / stick to ground smoothly
      this.position.y = damp(this.position.y, gy, 25, dt); if (Math.abs(this.position.y - gy) < 0.01) this.position.y = gy;
      this.grounded = true; this.vy = 0;
    }
  }
  sync() {
    this.h.root.position.copy(this.position); this.h.root.rotation.y = this.heading;
  }
  cycleWeapon() {
    const g = this.world.game;
    if (this.weapon === 'fists') {
      if (g.inventory.count('stungun') > 0) { this.weapon = 'stun'; g.hud.notify(`Stun gun equipped (${g.inventory.count('charges')} charges)`, 2); }
      else g.hud.notify('You don\'t have a stun gun. Buy one at QuikMart.', 2.5);
    } else { this.weapon = 'fists'; g.hud.notify('Fists', 1.2); }
    this.world.audio.click();
  }
  meleeHit(dmg) {
    const g = this.world.game, f = new THREE.Vector2(Math.sin(this.heading), Math.cos(this.heading));
    let best = null, bd = 1.7;
    for (const n of g.peds.list) {
      if (n.inVehicle || n.knocked || n.role === 'clerk') continue;
      const dx = n.pos.x - this.position.x, dz = n.pos.z - this.position.z, d = Math.hypot(dx, dz);
      if (d > bd || Math.abs(n.pos.y - this.position.y) > 1.2) continue;
      if ((dx * f.x + dz * f.y) / (d || 1) < 0.35) continue;
      best = n; bd = d;
    }
    if (!best) return;
    this.world.audio.punch();
    g.cameraShake(0.15);
    if (best.role === 'contact') { best.say('Whoa! Easy, friend.'); return; }
    best.hit(dmg, this.position, 'punch');
    if (best.role === 'ped' && best.state !== 'fight') {
      if (best.tough && !best.knocked) { best.state = 'fight'; best.timer = 20; }
      else if (!best.knocked) { best.state = 'flee'; best.timer = 8; best.threat = this.position.clone(); }
    }
    g.peds.alert(this.position, 22, 'attacked', best);
    if (best.role === 'ped' || best.role === 'cop') g.police.crime(best.role === 'cop' ? 2 : 1, this.position, best.role === 'cop' || g.police.witnessed(this.position));
  }
  fireStun(cam, hip = false) {
    const g = this.world.game;
    if (this.fireCD > 0) return;
    if (g.inventory.count('charges') <= 0) { g.hud.notify('Out of stun charges. Buy more at QuikMart.', 2); this.world.audio.click(); this.fireCD = 0.4; return; }
    this.fireCD = 0.7; g.inventory.remove('charges', 1);
    this.world.audio.zap();
    const origin = new THREE.Vector3(); this.h.handPos(origin);
    // aim along camera ray (or body facing when firing from the hip)
    const dir = hip ? new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)) : new THREE.Vector3(0, 0, -1).applyQuaternion(cam.camera.quaternion);
    const camPos = hip ? origin : cam.camera.position;
    let best = null, bs = Infinity;
    for (const n of g.peds.list) {
      if (n.inVehicle || n.role === 'clerk') continue;
      const c = new THREE.Vector3(n.pos.x, n.pos.y + 1.1, n.pos.z).sub(camPos);
      const t = c.dot(dir); if (t < 0.5 || t > 30) continue;
      const perp = c.clone().sub(dir.clone().multiplyScalar(t)).length();
      const tol = 0.7 + t * 0.04;
      if (perp < tol && t < bs && this.world.collision.visible(origin.x, origin.y, origin.z, n.pos.x, n.pos.y + 1.1, n.pos.z)) { best = n; bs = t; }
    }
    const end = best ? new THREE.Vector3(best.pos.x, best.pos.y + 1.1, best.pos.z) : origin.clone().add(dir.clone().multiplyScalar(25));
    g.effects.bolt(origin, end);
    if (best) {
      if (best.role === 'contact') { best.say('Hey! Not cool!'); return; }
      best.hit(100, this.position, 'zap');
      for (let i = 0; i < 6; i++) this.world.particles.emit('zap', end);
      if (best.role === 'ped' || best.role === 'cop') g.police.crime(best.role === 'cop' ? 2 : 1, this.position, best.role === 'cop' || g.police.witnessed(this.position));
    }
    g.peds.alert(this.position, 30, 'zap');
  }

  // ------------------------------------------------------------ vehicles
  tryEnterVehicle() {
    const g = this.world.game;
    let best = null, bd = 4.2;
    for (const v of g.vehicles) {
      const dp = v.doorPos(new THREE.Vector3());
      const d = Math.min(Math.hypot(dp.x - this.position.x, dp.z - this.position.z), Math.hypot(v.pos.x - this.position.x, v.pos.z - this.position.z) - 0.8);
      if (d < bd && Math.abs(v.pos.y - this.position.y) < 2) { bd = d; best = v; }
    }
    if (!best) return false;
    if (best.speed > 7) return false;
    this.entering = { v: best, t: 0, from: this.position.clone(), door: best.doorPos(new THREE.Vector3()) };
    this.crouch = false; this.punchT = -1; this.weapon = 'fists';
    // carjack
    if (best.ai) g.traffic.release(best.ai);
    if (best.npcDriver) {
      const d = best.npcDriver; best.npcDriver = null; d.inVehicle = null;
      best.doorPos(d.pos); d.pos.x += Math.random() - 0.5;
      if (best.police) { d.state = 'chase'; g.police.cops.push(d); best.cop = null; g.police.crime(2, this.position, true); }
      else { d.role = 'ped'; d.state = 'flee'; d.timer = 9; d.threat = this.position.clone(); d.say(['Hey! That\'s my car!', 'Help! Carjacker!', 'Not again!'][Math.floor(Math.random() * 3)]); g.police.crime(1, this.position, g.police.witnessed(this.position)); }
      g.peds.alert(this.position, 18, 'attacked', d);
    }
    best.vel.multiplyScalar(0.5);
    return true;
  }
  updateEntering(dt) {
    const e = this.entering; e.t += dt;
    const v = e.v;
    v.doorPos(e.door);
    const k = Math.min(1, e.t / 0.55);
    this.position.lerpVectors(e.from, e.door, k);
    this.heading = dampAngle(this.heading, v.heading + Math.PI * 0.5, 10, dt);
    this.anim = { speed: k < 1 ? 3 : 0 };
    this.h.animate(dt, this.anim); this.sync();
    if (e.t > 0.8) {
      this.entering = null; this.vehicle = v; v.driver = 'player'; v.engineOn = !v.dead && !v.sunk; v.mode = 'physics';
      this.world.audio.carDoor();
      this.world.game.onEnterVehicle(v);
    }
    return null;
  }
  exitVehicle() {
    const v = this.vehicle, g = this.world.game; if (!v) return;
    const spd = v.speed;
    const out = v.doorPos(new THREE.Vector3());
    // if the door side is blocked, use the passenger side
    const test = out.clone(); this.world.collision.resolveCylinder(test, 0.35, 1.7);
    if (test.distanceTo(out) > 0.3) { const c = Math.cos(v.heading), s = Math.sin(v.heading), lx = -(v.spec.wid / 2 + 0.7); out.set(v.pos.x + lx * c, v.pos.y, v.pos.z - lx * s); }
    this.position.copy(out); this.position.y = v.pos.y + 0.3; this.vy = 0;
    this.heading = v.heading - Math.PI / 2;
    v.driver = null; v.throttle = 0; v.brake = 0;
    if (!v.police) v.engineOn = false;
    this.vehicle = null;
    if (v.sunk) { // swim to shore
      this.position.z = Math.min(this.position.z, 302); this.position.y = this.world.collision.terrainHeight(this.position.x, this.position.z) + 0.1;
    }
    if (spd > 9) {
      this.knockT = 1.2; this.vel.set(v.vel.x * 0.5, v.vel.y * 0.5);
      g.damagePlayer(spd > 18 ? 15 : 5, null, 'bail');
    } else this.vel.set(0, 0);
    this.world.audio.carDoor();
    g.onExitVehicle(v);
  }
  updateDriving(dt, input) {
    const v = this.vehicle, g = this.world.game;
    const locked = g.ui.anyOpen;
    const ci = {
      throttle: locked ? 0 : (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0),
      brake: locked ? 0 : (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0),
      handbrake: !locked && input.down('Space') ? 1 : 0,
      steer: locked ? 0 : (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0),
    };
    if (!v.engineOn) { ci.throttle = 0; }
    v.update(dt, ci);
    if (input.pressed('KeyH')) { this.world.audio.horn(); g.peds.alert(v.pos, 10, 'horn'); }
    if (input.pressed('KeyL')) { v.lights = !v.lights; this.world.audio.click(); }
    if (v.police && input.pressed('KeyG')) { v.siren = !v.siren; }
    v.seatPos(this.position); this.heading = v.heading;
    this.anim = { speed: 0, drive: true, steer: v.steer };
    this.h.animate(dt, this.anim); this.sync();
    this.stamina = Math.min(100, this.stamina + dt * 15);
  }
}
