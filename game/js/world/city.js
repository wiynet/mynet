// City generator: roads, sidewalks, markings, street furniture and every
// district's buildings. Static geometry is merged by StaticBatcher.
import * as THREE from 'three';
import { RNG } from '../core/utils.js';
import { worldBox, planeXZ, transformGeo, colorize } from './builder.js';
import { Mats, facadeMat, storefrontMat, signMat, nightMaterials } from './materials.js';
import { Tex } from './textures.js';
import { Kit, Furniture } from './kit.js';
import { LINES, ROAD_HALF, CURB, DISTRICTS, STOP_DIST } from './layout.js';

export const signalMats = [0, 1].map(() => [0, 1].map(() => ['red', 'yellow', 'green'].map((c) =>
  new THREE.MeshStandardMaterial({ color: 0x111111, emissive: { red: 0xff2a1a, yellow: 0xffb020, green: 0x30ff80 }[c], emissiveIntensity: 0, roughness: 0.3 }))));

/** Quad on a vertical wall from A to B (outward normal on the left of travel when viewed from above). */
export function wallQuad(ax, az, bx, bz, y0, y1, tileW, tileH, vBase = y0, uOff = 0) {
  const len = Math.hypot(bx - ax, bz - az);
  const g = new THREE.BufferGeometry();
  const nx = (bz - az) / len, nz = -(bx - ax) / len;
  g.setAttribute('position', new THREE.Float32BufferAttribute([ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
  const u0 = uOff / tileW, u1 = (uOff + len) / tileW, v0 = (y0 - vBase) / tileH, v1 = (y1 - vBase) / tileH;
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v1], 2));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
}

const SHOP_NAMES = ['CAFÉ AURA', 'NOVA TECH', 'BLOOM', 'URBAN EATS', 'PIXEL', 'SOLE', 'LUMEN', 'BAYVIEW BOOKS', 'FRESH', 'VELVET', 'ATLAS', 'KINO', 'HALO', 'MOSAIC', 'DRIFT', 'ORBIT'];
const LANTERN_SIGNS = ['拉面', '寿司', '茶屋', '薬局', '居酒屋', '書店', '電器', '花屋', '食堂', '麻辣', '咖啡', '点心', '酒場', '甘味', '本屋', '焼肉', 'カラオケ', '占い'];
const NEON = ['#ff3d6e', '#38e8ff', '#ffd23f', '#9b5cff', '#3dff8b', '#ff8a3d'];

export class City {
  constructor(world) {
    this.world = world; this.b = world.batcher; this.col = world.collision;
    this.kit = new Kit(world);
    this.rng = new RNG(4242);
    this.reserved = world.reserved || [];
  }

