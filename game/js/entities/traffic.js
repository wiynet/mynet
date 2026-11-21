// Traffic: road graph with lanes, signalized intersections, AI cars that follow
// lanes, turn through intersections, obey lights and keep distance.
import * as THREE from 'three';
import { LINES, STOP_DIST, LANE_OFFSETS } from '../world/layout.js';
import { signalMats } from '../world/city.js';
import { Vehicle, CAR_TYPES, PAINTS } from './vehicle.js';
import { clamp, smoothstep, lerp, dampAngle } from '../core/utils.js';

const N = LINES.length;
const CYCLE = 36;

export class TrafficLights {
  constructor() { this.t = 0; }
  update(dt) {
    this.t += dt;
    for (let g = 0; g < 2; g++) for (let axis = 0; axis < 2; axis++) {
      const st = this.state(g, axis);
      const ms = signalMats[g][axis];
      ms[0].emissiveIntensity = st === 'red' ? 5 : 0;
      ms[1].emissiveIntensity = st === 'yellow' ? 5 : 0;
      ms[2].emissiveIntensity = st === 'green' ? 5 : 0;
    }
  }
  /** axis 1 = traffic moving along x (EW), 0 = along z (NS). */
  state(group, axis) {
    const t = (this.t + group * 18) % CYCLE;
    const local = axis === 1 ? t : (t + 18) % CYCLE;
    if (local < 14) return 'green';
    if (local < 17) return 'yellow';
    return 'red';
  }
  groupAt(i, j) { return (i + j) % 2; }
}

function nodeOK(i, j) { return i >= 0 && j >= 0 && i < N && j < N; }
const rightOf = (dx, dz) => [-dz, dx];
const leftOf = (dx, dz) => [dz, -dx];

export class Traffic {
  constructor(world, lights) {
    this.world = world; this.lights = lights;
    this.cars = []; this.density = 26;
    this.spawnTimer = 0;
  }
  /** Lane geometry for edge from node (i,j) in direction (dx,dz). */
  laneStart(i, j, dx, dz, lane) {
    const [rx, rz] = rightOf(dx, dz), off = LANE_OFFSETS[lane];
    return { x: LINES[i] + dx * STOP_DIST + rx * off, z: LINES[j] + dz * STOP_DIST + rz * off };
  }
  pickTurn(i, j, dx, dz) {
    // i,j = node we arrive at
    const opts = [];
    const add = (d, w, kind) => { const ni = i + d[0], nj = j + d[1]; if (nodeOK(ni, nj)) opts.push({ d, w, kind }); };
    add([dx, dz], 0.5, 'straight'); add(leftOf(dx, dz), 0.25, 'left'); add(rightOf(dx, dz), 0.25, 'right');
    let tot = opts.reduce((a, o) => a + o.w, 0), r = Math.random() * tot;
    for (const o of opts) { r -= o.w; if (r <= 0) return o; }
    return opts[0];
  }
  laneFor(kind, cur) { return kind === 'left' ? 0 : kind === 'right' ? 1 : cur; }

  spawnCar(focus, near = false) {
    // random edge at suitable distance
    for (let tries = 0; tries < 12; tries++) {
      const horiz = Math.random() < 0.5;
      const i = Math.floor(Math.random() * N), j = Math.floor(Math.random() * N);
      const dirs = horiz ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
      const [dx, dz] = dirs[Math.floor(Math.random() * 2)];
      if (!nodeOK(i + dx, j + dz)) continue;
      const lane = Math.random() < 0.5 ? 0 : 1;
      const s = 5 + Math.random() * 55;
      const st = this.laneStart(i, j, dx, dz, lane);
      const x = st.x + dx * s, z = st.z + dz * s;
      const d = Math.hypot(x - focus.x, z - focus.z);
      const cam = this.world.game.camera, e = cam.matrixWorld.elements;
      const behind = (x - cam.position.x) * -e[8] + (z - cam.position.z) * -e[10] < -10;
      if (near ? d > 160 : ((d < 80 && !(behind && d > 40)) || d > 210)) continue;
      if (this.cars.some((c) => Math.hypot(c.veh.pos.x - x, c.veh.pos.z - z) < 12)) continue;
      if (this.world.game.vehicles.some((v) => Math.hypot(v.pos.x - x, v.pos.z - z) < 8)) continue;
      const types = ['sedan', 'sedan', 'compact', 'compact', 'suv', 'taxi', 'van', 'sports', 'suv'];
      const type = types[Math.floor(Math.random() * types.length)];
      const veh = new Vehicle(this.world, type, PAINTS[Math.floor(Math.random() * PAINTS.length)], { x, z, heading: Math.atan2(dx, dz), mode: 'ai' });
      veh.engineOn = true;
      const turn = this.pickTurn(i + dx, j + dz, dx, dz);
      const car = { veh, i, j, dx, dz, lane, laneFrom: lane, laneTo: this.laneFor(turn.kind, lane), s, phase: 'seg', turn, speed: 8 + Math.random() * 4, limit: 12 + Math.random() * 3.5, honkT: 0, stuck: 0 };
      veh.ai = car;
      car.driver = this.world.game.peds.makeDriver(veh);
      this.cars.push(car);
      this.world.game.vehicles.push(veh);
      return car;
    }
    return null;
  }
  removeCar(car) {
    const i = this.cars.indexOf(car); if (i >= 0) this.cars.splice(i, 1);
    const g = this.world.game;
    const vi = g.vehicles.indexOf(car.veh); if (vi >= 0) g.vehicles.splice(vi, 1);
    if (car.driver) g.peds.removeNPC(car.driver);
    car.veh.remove();
  }
  /** Detach a car from AI control (crash, carjack). */
  release(car) {
    const i = this.cars.indexOf(car); if (i >= 0) this.cars.splice(i, 1);
    const v = car.veh; v.mode = 'physics'; v.ai = null;
    const h = v.heading; v.vel.set(Math.sin(h) * car.speed, Math.cos(h) * car.speed);
  }

