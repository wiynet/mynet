// Third-person camera rig: behind-and-above follow cam on foot, over-the-shoulder
// aim, chase cam for vehicles (auto-centering, speed FOV), collision, shake and
// scripted cinematic shots.
import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp, angleDiff } from './utils.js';

export class CameraRig {
  constructor(camera, world) {
    this.camera = camera; this.world = world;
    this.yaw = Math.PI; this.pitch = 0.18; this.dist = 3.8; this.distIdx = 1;
    this.sens = 1; this.invertY = false; this.baseFov = 62; this.shakeAmt = 0; this.shakeEnabled = true;
    this.curDist = 3.8; this.lastMouse = -10; this.cine = null;
    this.target = new THREE.Vector3(); this.pos = new THREE.Vector3(); this.inited = false;
    this.vehDist = [6.2, 8, 11];
  }
  shake(a) { if (this.shakeEnabled) this.shakeAmt = Math.min(1.2, this.shakeAmt + a); }
  cycleDistance() { this.distIdx = (this.distIdx + 1) % 3; }
  /** Play a scripted shot: {from:Vector3, to:Vector3, look:Vector3, lookTo?, dur} */
  cinematic(shot) { this.cine = { ...shot, t: 0 }; }
  /** Skip the current shot and any shots it chains into. */
  skipCinematic() { let guard = 8; while (this.cine && guard--) { const c = this.cine; this.cine = null; if (c.done) c.done(); } }

  update(dt, input, player, time) {
    const cam = this.camera, col = this.world.collision;
    // mouse look
    const mdx = input.mouseDX, mdy = input.mouseDY;
    if (mdx || mdy) this.lastMouse = time;
    const s = 0.0022 * this.sens;
    this.yaw -= mdx * s;
    this.pitch = clamp(this.pitch + mdy * s * (this.invertY ? -1 : 1), -0.9, 1.25);
    if (input.wheel) { this.distIdx = clamp(this.distIdx + input.wheel, 0, 2); }

    if (this.cine) {
      const c = this.cine; c.t += dt;
      const k = clamp(c.t / c.dur, 0, 1), e = k * k * (3 - 2 * k);
      cam.position.lerpVectors(c.from, c.to, e);
      const look = c.lookTo ? new THREE.Vector3().lerpVectors(c.look, c.lookTo, e) : c.look;
      cam.lookAt(look);
      cam.fov = damp(cam.fov, c.fov || 50, 3, dt); cam.updateProjectionMatrix();
      if (c.t >= c.dur) { this.cine = null; if (c.done) c.done(); }
      this.pos.copy(cam.position);
      return;
    }

    const v = player.vehicle;
    let fov = this.baseFov;
    if (v) {
      const spd = v.speed;
      this.target.set(v.pos.x, v.pos.y + 1.3 + v.spec.hgt * 0.35, v.pos.z);
      // auto-center behind the car when the mouse is idle
      if (time - this.lastMouse > 1.4 && spd > 2.5) {
        const back = v.forwardSpeed < -2 ? v.heading + Math.PI : v.heading;
        this.yaw = dampAngle(this.yaw, back, 2.4, dt);
        this.pitch = damp(this.pitch, 0.2, 2, dt);
      }
      const dist = this.vehDist[this.distIdx] + v.spec.len * 0.25;
      this.curDist = damp(this.curDist, dist, 4, dt);
      fov = this.baseFov + clamp(spd * 0.32, 0, 18);
      if (spd > 30) this.shakeAmt = Math.max(this.shakeAmt, (spd - 30) * 0.004);
    } else {
      const p = player.position;
      const aim = player.aiming;
      const crouchH = player.crouch ? 1.15 : 1.58;
      const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
      const shoulder = aim ? 0.62 : 0.38;
      const tx = p.x + right.x * shoulder, tz = p.z + right.z * shoulder;
      this.target.x = damp(this.target.x, tx, 18, dt); this.target.z = damp(this.target.z, tz, 18, dt);
      this.target.y = damp(this.target.y, p.y + crouchH, 10, dt);
      if (!this.inited) { this.target.set(tx, p.y + crouchH, tz); }
      const want = aim ? 1.7 : [2.7, 3.8, 5.4][this.distIdx];
      this.curDist = damp(this.curDist, want, 8, dt);
      if (aim) fov = this.baseFov - 14;
      if (player.sprinting) fov += 5;
    }
    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    let d = this.curDist;
    const want = this.target.clone().addScaledVector(dir, -d);
    // collision: pull camera in front of walls
    const t = col.raycast(this.target.x, this.target.y, this.target.z, want.x, want.y, want.z);
    if (t < 1) d = Math.max(0.5, d * t - 0.25);
    const pos = this.target.clone().addScaledVector(dir, -d);
    const minY = col.terrainHeight(pos.x, pos.z) + 0.3;
    if (pos.y < minY) pos.y = minY;
    if (!this.inited) { this.pos.copy(pos); this.inited = true; }
    // tighter follow when colliding to avoid clipping
    this.pos.lerp(pos, t < 1 ? 1 : 1 - Math.exp(-dt * (v ? 14 : 25)));
    cam.position.copy(this.pos);
    cam.lookAt(this.target.x + dir.x * 2, this.target.y + dir.y * 2, this.target.z + dir.z * 2);
    // shake
    if (this.shakeAmt > 0.001) {
      const a = this.shakeAmt * 0.06;
      cam.rotation.x += (Math.random() - 0.5) * a; cam.rotation.y += (Math.random() - 0.5) * a;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2);
    }
    cam.fov = damp(cam.fov, fov, 5, dt); cam.updateProjectionMatrix();
  }
  /** Front-facing view of the player (wardrobe). */
  portrait(player, dt) {
    const p = player.position, h = player.heading;
    const pos = new THREE.Vector3(p.x + Math.sin(h) * 2.6, p.y + 1.25, p.z + Math.cos(h) * 2.6);
    this.camera.position.lerp(pos, 1 - Math.exp(-dt * 6));
    this.camera.lookAt(p.x, p.y + 1.0, p.z);
    this.camera.fov = damp(this.camera.fov, 45, 5, dt); this.camera.updateProjectionMatrix();
    this.pos.copy(this.camera.position);
  }
}