  build() {
    this.buildRoads();
    this.buildMarkings();
    for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) this.buildBlock(i, j);
    this.buildStreetFurniture();
    this.buildLanternRow();
  }

  // ------------------------------------------------------------ roads
  buildRoads() {
    const b = this.b, y = 0;
    const asphalt = Mats.asphalt(), lantern = Mats.asphaltLantern();
    // Intersections
    for (const x of LINES) for (const z of LINES) {
      const g = planeXZ(ROAD_HALF * 2, ROAD_HALF * 2, 9); g.translate(x, y, z);
      b.add(g, (z === -180 && x <= -90) ? lantern : asphalt, { cast: false, color: 0xffffff });
    }
    // Segments
    for (let k = 0; k < 6; k++) for (const c of LINES) {
      const a = LINES[k] + ROAD_HALF, e = LINES[k + 1] - ROAD_HALF, len = e - a;
      const gh = planeXZ(len, ROAD_HALF * 2, 9); gh.translate((a + e) / 2, y, c);
      const isLantern = c === -180 && LINES[k + 1] <= -90;
      b.add(gh, isLantern ? lantern : asphalt, { cast: false });
      const gv = planeXZ(ROAD_HALF * 2, len, 9); gv.translate(c, y, (a + e) / 2);
      b.add(gv, asphalt, { cast: false });
    }
    // Raised block pads (sidewalks). Each block pad spans line+7 .. line-7.
    for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
      const x0 = LINES[i] + ROAD_HALF, x1 = LINES[i + 1] - ROAD_HALF, z0 = LINES[j] + ROAD_HALF, z1 = LINES[j + 1] - ROAD_HALF;
      this.pad(x0, z0, x1, z1, DISTRICTS[j][i] === 'lantern' ? Mats.sidewalkLantern() : Mats.sidewalk());
    }
    // Outer sidewalks around the grid + south promenade
    this.pad(-288.5, -288.5, 288.5, -277, Mats.sidewalk());
    this.pad(-288.5, -277, -277, 277, Mats.sidewalk());
    this.pad(277, -277, 288.5, 277, Mats.sidewalk());
    this.pad(-300, 277, 300, 292, Mats.paving());
    this.world.mapRects.push({ x0: -300, z0: 277, x1: 300, z1: 292, type: 'plaza' });
  }
  pad(x0, z0, x1, z1, material, h = 0.15) {
    const g = worldBox(x1 - x0, h, z1 - z0, 4); g.translate((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    this.b.add(g, material, { cast: false });
    this.col.add(x0, 0, z0, x1, h, z1, { low: true, noCam: true });
    // curb edge
    const cg = worldBox(x1 - x0 + 0.1, 0.16, z1 - z0 + 0.1, 4); cg.translate((x0 + x1) / 2, 0.075, (z0 + z1) / 2);
    this.b.add(cg, Mats.concrete(), { cast: false, color: 0x9a9a96 });
  }

  buildMarkings() {
    const lane = Mats.lane(), y = 0.015;
    const quad = (cx, cz, sx, sz, color) => { const g = planeXZ(sx, sz, 1); g.translate(cx, y, cz); this.b.add(g, lane, { color, cast: false }); };
    const YEL = 0xe8b830, WHT = 0xf2f2f2;
    for (let k = 0; k < 6; k++) for (const c of LINES) {
      const a = LINES[k] + STOP_DIST, e = LINES[k + 1] - STOP_DIST, mid = (a + e) / 2, len = e - a;
      // horizontal road along x at z=c
      quad(mid, c - 0.15, len, 0.12, YEL); quad(mid, c + 0.15, len, 0.12, YEL);
      quad(c - 0.15, mid, 0.12, len, YEL); quad(c + 0.15, mid, 0.12, len, YEL);
      for (let s = a + 2; s < e - 2; s += 9) for (const off of [-3.55, 3.55]) {
        quad(s + 1.5, c + off, 3, 0.12, WHT); quad(c + off, s + 1.5, 0.12, 3, WHT);
      }
    }
    // Stop lines + crosswalks at every intersection approach
    for (const x of LINES) for (const z of LINES) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        // approach coming from -d side: road exists on that side?
        const ax = x - dx * 20, az = z - dz * 20;
        if (ax < -280 || ax > 280 || az < -280 || az > 280) continue;
        const rx = -dz, rz = dx; // right of travel
        // stop line across the approaching lanes (right half)
        const sx = x - dx * (STOP_DIST - 0.3), sz = z - dz * (STOP_DIST - 0.3);
        const cx = sx + rx * 3.5, cz = sz + rz * 3.5;
        if (dx !== 0) quad(cx, cz, 0.45, 6.8, WHT); else quad(cx, cz, 6.8, 0.45, WHT);
        // zebra crosswalk
        const zx = x - dx * 8.9, zz = z - dz * 8.9;
        for (let s = -6; s <= 6; s += 1.2) {
          if (dx !== 0) quad(zx, zz + s, 2.6, 0.55, WHT); else quad(zx + s, zz, 0.55, 2.6, WHT);
        }
      }
    }
  }

  // ------------------------------------------------------------ helpers
  isReserved(x0, z0, x1, z1) {
    return this.reserved.some((r) => x0 < r.x1 && x1 > r.x0 && z0 < r.z1 && z1 > r.z0);
  }
  /** Generic box building with optional storefront band on the front face. */
  building(o) {
    const { x0, z0, x1, z1, h, kind = 'office', seed = 1, tint = 0xffffff, front = 'N', store = false, storeH = 4.5, sign = null, roofProps = true, signNeon = false } = o;
    const b = this.b, fm = facadeMat(kind, seed), sm = store ? storefrontMat(1 + (seed % 3)) : null;
    const tileW = 24, tileH = 56;
    const faces = {
      N: [x0, z0, x1, z0], S: [x1, z1, x0, z1], W: [x0, z1, x0, z0], E: [x1, z0, x1, z1],
    };
    for (const f of Object.keys(faces)) {
      const [ax, az, bx, bz] = faces[f];
      const hasStore = store && f === front;
      const y0 = hasStore ? storeH : 0;
      const g = wallQuad(ax, az, bx, bz, y0, h, tileW, tileH, hasStore ? storeH - 0.6 : 0, (ax + az) * 0.37 % 24);
      b.add(g, fm, { color: tint });
      if (hasStore) {
        b.add(wallQuad(ax, az, bx, bz, 0.15, storeH, 16, storeH - 0.15, 0.15), sm, { color: 0xffffff });
      }
    }
    // roof + parapet
    const rg = planeXZ(x1 - x0, z1 - z0, 6); rg.translate((x0 + x1) / 2, h, (z0 + z1) / 2);
    b.add(rg, Mats.roof(), { color: 0x8a8884 });
    const pc = 0x9a958c;
    const k = this.kit.at(0, h, 0);
    k.box((x0 + x1) / 2, 0, z0 + 0.15, x1 - x0, 0.9, 0.3, Mats.concrete(), pc, { collide: false });
    k.box((x0 + x1) / 2, 0, z1 - 0.15, x1 - x0, 0.9, 0.3, Mats.concrete(), pc, { collide: false });
    k.box(x0 + 0.15, 0, (z0 + z1) / 2, 0.3, 0.9, z1 - z0, Mats.concrete(), pc, { collide: false });
    k.box(x1 - 0.15, 0, (z0 + z1) / 2, 0.3, 0.9, z1 - z0, Mats.concrete(), pc, { collide: false });
    if (roofProps && (x1 - x0) > 8 && (z1 - z0) > 8) {
      const r = this.rng;
      const n = r.int(1, 3);
      for (let i = 0; i < n; i++) {
        const ax = r.range(x0 + 2.5, x1 - 2.5), az = r.range(z0 + 2.5, z1 - 2.5);
        k.box(ax, 0, az, r.range(1.4, 2.6), r.range(1, 1.6), r.range(1.2, 2.2), Mats.metal(), 0xb8b8b8, { collide: false });
      }
      if (r.chance(0.35) && kind !== 'glass') { const tx = r.range(x0 + 3, x1 - 3), tz = r.range(z0 + 3, z1 - 3); k.cyl(tx, 2.2, tz, 1.4, 1.4, 2.6, Mats.wood(), 0x8a6a4a, { seg: 10 }); for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(tx + dx, 0, tz + dz, 0.15, 2.2, 0.15, Mats.metal(), 0x333333, { collide: false }); }
    }
    this.col.add(x0, 0, z0, x1, h, z1, { tag: 'building' });
    this.world.mapRects.push({ x0, z0, x1, z1, type: 'building', h });
    if (store) this.storefrontDetails(o);
  }
  /** Signs + awning on the front face. */
  storefrontDetails(o) {
    const { x0, z0, x1, z1, front, storeH = 4.5, sign, signNeon } = o;
    const r = this.rng;
    const len = front === 'N' || front === 'S' ? x1 - x0 : z1 - z0;
    // place kit at front face center, local +z pointing outward
    const fc = { N: [(x0 + x1) / 2, z0, Math.PI], S: [(x0 + x1) / 2, z1, 0], W: [x0, (z0 + z1) / 2, -Math.PI / 2], E: [x1, (z0 + z1) / 2, Math.PI / 2] }[front];
    const k = this.kit.at(fc[0], 0, fc[1], fc[2]);
    // sign board
    const text = sign || r.pick(SHOP_NAMES);
    const bg = r.pick(['#14161a', '#f4f1ea', '#1d2b3a', '#3a1d22']);
    const fg = bg === '#f4f1ea' ? '#1a1a1a' : r.pick(['#ffffff', '#ffd27a', '#8fe3ff']);
    const sw = Math.min(len - 1, 9);
    const sg = new THREE.PlaneGeometry(sw, 1.0); sg.translate(0, storeH + 0.35, 0.32);
    const smat = signMat(text, { bg, fg, w: 1024, h: 128, font: 'bold 78px "Barlow Condensed", "Arial Narrow", sans-serif', neon: signNeon });
    k.geo(sg, smat, 0xffffff, { cast: false });
    k.box(0, storeH - 0.2, 0.15, sw + 0.2, 1.1, 0.3, Mats.metal(), 0x222222, { collide: false });
    // awning
    if (r.chance(0.6)) {
      const ac = r.pick([0x2a5a3a, 0x8a2a2a, 0x22324a, 0xc8a04a, 0x444444]);
      const ag = new THREE.BoxGeometry(len - 0.6, 0.08, 1.8); ag.rotateX(0.25); ag.translate(0, storeH - 0.9, 0.95);
      k.geo(ag, Mats.fabric(), ac);
    }
  }

  // ------------------------------------------------------------ blocks
  buildBlock(i, j) {
    const d = DISTRICTS[j][i];
    const bx0 = LINES[i] + CURB, bx1 = LINES[i + 1] - CURB, bz0 = LINES[j] + CURB, bz1 = LINES[j + 1] - CURB;
    const blk = { i, j, bx0, bx1, bz0, bz1, cx: (bx0 + bx1) / 2, cz: (bz0 + bz1) / 2 };
    const fn = {
      downtown: this.downtown, apartments: this.apartments, lantern: this.lanternBlock, shops: this.shops,
      plaza: this.plaza, park: this.park, parking: this.parking, houses: this.houses, beach: this.beachBlock,
    }[d];
    fn.call(this, blk);
  }
  /** Fill block perimeter with rows of buildings; make(rect, front) builds each. */
  perimeter(blk, depthN, depthS, depthW, depthE, minW, maxW, make, gapChance = 0.25) {
    const { bx0, bx1, bz0, bz1 } = blk, r = this.rng;
    const rows = [
      { front: 'N', a: bx0, e: bx1, rect: (a, e) => [a, bz0, e, bz0 + depthN] },
      { front: 'S', a: bx0, e: bx1, rect: (a, e) => [a, bz1 - depthS, e, bz1] },
      { front: 'W', a: bz0 + depthN, e: bz1 - depthS, rect: (a, e) => [bx0, a, bx0 + depthW, e] },
      { front: 'E', a: bz0 + depthN, e: bz1 - depthS, rect: (a, e) => [bx1 - depthE, a, bx1, e] },
    ];
    for (const row of rows) {
      if ((row.front === 'N' && !depthN) || (row.front === 'S' && !depthS) || (row.front === 'W' && !depthW) || (row.front === 'E' && !depthE)) continue;
      let p = row.a;
      while (p < row.e - 4) {
        let w = r.range(minW, maxW);
        if (row.e - (p + w) < minW) w = row.e - p;
        const [x0, z0, x1, z1] = row.rect(p, p + w);
        if (!this.isReserved(x0, z0, x1, z1)) make({ x0, z0, x1, z1 }, row.front);
        p += w;
        if (r.chance(gapChance)) p += r.range(1.5, 3.5);
      }
    }
  }
  downtown(blk) {
    const r = this.rng, { bx0, bx1, bz0, bz1 } = blk;
    const lots = r.chance(0.5) ? [[bx0, bz0, bx1, bz1]] : [
      [bx0, bz0, blk.cx - 1.5, blk.cz - 1.5], [blk.cx + 1.5, bz0, bx1, blk.cz - 1.5],
      [bx0, blk.cz + 1.5, blk.cx - 1.5, bz1], [blk.cx + 1.5, blk.cz + 1.5, bx1, bz1]];
    this.groundPlane(bx0, bz0, bx1, bz1, Mats.paving(), 0xd8d0c4);
    for (const [x0, z0, x1, z1] of lots) {
      if (this.isReserved(x0, z0, x1, z1)) continue;
      const big = lots.length === 1;
      const inset = big ? r.range(8, 14) : r.range(2, 4);
      const tx0 = x0 + inset, tz0 = z0 + inset, tx1 = x1 - inset, tz1 = z1 - inset;
      const h = big ? r.range(110, 190) : r.range(55, 130);
      this.tower(tx0, tz0, tx1, tz1, h, r.int(1, 3));
      if (big) this.plazaDecor(x0, z0, x1, z1, tx0, tz0, tx1, tz1);
    }
  }
  tower(x0, z0, x1, z1, h, seed) {
    const r = this.rng;
    const kind = r.chance(0.7) ? 'glass' : 'office';
    const tint = kind === 'glass' ? r.pick([0xffffff, 0xd8e8ff, 0xc8f0e8, 0xffe8d0]) : r.pick([0xffffff, 0xe8e0d0, 0xd0d4dc]);
    const podH = r.range(10, 16);
    // podium with storefront on all faces
    const fronts = ['N', 'S'];
    this.building({ x0, z0, x1, z1, h: podH, kind: 'office', seed: 2, tint: 0xd8d4cc, front: r.pick(fronts), store: true, roofProps: false });
    let cx0 = x0 + 2, cz0 = z0 + 2, cx1 = x1 - 2, cz1 = z1 - 2, y = podH;
    const tiers = r.int(1, 3);
    for (let t = 0; t < tiers; t++) {
      const th = (h - podH) / tiers;
      this.tierBox(cx0, cz0, cx1, cz1, y, y + th, kind, seed, tint);
      y += th;
      const s = r.range(2, 4.5);
      if (cx1 - cx0 > 12 && cz1 - cz0 > 12) { cx0 += s; cz0 += s; cx1 -= s; cz1 -= s; }
    }
    // crown + antenna beacon
    const k = this.kit.at(0, y, 0), mx = (cx0 + cx1) / 2, mz = (cz0 + cz1) / 2;
    k.box(mx, 0, mz, (cx1 - cx0) * 0.6, 3, (cz1 - cz0) * 0.6, Mats.metal(), 0x9aa0a8, { collide: false });
    if (r.chance(0.6)) {
      k.cyl(mx, 3, mz, 0.15, 0.3, r.range(10, 25), Mats.metal(), 0xcccccc, { seg: 6 });
    }
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), this.world.beaconMat);
    beacon.position.set(mx, y + 3.4, mz); this.world.scene.add(beacon);
  }
  tierBox(x0, z0, x1, z1, y0, y1, kind, seed, tint) {
    const fm = facadeMat(kind, seed);
    const faces = [[x0, z0, x1, z0], [x1, z1, x0, z1], [x0, z1, x0, z0], [x1, z0, x1, z1]];
    for (const [ax, az, bx, bz] of faces) this.b.add(wallQuad(ax, az, bx, bz, y0, y1, 24, 56, 0, 0), fm, { color: tint });
    const rg = planeXZ(x1 - x0, z1 - z0, 6); rg.translate((x0 + x1) / 2, y1, (z0 + z1) / 2);
    this.b.add(rg, Mats.roof(), { color: 0x7a7874 });
    this.col.add(x0, y0, z0, x1, y1, z1);
    if (y0 < 1) this.world.mapRects.push({ x0, z0, x1, z1, type: 'building', h: y1 });
    else this.world.mapRects.push({ x0, z0, x1, z1, type: 'tower', h: y1 });
  }
  plazaDecor(x0, z0, x1, z1, tx0, tz0, tx1, tz1) {
    const r = this.rng, k = this.kit;
    const spots = [];
    for (let i = 0; i < 8; i++) {
      const x = r.range(x0 + 2, x1 - 2), z = r.range(z0 + 2, z1 - 2);
      if (x > tx0 - 2 && x < tx1 + 2 && z > tz0 - 2 && z < tz1 + 2) continue;
      spots.push([x, z]);
    }
    for (const [x, z] of spots) {
      if (r.chance(0.5)) { k.at(x, 0.15, z); k.box(0, 0, 0, 2.4, 0.6, 2.4, Mats.concrete(), 0xb8b0a4); this.tree(x, z, 0.75, 'round'); }
      else this.bench(x, z, r.pick([0, Math.PI / 2]));
    }
  }
  groundPlane(x0, z0, x1, z1, material, color = 0xffffff, y = 0.16) {
    const g = planeXZ(x1 - x0, z1 - z0, 4); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    this.b.add(g, material, { color, cast: false });
  }
  apartments(blk) {
    const r = this.rng;
    this.groundPlane(blk.bx0, blk.bz0, blk.bx1, blk.bz1, Mats.grass(), 0xb8c8a0);
    const kinds = ['apartment', 'brick', 'stucco'];
    const tints = [0xffffff, 0xf0e0d0, 0xe0e8f0, 0xf8f0e0, 0xe8d8c8, 0xd8e0d0];
    this.perimeter(blk, 18, 18, 16, 16, 14, 26, (rc, front) => {
      const floors = r.int(4, 9);
      this.building({ ...rc, h: floors * 3.5 + 0.5, kind: r.pick(kinds), seed: r.int(1, 2), tint: r.pick(tints), front, store: r.chance(0.5) });
      this.balconies(rc, front, floors);
    });
    // courtyard trees
    for (let n = 0; n < 4; n++) this.tree(r.range(blk.cx - 12, blk.cx + 12), r.range(blk.cz - 12, blk.cz + 12), r.range(0.8, 1.2), 'round');
  }
  balconies(rc, front, floors) {
    if (this.rng.chance(0.5)) return;
    const { x0, z0, x1, z1 } = rc;
    const fc = { N: [(x0 + x1) / 2, z0, Math.PI, x1 - x0], S: [(x0 + x1) / 2, z1, 0, x1 - x0], W: [x0, (z0 + z1) / 2, -Math.PI / 2, z1 - z0], E: [x1, (z0 + z1) / 2, Math.PI / 2, z1 - z0] }[front];
    const k = this.kit.at(fc[0], 0, fc[1], fc[2]);
    const n = Math.floor(fc[3] / 6);
    for (let f = 2; f < floors; f++) for (let i = 0; i < n; i++) {
      const x = -fc[3] / 2 + 3 + i * 6;
      k.box(x, f * 3.5, 0.6, 2.6, 0.15, 1.2, Mats.concrete(), 0xd8d4cc, { collide: false, cast: true });
      k.box(x, f * 3.5 + 0.15, 1.17, 2.6, 0.9, 0.05, Mats.glass(), 0xffffff, { collide: false, cast: false });
    }
  }
  shops(blk) {
    const r = this.rng;
    this.groundPlane(blk.bx0, blk.bz0, blk.bx1, blk.bz1, Mats.paving(), 0xc8c0b4);
    this.perimeter(blk, 16, 16, 14, 14, 10, 18, (rc, front) => {
      const floors = r.int(2, 4);
      this.building({ ...rc, h: floors * 4, kind: r.pick(['office', 'stucco', 'brick']), seed: r.int(1, 2), tint: r.pick([0xffffff, 0xf8e8d8, 0xe0e8f8, 0xf0f0e0]), front, store: true });
    }, 0.1);
  }
  lanternBlock(blk) {
    const r = this.rng;
    this.groundPlane(blk.bx0, blk.bz0, blk.bx1, blk.bz1, Mats.paving(), 0xa89888);
    const pastel = [0xf2d8c8, 0xd8e8e0, 0xf0e8c8, 0xe0d0e8, 0xc8d8e8, 0xf8e0e0, 0xe8e0d0, 0xd0c8b8];
    const lanternFace = blk.j === 0 ? 'S' : 'N';
    this.perimeter(blk, 17, 17, 15, 15, 6, 10, (rc, front) => {
      const onRow = front === lanternFace;
      const floors = onRow ? r.int(3, 5) : r.int(3, 6);
      const h = floors * 3.4 + 0.6;
      const kind = r.pick(['shophouse', 'apartment', 'brick', 'stucco']);
      this.building({ ...rc, h, kind, seed: r.int(1, 2), tint: r.pick(pastel), front, store: true, storeH: 4, sign: onRow ? r.pick(LANTERN_SIGNS) : null, signNeon: onRow });
      if (onRow) this.lanternFacade(rc, front, h);
    }, 0.12);
  }
  /** Vertical neon signs, AC units, small balconies on Lantern Row facades. */
  lanternFacade(rc, front, h) {
    const r = this.rng, { x0, z0, x1, z1 } = rc;
    const fc = { N: [(x0 + x1) / 2, z0, Math.PI, x1 - x0], S: [(x0 + x1) / 2, z1, 0, x1 - x0] }[front];
    const k = this.kit.at(fc[0], 0, fc[1], fc[2]);
    const w = fc[3];
    // vertical sign perpendicular to facade
    if (r.chance(0.85)) {
      const txt = r.pick(LANTERN_SIGNS) + (r.chance(0.5) ? r.pick(LANTERN_SIGNS) : '');
      const col = r.pick(NEON);
      const mtl = signMat(txt, { bg: '#0b0b10', fg: col, w: 128, h: 512, font: 'bold 92px "Noto Sans JP", "Hiragino Sans", "Microsoft YaHei", sans-serif', glow: col, vertical: true, neon: true });
      const sx = r.range(-w / 2 + 0.8, w / 2 - 0.8), sh = Math.min(4.5, h - 6);
      if (sh > 1.5) {
        for (const side of [1, -1]) {
          const g = new THREE.PlaneGeometry(0.9, sh); g.rotateY(side * Math.PI / 2); g.translate(sx + side * 0.08, 5 + sh / 2, 0.75);
          k.geo(g, mtl, 0xffffff, { cast: false });
        }
        k.box(sx, 5, 0.75, 0.14, sh, 0.92, Mats.metal(), 0x111111, { collide: false });
      }
    }
    // AC units
    for (let f = 1; f < Math.floor(h / 3.4); f++) if (r.chance(0.5)) k.box(r.range(-w / 2 + 0.7, w / 2 - 0.7), f * 3.4 + 0.6, 0.3, 0.8, 0.55, 0.5, Mats.metal(), 0xd0d0cc, { collide: false });
    // little balcony with plants
    if (r.chance(0.5)) {
      k.box(0, 7.2, 0.5, w - 1.5, 0.12, 1.0, Mats.concrete(), 0xb0aaa0, { collide: false });
      k.box(0, 7.32, 0.98, w - 1.5, 0.8, 0.04, Mats.metal(), 0x2a2a2a, { collide: false });
      for (let p = 0; p < 3; p++) k.sphere(-w / 2 + 1.5 + p * (w - 3) / 2, 7.6, 0.6, 0.3, Mats.leaves(), 0x4a8a3a, { seg: 5 });
    }
  }
  plaza(blk) {
    const { bx0, bx1, bz0, bz1, cx, cz } = blk, k = this.kit;
    this.groundPlane(bx0, bz0, bx1, bz1, Mats.paving(), 0xe0d8cc);
    this.world.mapRects.push({ x0: bx0, z0: bz0, x1: bx1, z1: bz1, type: 'plaza' });
    // fountain
    k.at(cx, 0.15, cz);
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2, R = 7;
      const g = new THREE.BoxGeometry(2.9, 0.7, 0.5); g.rotateY(-ang + Math.PI / 2); g.translate(Math.cos(ang) * R, 0.35, Math.sin(ang) * R);
      k.geo(g, Mats.marble(), 0xd8d4cc);
    }
    this.col.add(cx - 7.3, 0, cz - 7.3, cx + 7.3, 0.85, cz + 7.3);
    const wg = new THREE.CircleGeometry(6.8, 32); wg.rotateX(-Math.PI / 2); wg.translate(cx, 0.6, cz);
    this.b.add(wg, Mats.pool(), { cast: false });
    k.cyl(0, 0, 0, 1.2, 1.6, 1.4, Mats.marble(), 0xd8d4cc);
    k.cyl(0, 1.4, 0, 0.4, 0.5, 1.6, Mats.marble(), 0xd8d4cc);
    k.cyl(0, 3.0, 0, 2.0, 0.6, 0.4, Mats.marble(), 0xd8d4cc);
    this.world.fountains.push(new THREE.Vector3(cx, 3.5, cz));
    // sculpture ring + trees + benches
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2 + 0.2;
      const x = cx + Math.cos(ang) * 20, z = cz + Math.sin(ang) * 20;
      if (a % 2) this.tree(x, z, 1.0, 'round'); else this.bench(x, z, Math.abs(Math.cos(ang)) > 0.7 ? Math.PI / 2 : 0);
    }
    // big LED screen tower corner
    this.building({ x0: bx1 - 22, z0: bz0, x1: bx1, z1: bz0 + 18, h: 28, kind: 'glass', seed: 2, tint: 0xd0e0ff, front: 'S', store: true });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), this.world.billboardMat);
    scr.position.set(bx1 - 11, 19, bz0 + 18.05); this.world.scene.add(scr);
  }
  park(blk) {
    const { bx0, bx1, bz0, bz1, cx, cz } = blk, r = this.rng, k = this.kit;
    this.groundPlane(bx0, bz0, bx1, bz1, Mats.grass(), 0xffffff);
    this.world.mapRects.push({ x0: bx0, z0: bz0, x1: bx1, z1: bz1, type: 'park' });
    // paths (cross + ring)
    const path = (x0, z0, x1, z1) => this.groundPlane(x0, z0, x1, z1, Mats.paving(), 0xd8c8b0, 0.17);
    path(cx - 1.8, bz0, cx + 1.8, bz1); path(bx0, cz - 1.8, bx1, cz + 1.8);
    path(bx0 + 6, bz0 + 6, bx1 - 6, bz0 + 9); path(bx0 + 6, bz1 - 9, bx1 - 6, bz1 - 6);
    path(bx0 + 6, bz0 + 6, bx0 + 9, bz1 - 6); path(bx1 - 9, bz0 + 6, bx1 - 6, bz1 - 6);
    if (blk.j === 3) {
      // pond in one quadrant
      const px = cx + 16, pz = cz + 16;
      const pg = new THREE.CircleGeometry(9, 32); pg.rotateX(-Math.PI / 2); pg.translate(px, 0.12, pz);
      this.b.add(pg, Mats.water(), { cast: false });
      const rimG = new THREE.RingGeometry(9, 9.8, 32); rimG.rotateX(-Math.PI / 2); rimG.translate(px, 0.2, pz);
      this.b.add(rimG, Mats.concrete(), { color: 0x9a9488, cast: false });
      this.col.add(px - 8, 0, pz - 8, px + 8, 0.6, pz + 8, { noCam: true });
      this.world.mapRects.push({ x0: px - 9, z0: pz - 9, x1: px + 9, z1: pz + 9, type: 'water', round: true });
      // gazebo
      const gx = cx - 16, gz = cz - 16; k.at(gx, 0.15, gz);
      k.cyl(0, 0, 0, 4.2, 4.4, 0.4, Mats.wood(), 0xd8c8b0);
      this.col.add(gx - 4.2, 0, gz - 4.2, gx + 4.2, 0.55, gz + 4.2, { low: true, noCam: true });
      for (let a = 0; a < 6; a++) { const ang = (a / 6) * Math.PI * 2; k.cyl(Math.cos(ang) * 3.8, 0.4, Math.sin(ang) * 3.8, 0.12, 0.12, 2.8, Mats.paint(), 0xffffff, { collide: true }); }
      const roof = new THREE.ConeGeometry(5, 1.8, 6); roof.translate(0, 4.1, 0); k.geo(roof, Mats.tileRoof(), 0x7a3a2a);
    }
    for (let n = 0; n < 26; n++) {
      const x = r.range(bx0 + 3, bx1 - 3), z = r.range(bz0 + 3, bz1 - 3);
      if (Math.abs(x - cx) < 4 || Math.abs(z - cz) < 4) continue;
      if (blk.j === 3 && Math.hypot(x - cx - 16, z - cz - 16) < 12) continue;
      if (blk.j === 3 && Math.hypot(x - cx + 16, z - cz + 16) < 7) continue;
      this.tree(x, z, r.range(0.8, 1.4), r.chance(0.3) ? 'pine' : 'round');
    }
    for (let n = 0; n < 8; n++) {
      const along = r.range(-25, 25);
      if (n % 2) this.bench(cx + 3, cz + along, -Math.PI / 2); else this.bench(cx + along, cz + 3, Math.PI);
    }
    for (let n = 0; n < 6; n++) this.parkLamp(cx + (n % 2 ? 3 : -3), cz - 25 + n * 10);
  }
  parking(blk) {
    const { bx0, bx1, bz0, bz1 } = blk, k = this.kit;
    this.groundPlane(bx0, bz0, bx1, bz1, Mats.asphalt(), 0xc8c8c8);
    this.world.mapRects.push({ x0: bx0, z0: bz0, x1: bx1, z1: bz1, type: 'parking' });
    // stalls: rows along x, cars park facing +-z
    const lane = Mats.lane();
    this.world.parkingSpots = this.world.parkingSpots || [];
    for (const rowZ of [bz0 + 8, bz0 + 26, bz0 + 44, bz0 + 62]) {
      for (let x = bx0 + 4; x < bx0 + 42; x += 3) {
        const g = planeXZ(0.12, 5, 1); g.translate(x, 0.17, rowZ); this.b.add(g, lane, { color: 0xf0f0f0, cast: false });
        if (x + 3 < bx0 + 42) this.world.parkingSpots.push({ x: x + 1.5, z: rowZ, heading: rowZ < blk.cz ? 0 : Math.PI });
      }
    }
    // Fix & Go garage reserved on the east (built by interiors)
    // booth + barrier at entrance
    k.at(bx0 + 3, 0.15, bz1 - 4);
    k.box(0, 0, 0, 2.2, 2.6, 2.2, Mats.paint(), 0xe8e4dc);
    k.box(0, 2.6, 0, 2.6, 0.2, 2.6, Mats.metal(), 0x2a5a8a, { collide: false });
  }
  houses(blk) {
    const r = this.rng;
    this.groundPlane(blk.bx0, blk.bz0, blk.bx1, blk.bz1, Mats.grass(), 0xffffff);
    const lotW = (blk.bx1 - blk.bx0) / 3, depth = (blk.bz1 - blk.bz0) / 2;
    for (const front of ['N', 'S']) for (let n = 0; n < 3; n++) {
      const x0 = blk.bx0 + n * lotW, x1 = x0 + lotW;
      const z0 = front === 'N' ? blk.bz0 : blk.bz0 + depth, z1 = z0 + depth;
      if (this.isReserved(x0, z0, x1, z1)) continue;
      this.house(x0, z0, x1, z1, front, r);
    }
  }
  house(x0, z0, x1, z1, front, r) {
    const k = this.kit;
    const w = r.range(10, 14), d = r.range(9, 12), setback = r.range(7, 9);
    const cx = (x0 + x1) / 2 + r.range(-2, 2);
    const hz0 = front === 'N' ? z0 + setback : z1 - setback - d, hz1 = hz0 + d;
    const modern = r.chance(0.6);
    const tint = r.pick([0xffffff, 0xf4ece0, 0xe8f0f4, 0xf8f0dc, 0xe0e0d8]);
    const floors = r.chance(0.6) ? 2 : 1;
    const h = floors * 3.3;
    this.building({ x0: cx - w / 2, z0: hz0, x1: cx + w / 2, z1: hz1, h, kind: modern ? 'stucco' : 'brick', seed: 1, tint, front, store: false, roofProps: false });
    if (!modern) {
      // gable roof
      const R = (d / 2 + 0.5) / 0.866, sy = 0.45;
      const g = new THREE.CylinderGeometry(R, R, w + 0.6, 3, 1); // triangular prism
      g.rotateZ(Math.PI / 2); g.rotateX(-Math.PI / 2); g.scale(1, sy, 1);
      g.translate(cx, h + 0.5 * R * sy, (hz0 + hz1) / 2);
      this.b.add(g, Mats.tileRoof(), { color: r.pick([0x8a3a2a, 0x4a4a52, 0x6a4a3a]) });
    } else {
      // flat roof overhang + big glass
      k.at(cx, h, (hz0 + hz1) / 2); k.box(0, 0, 0, w + 1.6, 0.3, d + 1.6, Mats.paint(), 0x2a2a2a, { collide: false });
    }
    // front door + windows overlay
    const fz = front === 'N' ? hz0 - 0.02 : hz1 + 0.02, rot = front === 'N' ? Math.PI : 0;
    k.at(cx, 0.15, fz, rot);
    k.box(0, 0, 0.03, 1.1, 2.2, 0.06, Mats.wood(), 0x5a3a2a, { collide: false });
    if (modern) k.box(-w / 4, 0.4, 0.03, w / 3, 2.2, 0.04, Mats.darkGlass(), 0xffffff, { collide: false });
    // driveway + garage door
    const dz0 = front === 'N' ? z0 : hz1, dz1 = front === 'N' ? hz0 : z1;
    const dx = cx + w / 2 - 2.2;
    this.groundPlane(dx - 1.8, dz0, dx + 1.8, dz1, Mats.paving(), 0xb8b0a4, 0.17);
    k.at(dx, 0.15, fz, rot); k.box(0, 0, 0.03, 3, 2.4, 0.05, Mats.metal(), 0xd8d8d8, { collide: false });
    // hedge along street with gap for path/driveway
    const hzEdge = front === 'N' ? z0 + 0.6 : z1 - 0.6;
    k.at(0, 0.15, 0);
    const hedgeColor = 0x3a6a32;
    k.box((x0 + cx - 1.2) / 2 + 0.3, 0, hzEdge, (cx - 1.2) - x0 - 0.6, 1.0, 0.8, Mats.leaves(), hedgeColor);
    if (x1 - (dx + 2) > 1) k.box((dx + 2 + x1) / 2, 0, hzEdge, x1 - (dx + 2) - 0.6, 1.0, 0.8, Mats.leaves(), hedgeColor);
    this.groundPlane(cx - 0.8, Math.min(hzEdge, fz), cx + 0.8, Math.max(hzEdge, fz), Mats.paving(), 0xd8d0c0, 0.17);
    // yard trees, maybe a pool in the back
    this.tree(x0 + 3, front === 'N' ? z1 - 4 : z0 + 4, r.range(0.8, 1.2), r.chance(0.4) ? 'palm' : 'round');
    if (r.chance(0.35)) {
      const pz = front === 'N' ? hz1 + 5 : hz0 - 5;
      const pg = planeXZ(6, 3.5, 1); pg.translate(cx, 0.2, pz); this.b.add(pg, Mats.pool(), { cast: false });
      k.at(cx, 0.15, pz); k.box(0, 0, -2, 7, 0.1, 0.5, Mats.tiles(), 0xffffff, { collide: false }); k.box(0, 0, 2, 7, 0.1, 0.5, Mats.tiles(), 0xffffff, { collide: false });
    }
  }
  beachBlock(blk) {
    const r = this.rng;
    this.groundPlane(blk.bx0, blk.bz0, blk.bx1, blk.bz1, Mats.paving(), 0xf0e4d0);
    const tints = [0xffffff, 0xfff4e4, 0xf4fbff, 0xffeedd, 0xe8fff8];
    this.perimeter(blk, 16, 20, 14, 14, 14, 24, (rc, front) => {
      const floors = front === 'S' ? r.int(3, 7) : r.int(2, 5);
      this.building({ ...rc, h: floors * 3.5 + 0.5, kind: r.pick(['stucco', 'stucco', 'glass', 'apartment']), seed: r.int(1, 2), tint: r.pick(tints), front, store: true, sign: front === 'S' ? r.pick(['HOTEL SOLARA', 'SURF CO.', 'BEACH CLUB', 'GELATO', 'PALMS INN', 'TIDE BAR', 'MARINA CAFÉ']) : null });
      if (front === 'S') this.balconies(rc, front, floors);
    }, 0.2);
    for (let n = 0; n < 5; n++) this.tree(r.range(blk.cx - 14, blk.cx + 14), r.range(blk.cz - 14, blk.cz + 14), r.range(0.9, 1.3), 'palm');
  }

  // ------------------------------------------------------------ props
  tree(x, z, s = 1, type = 'round', y = 0.15) {
    const k = this.kit.at(x, y, z), r = this.rng;
    if (type === 'palm') {
      const h = 7 * s + r.range(0, 3), lean = r.range(-0.12, 0.12), leanZ = r.range(-0.12, 0.12);
      let px = 0, pz = 0;
      const segs = 6;
      for (let i = 0; i < segs; i++) {
        const sh = h / segs, rad = 0.22 * s * (1 - i * 0.07);
        const g = new THREE.CylinderGeometry(rad * 0.9, rad, sh + 0.05, 7);
        g.rotateZ(-lean * (1 + i * 0.25)); g.rotateX(leanZ * (1 + i * 0.25));
        g.translate(px, i * sh + sh / 2, pz);
        k.geo(g, Mats.bark(), 0x9a8060);
        px += Math.sin(lean * (1 + i * 0.25)) * sh; pz += Math.sin(leanZ * (1 + i * 0.25)) * sh;
      }
      const fr = 9;
      for (let i = 0; i < fr; i++) {
        const a = (i / fr) * Math.PI * 2 + r.range(0, 0.4), len = 3.6 * s;
        const g = new THREE.PlaneGeometry(0.9 * s, len, 1, 5);
        const pos = g.attributes.position;
        for (let v = 0; v < pos.count; v++) {
          const t = (pos.getY(v) + len / 2) / len; // 0 base -> 1 tip
          pos.setZ(v, -t * t * 1.8 * s); pos.setX(v, pos.getX(v) * (1 - t * 0.7));
        }
        g.translate(0, len / 2, 0); g.rotateX(-Math.PI / 2 + 0.5); g.rotateY(a);
        g.translate(px, h, pz); g.computeVertexNormals();
        k.geo(g, this.world.frondMat, r.pick([0x4a7a2a, 0x5a8a32, 0x3f6a26]));
      }
      this.col.add(x - 0.25, 0, z - 0.25, x + 0.25, h, z + 0.25, { noCam: true });
      return;
    }
    const th = (type === 'pine' ? 2.2 : 2.6) * s;
    k.cyl(0, 0, 0, 0.14 * s, 0.22 * s, th, Mats.bark(), 0x5a4232, { seg: 7 });
    if (type === 'pine') {
      for (let i = 0; i < 3; i++) { const g = new THREE.ConeGeometry((2.2 - i * 0.55) * s, 2.6 * s, 8); g.translate(0, th + i * 1.4 * s + 0.6, 0); k.geo(g, Mats.leaves(), r.pick([0x2a5a32, 0x30603a, 0x26502c])); }
    } else {
      const col = r.pick([0x4a7a32, 0x5a8a3a, 0x3e6e2e, 0x6a8a3a]);
      for (let i = 0; i < 4; i++) {
        const g = new THREE.IcosahedronGeometry(r.range(1.3, 1.9) * s, 1);
        const p = g.attributes.position; for (let v = 0; v < p.count; v++) p.setXYZ(v, p.getX(v) * r.range(0.9, 1.1), p.getY(v) * r.range(0.85, 1.05), p.getZ(v) * r.range(0.9, 1.1));
        g.translate(r.range(-0.9, 0.9) * s, th + r.range(0.6, 1.8) * s, r.range(-0.9, 0.9) * s);
        k.geo(g, Mats.leaves(), col);
      }
    }
    this.col.add(x - 0.25, 0, z - 0.25, x + 0.25, th + 3, z + 0.25, { noCam: true });
  }
  bench(x, z, rot = 0, y = 0.15) {
    const k = this.kit.at(x, y, z, rot);
    k.box(0, 0.42, 0, 1.8, 0.06, 0.5, Mats.wood(), 0xffffff, { collide: false });
    k.box(0, 0.5, -0.23, 1.8, 0.4, 0.05, Mats.wood(), 0xffffff, { collide: false });
    k.box(-0.8, 0, 0, 0.08, 0.45, 0.5, Mats.metal(), 0x222222, { collide: false });
    k.box(0.8, 0, 0, 0.08, 0.45, 0.5, Mats.metal(), 0x222222, { collide: false });
    k.collider(-0.9, 0, -0.27, 0.9, 0.5, 0.27);
    const sp = k.point(0, 0, 0.15);
    this.world.benches.push({ x: sp.x, z: sp.z, y, rot, taken: false });
  }
  parkLamp(x, z) {
    const k = this.kit.at(x, 0.15, z);
    k.cyl(0, 0, 0, 0.06, 0.09, 3.6, Mats.metal(), 0x1a1a1a, { seg: 8 });
    k.sphere(0, 3.8, 0, 0.3, Mats.lamp(), 0xffffff, { seg: 10, cast: false });
    this.col.add(x - 0.12, 0, z - 0.12, x + 0.12, 3.6, z + 0.12, { noCam: true });
    this.world.addLightAnchor(new THREE.Vector3(x, 3.7, z), 0xffd6a0, 6, 14, false);
    this.glowDecal(x, z, 5);
  }
  glowDecal(x, z, size, y = 0.18) {
    const g = planeXZ(size * 2, size * 2, size * 2); g.translate(x, y, z);
    this.b.add(g, this.world.glowDecalMat, { cast: false, receive: false });
  }
  streetLamp(x, z, ax, az, y = 0.15) {
    // (ax,az): unit vector pointing over the road
    const rot = Math.atan2(ax, az);
    const k = this.kit.at(x, y, z, rot);
    k.cyl(0, 0, 0, 0.09, 0.14, 7.6, Mats.metal(), 0x2e3236, { seg: 8 });
    const arm = new THREE.BoxGeometry(0.1, 0.1, 2.6); arm.translate(0, 7.5, 1.25); k.geo(arm, Mats.metal(), 0x2e3236);
    k.box(0, 7.32, 2.5, 0.42, 0.18, 0.8, Mats.metal(), 0x2e3236, { collide: false });
    const bulb = new THREE.BoxGeometry(0.34, 0.04, 0.68); bulb.translate(0, 7.3, 2.5); k.geo(bulb, Mats.lamp(), 0xffffff, { cast: false });
    this.col.add(x - 0.15, y - 0.15, z - 0.15, x + 0.15, y + 7.6, z + 0.15, { noCam: true });
    const p = k.point(0, 7.1, 2.5);
    this.world.addLightAnchor(p, 0xffc88a, 9, 20, false);
    this.glowDecal(p.x, p.z, 6.5, y - 0.13);
  }
  trafficSignal(cx, cz, dx, dz, group) {
    // Approach traveling in direction (dx,dz). Pole on near-right corner.
    const rx = -dz, rz = dx;
    const px = cx - dx * 9.6 + rx * 9.3, pz = cz - dz * 9.6 + rz * 9.3;
    const axis = dx !== 0 ? 1 : 0; // 1 = EW traffic
    const face = Math.atan2(-dx, -dz);
    const k = this.kit.at(px, 0.15, pz, face);
    k.cyl(0, 0, 0, 0.12, 0.16, 6.2, Mats.metal(), 0x3a3e40, { seg: 8 });
    // mast arm toward lanes: local direction for -right
    const armLen = 6.2;
    const [lx, lz] = [-rx, -rz];
    // convert world dir to local: local = R^-1 * world
    const c = Math.cos(face), s = Math.sin(face);
    const llx = lx * c - lz * s, llz = lx * s + lz * c;
    const ag = new THREE.BoxGeometry(0.12, 0.12, armLen); ag.rotateY(Math.atan2(llx, llz)); ag.translate(llx * armLen / 2, 5.9, llz * armLen / 2);
    k.geo(ag, Mats.metal(), 0x3a3e40);
    for (const off of [3.4, 5.9]) {
      const hx = llx * off, hz = llz * off;
      k.box(hx, 4.9, hz, 0.42, 1.25, 0.32, Mats.metal(), 0x1a1c1e, { collide: false });
      ['red', 'yellow', 'green'].forEach((col, ci) => {
        const g = new THREE.CircleGeometry(0.13, 12); g.translate(hx, 5.9 - ci * 0.4, hz + 0.17);
        k.geo(g, signalMats[group][axis][ci], 0xffffff, { cast: false });
      });
    }
    // pedestrian push-button box + walk light
    k.box(0, 1.1, 0.14, 0.18, 0.28, 0.1, Mats.metal(), 0xd8b030, { collide: false });
    this.col.add(px - 0.18, 0, pz - 0.18, px + 0.18, 6.2, pz + 0.18, { noCam: true });
  }
  buildStreetFurniture() {
    const r = this.rng;
    for (const x of LINES) for (const z of LINES) {
      const gi = LINES.indexOf(x), gj = LINES.indexOf(z), group = (gi + gj) % 2;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ax = x - dx * 20, az = z - dz * 20;
        if (ax < -280 || ax > 280 || az < -280 || az > 280) continue;
        this.trafficSignal(x, z, dx, dz, group);
      }
    }
    // street lamps & sidewalk trees along each segment
    for (let k = 0; k < 6; k++) for (const c of LINES) {
      const a = LINES[k], e = LINES[k + 1];
      for (const side of [-1, 1]) {
        const off = side * (ROAD_HALF + 0.8);
        for (let s = a + 25; s < e - 20; s += 32) {
          // horizontal road (along x at z=c): lamp at z=c+off, arm toward road (-side)
          if (!(c === -180 && e <= -90)) this.streetLamp(s, c + off, 0, -side);
          this.streetLamp(c + off, s + 8, -side, 0);
        }
        // sidewalk trees / palms
        const palmRoad = c === 270;
        for (let s = a + 16; s < e - 12; s += palmRoad ? 11 : 18) {
          const tz = c + side * (ROAD_HALF + 2.2);
          const blockHere = this.sidewalkTreeOK(s, tz);
          if (blockHere) this.tree(s + 4, tz, palmRoad ? 1.1 : 0.7, palmRoad ? 'palm' : 'round');
          const tx = c + side * (ROAD_HALF + 2.2);
          if (this.sidewalkTreeOK(tx, s)) this.tree(tx, s + 4, 0.7, 'round');
        }
        // hydrants & bins
        for (let s = a + 30; s < e - 20; s += 45) {
          this.hydrant(s - 6, c + side * (ROAD_HALF + 0.6));
          if (r.chance(0.6)) this.bin(c + side * (ROAD_HALF + 0.6), s - 4);
        }
      }
    }
    // Ocean Drive promenade palms
    for (let x = -280; x <= 280; x += 14) this.tree(x, 286, 1.2, 'palm');
    for (let x = -276; x <= 276; x += 24) this.streetLamp(x + 6, 279, 0, -1);
    // bus stops
    for (const [x, z, rot] of [[-45, 10.4, 0], [135, -79.4, Math.PI], [45, 259.6, Math.PI], [-200, 100.4, 0], [200, -169.6, Math.PI]]) this.busStop(x, z, rot);
  }
  sidewalkTreeOK(x, z) {
    // avoid lantern row (signs) and downtown (narrow) occasionally
    if (z > -195 && z < -165 && x < -90) return false;
    return true;
  }
  hydrant(x, z) {
    const k = this.kit.at(x, 0.15, z);
    k.cyl(0, 0, 0, 0.15, 0.18, 0.7, Mats.paint(), 0xc82a1a, { seg: 8 });
    k.sphere(0, 0.72, 0, 0.16, Mats.paint(), 0xc82a1a, { seg: 8 });
    this.col.add(x - 0.18, 0, z - 0.18, x + 0.18, 0.8, z + 0.18, { noCam: true, hydrant: true });
  }
  bin(x, z) {
    const k = this.kit.at(x, 0.15, z);
    k.cyl(0, 0, 0, 0.3, 0.26, 0.95, Mats.metal(), 0x2a4a3a, { seg: 10 });
    this.col.add(x - 0.3, 0, z - 0.3, x + 0.3, 1, z + 0.3, { noCam: true });
  }
  busStop(x, z, rot) {
    const k = this.kit.at(x, 0.15, z, rot);
    k.box(0, 2.5, 0, 4, 0.12, 1.6, Mats.metal(), 0x2a2e32, { collide: false });
    k.box(0, 0, -0.75, 4, 2.5, 0.05, Mats.glass(), 0xffffff, { collide: false });
    k.box(-1.95, 0, 0, 0.08, 2.5, 1.6, Mats.metal(), 0x2a2e32, { collide: false });
    k.box(1.7, 0.3, -0.7, 1.2, 1.9, 0.08, Mats.glow(), 0xb8d8ff, { collide: false });
    k.box(-0.3, 0.42, -0.45, 2.4, 0.06, 0.4, Mats.wood(), 0xffffff, { collide: false });
    k.collider(-2, 0, -0.8, 2, 2.6, -0.6);
    const sp = k.point(-0.3, 0, -0.3);
    this.world.benches.push({ x: sp.x, z: sp.z, rot, taken: false });
  }
  // ------------------------------------------------------------ Lantern Row
  buildLanternRow() {
    const zN = -190.5, zS = -169.5, k = this.kit;
    const lanternMat = this.world.lanternMat;
    for (let x = -262; x <= -98; x += 9) {
      const n = 12;
      for (let i = 0; i <= n; i++) {
        const t = i / n, z = zN + 0.6 + (zS - zN - 1.2) * t;
        const y = 7.6 - Math.sin(t * Math.PI) * 1.2;
        if (i > 0 && i < n) {
          const g = new THREE.SphereGeometry(0.26, 10, 8); g.scale(1, 1.25, 1); g.translate(x, y - 0.35, z);
          this.b.add(g, lanternMat, { color: 0xffffff, cast: false });
          const cap = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 8); cap.translate(x, y - 0.03, z);
          this.b.add(cap, Mats.metal(), { color: 0x222222, cast: false });
        }
      }
      // cable as thin segments
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const z0 = zN + 0.6 + (zS - zN - 1.2) * t0, z1 = zN + 0.6 + (zS - zN - 1.2) * t1;
        const y0 = 7.6 - Math.sin(t0 * Math.PI) * 1.2, y1 = 7.6 - Math.sin(t1 * Math.PI) * 1.2;
        const len = Math.hypot(z1 - z0, y1 - y0);
        const g = new THREE.BoxGeometry(0.025, 0.025, len); g.rotateX(Math.atan2(y0 - y1, z1 - z0)); g.translate(x, (y0 + y1) / 2, (z0 + z1) / 2);
        this.b.add(g, Mats.metal(), { color: 0x111111, cast: false });
      }
      if ((x + 262) % 27 === 0) this.world.addLightAnchor(new THREE.Vector3(x, 6.6, -180), 0xff6a4a, 5, 14, false, true);
    }
    // street vendor stalls on sidewalks
    for (const [x, z, rot] of [[-240, -173, 0], [-200, -187, Math.PI], [-130, -173, 0], [-115, -187, Math.PI]]) {
      k.at(x, 0.15, z, rot);
      k.box(0, 0, 0, 2.2, 0.95, 1.0, Mats.wood(), 0x7a4a2a);
      k.box(0, 2.3, 0, 2.6, 0.08, 1.5, Mats.fabric(), 0xb82a2a, { collide: false });
      for (const sx of [-1.2, 1.2]) k.box(sx, 0.95, -0.4, 0.06, 1.35, 0.06, Mats.metal(), 0x222222, { collide: false });
      for (let i = 0; i < 6; i++) k.box(-0.8 + i * 0.32, 0.95, 0.1, 0.22, 0.12, 0.3, Mats.plastic(), [0xf2c84a, 0xd84a3a, 0x4ab86a][i % 3], { collide: false });
      this.world.addLightAnchor(k.point(0, 2.0, 0), 0xffb070, 3, 6, false);
    }
  }
}

export { nightMaterials };