  update(dt, focus) {
    // population
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.4;
      const target = Math.round(this.density * (this.world.game.inCity ? 1 : 0.35));
      if (this.cars.length < target) this.spawnCar(focus, this.cars.length < target * 0.4 && this.world.game.time < 3);
      for (const c of [...this.cars]) {
        const d = Math.hypot(c.veh.pos.x - focus.x, c.veh.pos.z - focus.z);
        if (d > 260 || (this.cars.length > target + 4 && d > 120)) this.removeCar(c);
      }
    }
    const all = this.world.game.vehicles;
    for (const c of this.cars) this.drive(c, dt, all, focus);
  }

  drive(c, dt, all, focus) {
    const v = c.veh, L = this.lights;
    const segLen = (LINES[1] - LINES[0]) - STOP_DIST * 2;
    let target = c.limit;
    if (this.world.env.wetness > 0.4) target *= 0.85;
    // signal
    if (c.phase === 'seg') {
      const toStop = segLen - c.s;
      const ni = c.i + c.dx, nj = c.j + c.dz;
      const axis = c.dx !== 0 ? 1 : 0;
      const st = L.state(L.groupAt(ni, nj), axis);
      if (st === 'red' || (st === 'yellow' && toStop > 4 + c.speed * 0.8)) {
        target = Math.min(target, Math.max(0, (toStop - 0.8) * 0.55));
      }
    }
    // obstacles ahead (cars, player, peds)
    const h = v.heading, fx = Math.sin(h), fz = Math.cos(h);
    let gap = 99;
    for (const o of all) {
      if (o === v) continue;
      const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z;
      const along = dx * fx + dz * fz;
      if (along < 0 || along > 30) continue;
      const lat = Math.abs(dx * fz - dz * fx);
      if (lat < 2.0) gap = Math.min(gap, along - (o.spec.len + v.spec.len) / 2);
    }
    const g = this.world.game;
    const p = g.player;
    if (!p.vehicle) {
      const dx = p.position.x - v.pos.x, dz = p.position.z - v.pos.z, along = dx * fx + dz * fz;
      if (along > 0 && along < 14 && Math.abs(dx * fz - dz * fx) < 1.8) { gap = Math.min(gap, along - v.spec.len / 2 - 0.5); c.honkT += dt; }
    }
    for (const n of g.peds.list) {
      if (n.inVehicle || n.knocked) continue;
      const dx = n.pos.x - v.pos.x, dz = n.pos.z - v.pos.z, along = dx * fx + dz * fz;
      if (along > 0 && along < 12 && Math.abs(dx * fz - dz * fx) < 1.6) gap = Math.min(gap, along - v.spec.len / 2 - 0.5);
    }
    if (gap < 99) target = Math.min(target, Math.max(0, (gap - 2.5) * 0.7));
    if (c.honkT > 2.5 && Math.hypot(v.pos.x - focus.x, v.pos.z - focus.z) < 40) { this.world.audio.horn(0.05, 0.3); c.honkT = 0; }
    // panic when player is wanted & close: speed up a bit
    const accel = target > c.speed ? 2.8 : 7.5;
    c.speed += clamp(target - c.speed, -accel * dt, accel * dt);
    c.speed = Math.max(0, c.speed);
    v.braking = target < c.speed - 0.5 || c.speed < 0.3;
    const adv = c.speed * dt;
    // advance along path
    if (c.phase === 'seg') {
      c.s += adv;
      const st = this.laneStart(c.i, c.j, c.dx, c.dz, 0);
      const k = smoothstep(4, 30, c.s);
      const off = lerp(LANE_OFFSETS[c.laneFrom], LANE_OFFSETS[c.laneTo], k);
      const [rx, rz] = rightOf(c.dx, c.dz);
      const base = { x: LINES[c.i] + c.dx * STOP_DIST, z: LINES[c.j] + c.dz * STOP_DIST };
      const nx = base.x + c.dx * c.s + rx * off, nz = base.z + c.dz * c.s + rz * off;
      const dOff = (LANE_OFFSETS[c.laneTo] - LANE_OFFSETS[c.laneFrom]) * (k > 0 && k < 1 ? 0.04 : 0);
      v.pos.x = nx; v.pos.z = nz;
      v.heading = dampAngle(v.heading, Math.atan2(c.dx + rx * dOff, c.dz + rz * dOff), 8, dt);
      if (c.s >= segLen) this.beginTurn(c);
    } else {
      const T = c.path;
      c.t += adv / T.len;
      if (c.t >= 1) {
        c.phase = 'seg'; c.i += c.dx; c.j += c.dz;
        c.dx = c.turn.d[0]; c.dz = c.turn.d[1];
        c.s = (c.t - 1) * T.len; c.laneFrom = c.laneTo; c.lane = c.laneTo;
        c.turn = this.pickTurn(c.i + c.dx, c.j + c.dz, c.dx, c.dz);
        c.laneTo = this.laneFor(c.turn.kind, c.lane);
      } else {
        const t = c.t, u = 1 - t;
        v.pos.x = u * u * T.p0.x + 2 * u * t * T.p1.x + t * t * T.p2.x;
        v.pos.z = u * u * T.p0.z + 2 * u * t * T.p1.z + t * t * T.p2.z;
        const tx = 2 * u * (T.p1.x - T.p0.x) + 2 * t * (T.p2.x - T.p1.x), tz = 2 * u * (T.p1.z - T.p0.z) + 2 * t * (T.p2.z - T.p1.z);
        v.heading = Math.atan2(tx, tz);
      }
    }
    v.vel.set(Math.sin(v.heading) * c.speed, Math.cos(v.heading) * c.speed);
    v.pos.y = v.ground();
    v.wheelSpin += (c.speed / 0.34) * dt;
    v.steer = c.phase === 'turn' ? (c.turn.kind === 'left' ? -0.6 : c.turn.kind === 'right' ? 0.6 : 0) : 0;
  }
  beginTurn(c) {
    const ni = c.i + c.dx, nj = c.j + c.dz;
    const [rx, rz] = rightOf(c.dx, c.dz);
    const p0 = { x: LINES[ni] - c.dx * STOP_DIST + rx * LANE_OFFSETS[c.laneTo], z: LINES[nj] - c.dz * STOP_DIST + rz * LANE_OFFSETS[c.laneTo] };
    const [d2x, d2z] = c.turn.d;
    const p2s = this.laneStart(ni, nj, d2x, d2z, c.laneTo);
    let p1;
    if (c.turn.kind === 'straight') p1 = { x: (p0.x + p2s.x) / 2, z: (p0.z + p2s.z) / 2 };
    else { const t = (p2s.x - p0.x) * c.dx + (p2s.z - p0.z) * c.dz; p1 = { x: p0.x + c.dx * t, z: p0.z + c.dz * t }; }
    let len = 0, prev = p0;
    for (let k = 1; k <= 8; k++) {
      const t = k / 8, u = 1 - t;
      const q = { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2s.x, z: u * u * p0.z + 2 * u * t * p1.z + t * t * p2s.z };
      len += Math.hypot(q.x - prev.x, q.z - prev.z); prev = q;
    }
    c.path = { p0, p1, p2: p2s, len };
    c.t = 0; c.phase = 'turn';
  }
  /** Nearest lane alignment for a free vehicle (to hand crashed cars back to AI). */
  nearestLane(x, z, heading) {
    let best = null;
    for (let gi = 0; gi < N; gi++) for (let gj = 0; gj < N; gj++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!nodeOK(gi + dx, gj + dz)) continue;
      const hd = Math.atan2(dx, dz);
      if (Math.abs(Math.atan2(Math.sin(hd - heading), Math.cos(hd - heading))) > 0.6) continue;
      for (let lane = 0; lane < 2; lane++) {
        const st = this.laneStart(gi, gj, dx, dz, lane);
        const s = (x - st.x) * dx + (z - st.z) * dz;
        const segLen = (LINES[1] - LINES[0]) - STOP_DIST * 2;
        if (s < 0 || s > segLen - 2) continue;
        const lat = Math.abs((x - st.x) * dz - (z - st.z) * dx);
        if (lat < 1.6 && (!best || lat < best.lat)) best = { i: gi, j: gj, dx, dz, lane, s, lat };
      }
    }
    return best;
  }
  adopt(veh, lane) {
    const turn = this.pickTurn(lane.i + lane.dx, lane.j + lane.dz, lane.dx, lane.dz);
    const car = { veh, i: lane.i, j: lane.j, dx: lane.dx, dz: lane.dz, lane: lane.lane, laneFrom: lane.lane, laneTo: this.laneFor(turn.kind, lane.lane), s: lane.s, phase: 'seg', turn, speed: veh.speed, limit: 12 + Math.random() * 3, honkT: 0, stuck: 0, driver: veh.npcDriver };
    veh.mode = 'ai'; veh.ai = car; this.cars.push(car);
    return car;
  }
}
