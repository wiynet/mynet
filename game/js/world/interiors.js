// Enterable buildings with fully modeled interiors: the Vega villa (two floors,
// staircase, connected rooms), the safehouse, shops, noodle bar, tower lobby and garage.
import * as THREE from 'three';
import { Kit, Furniture } from './kit.js';
import { Mats, facadeMat, signMat } from './materials.js';
import { wallQuad } from './city.js';
import { planeXZ, worldBox } from './builder.js';
import { VILLA } from './layout.js';

// Lots the procedural city must leave empty.
export const RESERVED = [
  { x0: 123.5, z0: 100.5, x1: 146.5, z1: 135 },   // safehouse
  { x0: -152, z0: 10.5, x1: -128, z1: 30 },       // QuikMart
  { x0: -132, z0: -30, x1: -108, z1: -10.5 },     // Thread & Co.
  { x0: -158, z0: -169.5, x1: -142, z1: -152 },   // Noodle house
  { x0: -70, z0: -140, x1: -20, z1: -100.5 },     // Meridian tower
  { x0: 56, z0: 12, x1: 79.5, z1: 48 },           // Fix & Go
  { x0: 205, z0: -120, x1: 245, z1: -100.5 },     // Police
  { x0: -245, z0: -28, x1: -205, z1: -10.5 },     // Clinic
];

export class Interiors {
  constructor(world) {
    this.world = world; this.kit = new Kit(world); this.b = world.batcher; this.col = world.collision;
  }
  build() {
    this.villa();
    this.safehouse();
    this.quikmart();
    this.clothing();
    this.noodle();
    this.tower();
    this.garage();
    this.police();
    this.clinic();
  }

  // ---------------------------------------------------------- primitives
  /** Axis-aligned wall from (x0,z0) to (x1,z1) with openings [{c,w,b,t,glass}]. */
  wall(x0, z0, x1, z1, y0, y1, { t = 0.2, mat = Mats.paint(), color = 0xf2efe9, openings = [], cast = true } = {}) {
    const alongX = z0 === z1;
    const L = alongX ? x1 - x0 : z1 - z0;
    const piece = (s0, s1, a, b) => {
      if (s1 - s0 < 0.01 || b - a < 0.01) return;
      const cx = alongX ? x0 + (s0 + s1) / 2 : x0, cz = alongX ? z0 : z0 + (s0 + s1) / 2;
      const sx = alongX ? s1 - s0 : t, sz = alongX ? t : s1 - s0;
      const g = worldBox(sx, b - a, sz, 2); g.translate(cx, a + (b - a) / 2, cz);
      this.b.add(g, mat, { color, cast });
      this.col.add(cx - sx / 2, a, cz - sz / 2, cx + sx / 2, b, cz + sz / 2);
    };
    const ops = [...openings].sort((a, b) => a.c - b.c);
    let s = 0;
    for (const o of ops) {
      const a = o.c - o.w / 2, e = o.c + o.w / 2;
      piece(s, a, y0, y1);
      const ob = y0 + (o.b || 0), ot = y0 + (o.t != null ? o.t : 2.3);
      piece(a, e, y0, ob);
      piece(a, e, ot, y1);
      if (o.glass) {
        const cx = alongX ? x0 + (a + e) / 2 : x0, cz = alongX ? z0 : z0 + (a + e) / 2;
        const sx = alongX ? e - a : 0.04, sz = alongX ? 0.04 : e - a;
        const g = new THREE.BoxGeometry(sx, ot - ob, sz); g.translate(cx, ob + (ot - ob) / 2, cz);
        this.b.add(g, Mats.glass(), { cast: false });
        // mullion
        const mg = new THREE.BoxGeometry(alongX ? e - a : 0.08, 0.08, alongX ? 0.08 : e - a); mg.translate(cx, ot - 0.04, cz);
        this.b.add(mg, Mats.metal(), { color: 0x222222 });
        this.col.add(cx - sx / 2 - 0.05, ob, cz - sz / 2 - 0.05, cx + sx / 2 + 0.05, ot, cz + sz / 2 + 0.05);
      }
      s = e;
    }
    piece(s, L, y0, y1);
  }
  slab(x0, z0, x1, z1, yTop, th, mat, color = 0xffffff, { collide = true, tile = 2, under = null } = {}) {
    const g = worldBox(x1 - x0, th, z1 - z0, tile); g.translate((x0 + x1) / 2, yTop - th / 2, (z0 + z1) / 2);
    this.b.add(g, mat, { color, cast: true });
    if (under) { const u = planeXZ(x1 - x0, z1 - z0, 2); u.rotateX(Math.PI); u.translate((x0 + x1) / 2, yTop - th - 0.005, (z0 + z1) / 2); this.b.add(u, under, { color: 0xf4f2ee, cast: false }); }
    if (collide) this.col.add(x0, yTop - th, z0, x1, yTop, z1);
  }
  /** Solid upper volume with facade (for shops whose upper floors are not enterable). */
  upper(x0, z0, x1, z1, y0, y1, kind, seed, tint) {
    const fm = facadeMat(kind, seed);
    for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x1, z1, x0, z1], [x0, z1, x0, z0], [x1, z0, x1, z1]]) this.b.add(wallQuad(ax, az, bx, bz, y0, y1, 24, 56, y0 - 0.5), fm, { color: tint });
    const rg = planeXZ(x1 - x0, z1 - z0, 6); rg.translate((x0 + x1) / 2, y1, (z0 + z1) / 2); this.b.add(rg, Mats.roof(), { color: 0x8a8884 });
    const bg = planeXZ(x1 - x0, z1 - z0, 6); bg.rotateX(Math.PI); bg.translate((x0 + x1) / 2, y0, (z0 + z1) / 2); this.b.add(bg, Mats.paint(), { color: 0x8a8884 });
    this.col.add(x0, y0, z0, x1, y1, z1);
    this.world.mapRects.push({ x0, z0, x1, z1, type: 'building', h: y1 });
  }
  /** Hinged interactive door. Axis: hinge at (hx,hz); door extends along +x (alongX) or +z. */
  door(hx, y, hz, width, alongX, { color = 0x5a3a2a, swing = 1, label = 'door', glass = false, h = 2.2 } = {}) {
    const pivot = new THREE.Group(); pivot.position.set(hx, y, hz);
    const g = new THREE.BoxGeometry(alongX ? width : 0.06, h, alongX ? 0.06 : width);
    g.translate(alongX ? width / 2 : 0, h / 2, alongX ? 0 : width / 2);
    const m = new THREE.Mesh(g, glass ? Mats.glass() : new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    m.castShadow = true; m.receiveShadow = true; pivot.add(m);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd8c080, metalness: 1, roughness: 0.2 }));
    knob.position.set(alongX ? width - 0.12 : 0.05, 1.0, alongX ? 0.05 : width - 0.12); pivot.add(knob);
    this.world.scene.add(pivot);
    const c = alongX ? this.col.add(hx, y, hz - 0.08, hx + width, y + h, hz + 0.08, { door: true }) : this.col.add(hx - 0.08, y, hz, hx + 0.08, y + h, hz + width, { door: true });
    const d = { pivot, open: false, angle: 0, target: 0, collider: c, swing };
    const center = new THREE.Vector3(hx + (alongX ? width / 2 : 0), y + 1, hz + (alongX ? 0 : width / 2));
    this.world.addInteractable({
      pos: center, radius: 1.9, label: () => (d.open ? 'Close ' : 'Open ') + label,
      action: () => { d.open = !d.open; d.target = d.open ? swing * Math.PI / 2 * 0.95 : 0; c.enabled = !d.open; this.world.audio.door(); },
      update: (t, dt) => { d.angle += (d.target - d.angle) * Math.min(1, dt * 6); pivot.rotation.y = d.angle; },
    });
    return d;
  }
  /** Automatic sliding glass doors that open when the player (or NPC) is near. */
  autoDoor(cx, y, cz, width, alongX, h = 2.5) {
    const mtl = Mats.glass();
    const half = width / 2;
    const panels = [-1, 1].map((s) => {
      const g = new THREE.BoxGeometry(alongX ? half : 0.06, h, alongX ? 0.06 : half);
      const m = new THREE.Mesh(g, mtl); this.world.scene.add(m);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(alongX ? half : 0.08, 0.08, alongX ? 0.08 : half), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 }));
      frame.position.y = -h / 2 + 0.04; m.add(frame);
      return { m, s };
    });
    const c = alongX ? this.col.add(cx - half, y, cz - 0.08, cx + half, y + h, cz + 0.08, { door: true }) : this.col.add(cx - 0.08, y, cz - half, cx + 0.08, y + h, cz + half, { door: true });
    let open = 0;
    this.world.addInteractable({
      pos: new THREE.Vector3(cx, y + 1, cz), radius: 0, label: '', action: () => {},
      update: (t, dt) => {
        const p = this.world.game.player.position;
        const near = Math.hypot(p.x - cx, p.z - cz) < 3.2 && Math.abs(p.y - y) < 2;
        open += ((near ? 1 : 0) - open) * Math.min(1, dt * 5);
        c.enabled = open < 0.6;
        for (const { m, s } of panels) {
          const off = s * (half / 2 + open * half * 0.95);
          m.position.set(cx + (alongX ? off : 0), y + h / 2, cz + (alongX ? 0 : off));
        }
      },
    });
  }
  indoor(x0, y0, z0, x1, y1, z1, name) { this.world.indoorZones.push({ x0, y0, z0, x1, y1, z1, name }); }

  // ---------------------------------------------------------- villa
  villa() {
    const k = this.kit, W = this.world;
    const y0 = VILLA.y, y1 = y0 + 3.8, yTop = y1 + 3.6;
    const X0 = -15, X1 = 15, Z0 = -604, Z1 = -584;
    const white = 0xf4f1ec;
    // Terrace deck + pool
    this.slab(-24, Z1, 24, -560, y0 + 0.12, 0.12, Mats.woodFloor(), 0xc8a888, { tile: 3 });
    this.col.boxes[this.col.boxes.length - 1].low = true;
    const pg = planeXZ(14, 5.5, 2); pg.translate(-8, y0 + 0.08, -575); this.b.add(pg, Mats.pool(), { cast: false });
    this.col.add(-15, y0 - 1, -577.75, -1, y0 + 0.5, -572.25, { noCam: true });
    k.at(-8, y0, -575);
    k.box(0, 0, -3, 14.6, 0.16, 0.5, Mats.tiles(), 0xffffff, { collide: false }); k.box(0, 0, 3, 14.6, 0.16, 0.5, Mats.tiles(), 0xffffff, { collide: false });
    for (const lx of [4, 8, 12]) { k.at(lx, y0 + 0.12, -574, 0); k.box(0, 0, 0, 0.75, 0.32, 1.9, Mats.fabric(), 0xf0f0f0); k.box(0, 0.32, -0.75, 0.75, 0.5, 0.25, Mats.fabric(), 0xf0f0f0, { collide: false }); }
    // Floor slabs
    this.slab(X0, Z0, X1, Z1, y0 + 0.15, 0.3, Mats.marble(), 0xffffff, { tile: 3 });
    // Upper slab with stairwell hole (x 1..3, z -596..-589)
    const ut = y1 + 0.2;
    this.slab(X0, Z0, 1, Z1, ut, 0.25, Mats.woodFloor(), 0xd0b090, { under: Mats.paint() });
    this.slab(3, Z0, X1, Z1, ut, 0.25, Mats.woodFloor(), 0xd0b090, { under: Mats.paint() });
    this.slab(1, Z0, 3, -596, ut, 0.25, Mats.woodFloor(), 0xd0b090, { under: Mats.paint() });
    this.slab(1, -589, 3, Z1, ut, 0.25, Mats.woodFloor(), 0xd0b090, { under: Mats.paint() });
    // Roof with overhang
    this.slab(X0 - 1.5, Z0 - 1, X1 + 1.5, Z1 + 2.5, yTop + 0.35, 0.35, Mats.paint(), 0x2a2a2c, { under: Mats.wood() });
    // ---- ground floor walls
    const gy0 = y0 + 0.15, gy1 = ut - 0.25;
    this.wall(X0, Z0, X1, Z0, gy0, gy1, { openings: [{ c: 6, w: 3, b: 0.9, t: 2.6, glass: true }, { c: 24, w: 3, b: 0.9, t: 2.6, glass: true }] });
    this.wall(X0, Z0, X0, Z1, gy0, gy1, { color: 0xe8e2d8, openings: [{ c: 10, w: 4, b: 0.6, t: 3.0, glass: true }] });
    this.wall(X1, Z0, X1, Z1, gy0, gy1, { openings: [{ c: 7, w: 3, b: 0.9, t: 2.6, glass: true }] });
    // south facade: floor-to-ceiling glass, main door at x=8, slider at x=-6
    this.wall(X0, Z1, X1, Z1, gy0, gy1, {
      openings: [{ c: 3.5, w: 6, b: 0, t: 3.3, glass: true }, { c: 9, w: 2.4, b: 0, t: 2.5 }, { c: 15.5, w: 5, b: 0, t: 3.3, glass: true }, { c: 23, w: 1.4, b: 0, t: 2.3 }, { c: 27.3, w: 4.6, b: 0, t: 3.3, glass: true }],
    });
    this.autoDoor(-6, gy0, Z1, 2.4, true, 2.5);
    this.door(8 - 0.7, gy0, Z1, 1.4, true, { label: 'front door', color: 0x3a2a20, swing: -1 });
    // ---- upper floor walls
    const uy0 = ut, uy1 = yTop;
    this.wall(X0, Z0, X1, Z0, uy0, uy1, { openings: [{ c: 7, w: 4, b: 0.9, t: 2.6, glass: true }, { c: 22, w: 3, b: 1.0, t: 2.4, glass: true }] });
    this.wall(X0, Z0, X0, Z1, uy0, uy1, { openings: [{ c: 10, w: 3, b: 0.9, t: 2.6, glass: true }] });
    this.wall(X1, Z0, X1, Z1, uy0, uy1, { openings: [{ c: 5, w: 2.5, b: 0.9, t: 2.5, glass: true }] });
    this.wall(X0, Z1, X1, Z1, uy0, uy1, { openings: [{ c: 7, w: 12, b: 0.0, t: 3.0, glass: true }, { c: 16, w: 3.6, b: 0, t: 3.0, glass: true }, { c: 24, w: 8, b: 1.1, t: 2.8, glass: true }] });
    // interior walls: x=-1 (bedroom|hall, door z=-600), x=3 (hall|office/bath, doors z=-600 & z=-586), z=-594 (office|bath)
    this.wall(-1, Z0, -1, Z1, uy0, uy1, { color: 0xeae4da, openings: [{ c: 4, w: 1.0, t: 2.2 }] });
    this.wall(3, Z0, 3, Z1, uy0, uy1, { color: 0xeae4da, openings: [{ c: 4, w: 1.0, t: 2.2 }, { c: 18, w: 1.0, t: 2.2 }] });
    this.wall(3, -594, X1, -594, uy0, uy1, { color: 0xdfe6ea });
    this.door(-1, uy0, -600.5, 1.0, false, { label: 'bedroom door', color: 0xe8e0d4, swing: -1 });
    this.door(3, uy0, -600.5, 1.0, false, { label: 'office door', color: 0xe8e0d4, swing: 1 });
    this.door(3, uy0, -586.5, 1.0, false, { label: 'bathroom door', color: 0xe8e0d4, swing: 1 });
    // Staircase climbing north from z=-589 to -596, x 1..3 (20 steps)
    k.at(0, gy0, 0);
    const steps = 20, rise = (ut - gy0) / steps, run = 7 / steps;
    for (let i = 0; i < steps; i++) {
      const top = (i + 1) * rise, cz = -589 - (i + 0.5) * run;
      k.box(2, top - 0.06, cz, 2, 0.06, run + 0.02, Mats.wood(), 0x3a2a20, { collide: false });
      k.box(2, 0, cz, 1.96, top - 0.06, run, Mats.paint(), 0xf4f1ec, { collide: true });
    }
    // stair glass rail (ground side, west edge) and upper hole rails
    for (let i = 0; i < steps; i += 4) {
      const cz = -589 - (i + 2) * run;
      Furniture.railing(k.at(0, 0, 0), 1, -589 - i * run, 1, -589 - (i + 4) * run, gy0 + (i + 2) * rise, 1.0);
    }
    Furniture.railing(k.at(0, 0, 0), 1, -589, 1, -596, ut, 1.0);
    Furniture.railing(k.at(0, 0, 0), 1, -589, 3, -589, ut, 1.0);
    // ---- living room furnishings
    k.at(-13.9, gy0, -594, Math.PI / 2); Furniture.tv(k, W, 0, 1.25, 0);
    k.at(-8.5, gy0, -594, -Math.PI / 2); Furniture.sofa(k, 0x50555e, 3.0);
    k.at(-11, gy0, -594); Furniture.rug(k, 0, 0, 5, 4); Furniture.coffeeTable(k);
    k.at(-11, gy0, -597.5, 0); Furniture.armchair(k, 0x9a6a46);
    k.at(-11, gy0, -590.5, Math.PI); Furniture.armchair(k, 0x9a6a46);
    k.at(-5, gy0, -603.6, 0); Furniture.fireplace(k, W, 2.4);
    k.at(0, gy0, 0); Furniture.floorLamp(k, -8.2, -598, W); Furniture.plant(k, -14, -603, 1.4); Furniture.plant(k, -14, -585, 1.2); Furniture.plant(k, 0, -603, 1.3);
    k.at(-5, gy0, -603.85, 0); Furniture.painting(k, 0, 2.6, 0, 2.2, 1.1, 7);
    k.at(0, gy0, 0); Furniture.bookshelf(k.at(-14.8, gy0, -600, Math.PI / 2), 1.8, 2.4);
    // ---- kitchen & dining
    k.at(9, gy0, -603.6, 0); Furniture.kitchen(k, 7.5);
    k.at(9, gy0, -598.5, 0); Furniture.island(k, 3.4);
    k.at(9, gy0, -589.5, 0); Furniture.table(k, 2.6, 1.1, Mats.wood(), 0xffffff, true);
    k.at(0, gy0, 0); Furniture.fridge(k, 14.3, -602.5, W);
    k.at(0, gy0, 0); Furniture.plant(k, 14.2, -585, 1.2);
    for (const [x, z] of [[-10, -594], [-4, -588], [9, -598], [9, -590], [-4, -600], [12, -586]]) Furniture.ceilingLamp(k.at(0, 0, 0), x, gy1, z, W, 0xfff0dc, 6, 11);
    // ---- master bedroom (x -15..-1)
    k.at(-8, uy0, -602.7, 0); Furniture.bed(k);
    Furniture.nightstand(k.at(-8, uy0, -602.7, 0), -1.35, 0.3); Furniture.nightstand(k.at(-8, uy0, -602.7, 0), 1.35, 0.3);
    k.at(-8, uy0, -598); Furniture.rug(k, 0, 0, 4, 3);
    k.at(-14.5, uy0, -595, Math.PI / 2); Furniture.wardrobe(k, 2.4, 0xe8e2d8);
    k.at(-8, uy0, -603.85, 0); Furniture.painting(k, 0, 2.6, 0, 1.8, 0.9, 3);
    k.at(-3, uy0, -587.2, Math.PI); Furniture.armchair(k, 0xd8d0c4);
    Furniture.plant(k.at(0, uy0, 0), -14, -585.5, 1.2);
    W.addInteractable({ pos: new THREE.Vector3(-8, uy0 + 0.6, -601), radius: 2.2, label: 'Rest & save game', action: () => W.game.sleepAndSave('Vega Villa') });
    // ---- office (x 3..15, z -604..-594)
    k.at(9, uy0, -601, 0); Furniture.desk(k, 2.2);
    k.at(14.6, uy0, -599, -Math.PI / 2); Furniture.bookshelf(k, 2.6, 2.4);
    k.at(5, uy0, -603.6, 0); Furniture.bookshelf(k, 1.8, 2.4);
    Furniture.plant(k.at(0, uy0, 0), 14, -595, 1.3);
    k.at(9, uy0, -603.85, 0); Furniture.painting(k, 0, 2.3, 0, 1.6, 1.0, 11);
    W.villaDesk = new THREE.Vector3(9, uy0 + 0.9, -600.5);
    // ---- bathroom (x 3..15, z -594..-584)
    this.slab(3.1, -594, 14.9, -584.1, ut + 0.02, 0.02, Mats.tiles(), 0xffffff, { collide: false });
    k.at(11.5, uy0, -592.8, 0); Furniture.tub(k);
    Furniture.sink(k.at(6, uy0, -593.6, 0), 0, 0); Furniture.toilet(k.at(0, uy0, 0), 8.6, -593.4);
    k.at(14.85, uy0, -588, -Math.PI / 2); k.box(0, 0.9, 0, 3, 1.6, 0.02, Mats.chrome(), 0xffffff, { collide: false });
    // ---- hall
    k.at(-0.85, uy0, -592, Math.PI / 2); Furniture.painting(k, 0, 1.7, 0, 1.2, 0.8, 5);
    for (const [x, z] of [[-8, -598], [-8, -588], [9, -599], [9, -589], [1, -600], [0, -586]]) Furniture.ceilingLamp(k.at(0, 0, 0), x, uy1, z, W, 0xfff0dc, 5, 9);
    this.indoor(X0, y0, Z0, X1, yTop + 0.4, Z1, 'Vega Villa');
    // Exterior details: stone base band, wood cladding feature wall, planters, driveway
    k.at(0, y0, 0);
    k.box(-15.1, 0, -594, 0.12, 7.8, 20.2, Mats.wood(), 0x6a4a32, { collide: false });
    k.box(0, 0, Z0 - 0.08, 30.2, 0.6, 0.1, Mats.concrete(), 0x6a6660, { collide: false });
    for (const x of [-20, 20]) { this.world.city.tree(x, -588, 1.2, 'palm', y0); }
    this.world.city.tree(22, -600, 1.1, 'round', y0); this.world.city.tree(-24, -600, 1.2, 'pine', y0);
    const dw = planeXZ(14, 30, 4); dw.translate(14, y0 + 0.03, -558); this.b.add(dw, Mats.paving(), { color: 0xd8d0c4, cast: false });
    // overlook: railing + bench + telescope
    k.at(30, y0, -543);
    Furniture.railing(k, -8, 4, 8, 4, 0, 1.05);
    this.world.city.bench(30, -545, 0, y0);
    this.world.mapRects.push({ x0: X0, z0: Z0, x1: X1, z1: Z1, type: 'building', h: 8 });
    this.world.mapRects.push({ x0: -15, z0: -577.75, x1: -1, z1: -572.25, type: 'water' });
  }

  // ---------------------------------------------------------- safehouse
  safehouse() {
    const k = this.kit, W = this.world, y = 0.15;
    const X0 = 125, X1 = 143, Z0 = 107, Z1 = 119, H = 3.4, yT = y + H;
    this.world.city.groundPlane(123.5, 100.5, 146.5, 135, Mats.grass(), 0xffffff);
    this.slab(X0, Z0, X1, Z1, y + 0.12, 0.12, Mats.woodFloor(), 0xc8a07a, { tile: 3 });
    this.col.boxes[this.col.boxes.length - 1].low = true;
    this.slab(X0 - 0.8, Z0 - 1.6, X1 + 0.8, Z1 + 0.8, yT + 0.45, 0.3, Mats.paint(), 0x2a2a2c, { under: Mats.wood() });
    const fy = y + 0.12;
    this.wall(X0, Z0, X1, Z0, fy, yT + 0.15, { color: 0xf0ebe2, openings: [{ c: 4, w: 4, b: 0.6, t: 2.6, glass: true }, { c: 7, w: 1.2, b: 0, t: 2.3 }, { c: 15, w: 3, b: 0.9, t: 2.4, glass: true }] });
    this.wall(X0, Z1, X1, Z1, fy, yT + 0.15, { color: 0xf0ebe2, openings: [{ c: 5, w: 5, b: 0, t: 2.6, glass: true }, { c: 15, w: 2, b: 1.2, t: 2.2, glass: true }] });
    this.wall(X0, Z0, X0, Z1, fy, yT + 0.15, { color: 0xf0ebe2, openings: [{ c: 6, w: 3, b: 0.9, t: 2.4, glass: true }] });
    this.wall(X1, Z0, X1, Z1, fy, yT + 0.15, { color: 0xf0ebe2 });
    this.door(X0 + 6.4, fy, Z0, 1.2, true, { label: 'front door', color: 0x2a3a4a, swing: 1 });
    // interior walls: x=137 (living|bed/bath) with doors; z=113 between bed & bath
    this.wall(137, Z0, 137, Z1, fy, yT + 0.15, { color: 0xe6e0d6, openings: [{ c: 3, w: 1.0, t: 2.2 }, { c: 9, w: 1.0, t: 2.2 }] });
    this.wall(137, 113, X1, 113, fy, yT + 0.15, { color: 0xdfe6ea });
    // living + kitchen
    k.at(131, fy, 117.2, Math.PI); Furniture.sofa(k, 0x2e3a4a, 2.6);
    k.at(131, fy, 113.5); Furniture.rug(k, 0, 0, 3.6, 2.6); Furniture.coffeeTable(k);
    k.at(131, fy, 107.4, 0); Furniture.tv(k, W, 0, 1.2, 0);
    k.at(126.5, fy, 113, Math.PI / 2); Furniture.kitchen(k, 4.5, 0xe0e4e8);
    k.at(0, fy, 0); Furniture.fridge(k, 126, 117.6, W);
    k.at(0, fy, 0); Furniture.plant(k, 136.3, 118.2, 1.1); Furniture.floorLamp(k, 134.5, 117.8, W);
    k.at(130.5, fy, 118.85, Math.PI); Furniture.painting(k, 0, 1.8, 0, 1.4, 0.9, 21);
    for (const [x, z] of [[131, 113], [127, 115]]) Furniture.ceilingLamp(k.at(0, 0, 0), x, yT, z, W);
    // bedroom (x 137..143, z 107..113)
    k.at(140, fy, 108.2, 0); Furniture.bed(k, 0xe8e4dc, 0x7a3a3a);
    Furniture.nightstand(k.at(140, fy, 108.2, 0), 1.3, 0.2);
    k.at(142.6, fy, 111.5, -Math.PI / 2); Furniture.wardrobe(k, 1.6);
    W.addInteractable({ pos: new THREE.Vector3(140, fy + 0.6, 109.5), radius: 2, label: 'Sleep & save game', action: () => W.game.sleepAndSave('Safehouse') });
    W.addInteractable({ pos: new THREE.Vector3(142.2, fy + 1, 111.5), radius: 1.6, label: 'Change outfit', action: () => W.game.openWardrobe(false) });
    Furniture.ceilingLamp(k.at(0, 0, 0), 140, yT, 110, W);
    // bathroom
    k.at(140, fy, 118.2, Math.PI); Furniture.tub(k);
    Furniture.sink(k.at(138, fy, 113.4, Math.PI), 0, 0);
    Furniture.toilet(k.at(0, fy, 0), 142.4, 114);
    Furniture.ceilingLamp(k.at(0, 0, 0), 140, yT, 116, W);
    this.indoor(X0, 0, Z0, X1, yT + 0.4, Z1, 'Safehouse');
    // path + driveway + mailbox + palms
    this.world.city.groundPlane(131.3, 100.5, 132.9, 107, Mats.paving(), 0xd8d0c0, 0.17);
    this.world.city.groundPlane(139, 100.5, 145, 106.5, Mats.paving(), 0xb8b0a4, 0.17);
    this.world.city.tree(127, 102.5, 1.1, 'palm'); this.world.city.tree(145.5, 125, 1.0, 'round'); this.world.city.tree(126, 128, 1.1, 'palm');
    this.world.mapRects.push({ x0: X0, z0: Z0, x1: X1, z1: Z1, type: 'building', h: 4 });
  }

  // ---------------------------------------------------------- QuikMart
  quikmart() {
    const k = this.kit, W = this.world, y = 0.15;
    const X0 = -152, X1 = -128, Z0 = 10.5, Z1 = 30, H = 4.4;
    this.slab(X0, Z0, X1, Z1, y + 0.05, 0.05, Mats.tiles(), 0xffffff, { tile: 2, collide: false });
    this.wall(X0, Z0, X1, Z0, y, H, { color: 0x2a2d31, openings: [{ c: 5, w: 8, b: 0.4, t: 3.4, glass: true }, { c: 12, w: 2.4, b: 0, t: 2.5 }, { c: 19, w: 8, b: 0.4, t: 3.4, glass: true }] });
    this.wall(X0, Z1, X1, Z1, y, H, { color: 0xf4f4f0 });
    this.wall(X0, Z0, X0, Z1, y, H, { color: 0xf4f4f0 });
    this.wall(X1, Z0, X1, Z1, y, H, { color: 0xf4f4f0 });
    this.autoDoor(-140, y, Z0, 2.4, true);
    this.upper(X0, Z0, X1, Z1, H, 12.4, 'apartment', 2, 0xe8e0d8);
    // sign + canopy
    const s = new THREE.PlaneGeometry(12, 1.6); s.rotateY(Math.PI); s.translate(-140, H + 0.9, Z0 - 0.05);
    this.b.add(s, signMat('QuikMart 24/7', { bg: '#d8262c', fg: '#ffffff', w: 1024, h: 136, font: 'bold 92px "Barlow Condensed", Arial, sans-serif', neon: true }), { cast: false });
    k.at(-140, H - 0.5, Z0 - 1.2); k.box(0, 0, 0, 24, 0.2, 2.4, Mats.paint(), 0xd8262c, { collide: false });
    // interior
    for (let i = 0; i < 3; i++) { k.at(-146 + i * 6, y, 21, Math.PI / 2); Furniture.shelfUnit(k, 9, 1.7); }
    k.at(-140, y, 29.3, Math.PI); Furniture.fridgeDisplay(k, 14);
    k.at(-149.5, y, 14.5, Math.PI / 2); Furniture.counter(k, 3.6);
    for (const [x, z] of [[-146, 15], [-140, 22], [-134, 15], [-146, 26], [-134, 26]]) Furniture.ceilingLamp(k.at(0, 0, 0), x, H, z, W, 0xeef6ff, 7, 12);
    W.shopCounters.push({ pos: new THREE.Vector3(-148.4, y, 14.5), clerkPos: new THREE.Vector3(-150.6, y + 0.0, 14.5), clerkRot: Math.PI / 2, shop: 'quikmart' });
    W.addInteractable({ pos: new THREE.Vector3(-148.2, y + 1, 14.5), radius: 2, label: 'Shop at QuikMart', action: () => W.game.openShop('quikmart') });
    this.indoor(X0, 0, Z0, X1, H, Z1, 'QuikMart');
  }
  // ---------------------------------------------------------- Thread & Co.
  clothing() {
    const k = this.kit, W = this.world, y = 0.15;
    const X0 = -132, X1 = -108, Z0 = -30, Z1 = -10.5, H = 4.6;
    this.slab(X0, Z0, X1, Z1, y + 0.05, 0.05, Mats.woodFloor(), 0xe0c8a8, { tile: 3, collide: false });
    this.wall(X0, Z1, X1, Z1, y, H, { color: 0x1a1a1a, openings: [{ c: 5, w: 8, b: 0.3, t: 3.6, glass: true }, { c: 12, w: 2.4, b: 0, t: 2.5 }, { c: 19, w: 8, b: 0.3, t: 3.6, glass: true }] });
    this.wall(X0, Z0, X1, Z0, y, H, { color: 0xf0ebe4 });
    this.wall(X0, Z0, X0, Z1, y, H, { color: 0xd8cfc4 });
    this.wall(X1, Z0, X1, Z1, y, H, { color: 0xd8cfc4 });
    this.autoDoor(-120, y, Z1, 2.4, true);
    this.upper(X0, Z0, X1, Z1, H, 13, 'brick', 1, 0xffffff);
    const s = new THREE.PlaneGeometry(10, 1.4); s.translate(-120, H + 0.8, Z1 + 0.05);
    this.b.add(s, signMat('THREAD & CO.', { bg: '#111111', fg: '#e8d6b0', w: 1024, h: 140, font: '600 88px "Barlow Condensed", Georgia, serif', neon: true }), { cast: false });
    for (let i = 0; i < 4; i++) { k.at(-127 + i * 5, y, -22, 0); Furniture.clothesRack(k, 3); }
    for (let i = 0; i < 2; i++) { k.at(-127 + i * 14, y, -16.5, 0); k.box(0, 0, 0, 1.4, 0.9, 1.4, Mats.wood(), 0x3a2a20); }
    // mirrors + mannequins
    k.at(-131.85, y, -20, Math.PI / 2); k.box(0, 0.2, 0, 2, 2.2, 0.02, Mats.chrome(), 0xffffff, { collide: false });
    k.at(-112, y, -28.4, 0); Furniture.counter(k, 3);
    for (const [x, z] of [[-126, -22], [-120, -16], [-114, -22], [-120, -27]]) Furniture.ceilingLamp(k.at(0, 0, 0), x, H, z, W, 0xfff0e0, 6, 10);
    W.shopCounters.push({ pos: new THREE.Vector3(-112, y, -28.4), clerkPos: new THREE.Vector3(-112, y, -29.5), clerkRot: 0, shop: 'clothing' });
    W.addInteractable({ pos: new THREE.Vector3(-112, y + 1, -27.4), radius: 2.2, label: 'Browse clothes (customize)', action: () => W.game.openWardrobe(true) });
    W.addInteractable({ pos: new THREE.Vector3(-131, y + 1, -20), radius: 1.6, label: 'Look in mirror', action: () => W.game.openWardrobe(true) });
    this.indoor(X0, 0, Z0, X1, H, Z1, 'Thread & Co.');
  }
  // ---------------------------------------------------------- Noodle house
  noodle() {
    const k = this.kit, W = this.world, y = 0.15;
    const X0 = -158, X1 = -142, Z0 = -169.5, Z1 = -152, H = 4.2;
    this.slab(X0, Z0, X1, Z1, y + 0.05, 0.05, Mats.wood(), 0x8a6a50, { tile: 2, collide: false });
    this.wall(X0, Z0, X1, Z0, y, H, { color: 0x3a1a14, openings: [{ c: 3.5, w: 5, b: 0.9, t: 2.8, glass: true }, { c: 8, w: 2.2, b: 0, t: 2.6 }, { c: 12.5, w: 5, b: 0.9, t: 2.8, glass: true }] });
    this.wall(X0, Z1, X1, Z1, y, H, { color: 0xb89a7a });
    this.wall(X0, Z0, X0, Z1, y, H, { color: 0xc8a888 });
    this.wall(X1, Z0, X1, Z1, y, H, { color: 0xc8a888 });
    this.upper(X0, Z0, X1, Z1, H, 15.5, 'shophouse', 2, 0xf0d8c8);
    // noren curtains at the door
    for (let i = 0; i < 3; i++) { const g = new THREE.PlaneGeometry(0.66, 0.8); g.rotateY(Math.PI); g.translate(-151.3 + i * 0.7, 2.2, Z0 - 0.06); this.b.add(g, Mats.fabric(), { color: 0x1a2a5a, cast: false }); }
    const s = new THREE.PlaneGeometry(9, 1.4); s.rotateY(Math.PI); s.translate(-150, H + 0.8, Z0 - 0.06);
    this.b.add(s, signMat("麺 MARA'S NOODLE HOUSE", { bg: '#1a0a08', fg: '#ff5a3a', glow: '#ff3a1a', w: 1024, h: 150, font: 'bold 80px "Noto Sans JP", "Barlow Condensed", sans-serif', neon: true }), { cast: false });
    const v = new THREE.PlaneGeometry(1, 4); v.rotateY(Math.PI / 2); v.translate(X1 + 0.6, 7.5, Z0 - 0.9);
    this.b.add(v, signMat('拉麺', { bg: '#0b0b10', fg: '#ffd23f', glow: '#ffd23f', w: 128, h: 512, font: 'bold 110px "Noto Sans JP", sans-serif', vertical: true, neon: true }), { cast: false });
    // counter with stools, tables
    k.at(-150, y, -159, 0); Furniture.counter(k, 9);
    for (let i = 0; i < 6; i++) Furniture.stool(k.at(0, y, 0), -153.8 + i * 1.5, -160.3);
    k.at(-150, y, -152.6, Math.PI); Furniture.kitchen(k, 12, 0xb8b0a8, 0x444444);
    for (const x of [-155.5, -145.5]) { k.at(x, y, -165.5, 0); Furniture.table(k, 1.4, 0.8, Mats.wood(), 0x8a5a3a, true); }
    // paper lanterns inside
    for (const [x, z] of [[-155, -165.5], [-150, -163], [-145, -165.5], [-150, -157.5]]) {
      k.at(x, 0, z); k.sphere(0, H - 0.8, 0, 0.32, W.lanternMat, 0xffffff, { sy: 1.3, seg: 10, cast: false });
      W.addLightAnchor(new THREE.Vector3(x, H - 1, z), 0xffa060, 5, 8, true, true);
    }
    W.shopCounters.push({ pos: new THREE.Vector3(-150, y, -160), clerkPos: new THREE.Vector3(-150, y, -157.8), clerkRot: Math.PI, shop: 'noodle' });
    W.addInteractable({ pos: new THREE.Vector3(-150, y + 1, -160.5), radius: 2.4, label: 'Order food', action: () => W.game.openShop('noodle') });
    this.indoor(X0, 0, Z0, X1, H, Z1, "Mara's Noodle House");
  }
  // ---------------------------------------------------------- Meridian tower lobby
  tower() {
    const k = this.kit, W = this.world, y = 0.15;
    const X0 = -68, X1 = -22, Z0 = -138, Z1 = -100.5, H = 7;
    this.slab(X0, Z0, X1, Z1, y + 0.05, 0.05, Mats.marble(), 0xffffff, { tile: 4, collide: false });
    this.world.city.groundPlane(-70, -140, -20, -100.5, Mats.paving(), 0xd8d0c4);
    this.wall(X0, Z1, X1, Z1, y, H, { color: 0x2a2e34, t: 0.3, openings: [{ c: 11, w: 18, b: 0, t: 6.4, glass: true }, { c: 23, w: 3, b: 0, t: 2.8 }, { c: 35, w: 18, b: 0, t: 6.4, glass: true }] });
    this.wall(X0, Z0, X1, Z0, y, H, { color: 0xd8d4cc });
    this.wall(X0, Z0, X0, Z1, y, H, { color: 0xd8d4cc, openings: [{ c: 18, w: 20, b: 0.5, t: 6, glass: true }] });
    this.wall(X1, Z0, X1, Z1, y, H, { color: 0xd8d4cc, openings: [{ c: 18, w: 20, b: 0.5, t: 6, glass: true }] });
    this.autoDoor(-45, y, Z1, 3, true, 2.8);
    // Tower above
    const tiers = [[X0, Z0, X1, Z1, H, 60], [X0 + 3, Z0 + 3, X1 - 3, Z1 - 3, 60, 120], [X0 + 7, Z0 + 7, X1 - 7, Z1 - 7, 120, 168]];
    for (const [a, b2, c, d, y0, y1] of tiers) this.upper(a, b2, c, d, y0, y1, 'glass', 1, 0xd8e8ff);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), W.beaconMat); beacon.position.set(-45, 170, -119); W.scene.add(beacon);
    const sg = new THREE.PlaneGeometry(14, 1.6); sg.translate(-45, H + 1.2, Z1 + 0.1);
    this.b.add(sg, signMat('MERIDIAN TOWER', { bg: '#0c1218', fg: '#cfe6ff', w: 1024, h: 120, font: '600 84px "Barlow Condensed", Arial, sans-serif', neon: true }), { cast: false });
    // reception, elevators, seating
    k.at(-45, y, -126, 0); Furniture.counter(k, 6);
    k.at(-45, y, -137.5, 0); for (let i = 0; i < 4; i++) { k.box(-7.5 + i * 5, 0, 0.3, 2.2, 3, 0.1, Mats.chrome(), 0xc8c0a8, { collide: false }); k.box(-7.5 + i * 5, 3.1, 0.32, 0.6, 0.2, 0.05, Mats.glow(), 0xffaa55, { collide: false }); }
    for (const x of [-60, -30]) { k.at(x, y, -112, 0); Furniture.sofa(k, 0x2a2a2e, 2.6); k.at(x, y, -108.5, Math.PI); Furniture.sofa(k, 0x2a2a2e, 2.6); }
    for (const [x, z] of [[-66, -136], [-24, -136], [-66, -103], [-24, -103]]) Furniture.plant(k.at(0, y, 0), x, z, 1.8);
    k.at(-45, y, -137.9, 0); Furniture.painting(k, 0, 5, 0, 8, 2, 33);
    for (const [x, z] of [[-55, -118], [-35, -118], [-45, -110], [-45, -130], [-60, -130], [-30, -130]]) Furniture.ceilingLamp(k.at(0, 0, 0), x, H, z, W, 0xfff4e8, 8, 14);
    W.towerDesk = new THREE.Vector3(-45, y, -124.5);
    this.indoor(X0, 0, Z0, X1, H, Z1, 'Meridian Tower');
  }
  // ---------------------------------------------------------- Fix & Go garage
  garage() {
    const k = this.kit, W = this.world, y = 0.15;
    const X0 = 56, X1 = 79.5, Z0 = 12, Z1 = 48, H = 6;
    this.slab(X0, Z0, X1, Z1, y + 0.04, 0.04, Mats.concrete(), 0x8a8a88, { tile: 3, collide: false });
    this.wall(X0, Z0, X0, Z1, y, H, { color: 0xd8d0b8, openings: [{ c: 12, w: 9, b: 0, t: 4.6 }, { c: 27, w: 5, b: 1, t: 3, glass: true }] });
    this.wall(X1, Z0, X1, Z1, y, H, { color: 0xc8c0a8 });
    this.wall(X0, Z0, X1, Z0, y, H, { color: 0xc8c0a8 });
    this.wall(X0, Z1, X1, Z1, y, H, { color: 0xc8c0a8 });
    this.slab(X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z1 + 0.2, H + 0.3, 0.3, Mats.metal(), 0x6a6a6a, { under: Mats.metal() });
    this.world.mapRects.push({ x0: X0, z0: Z0, x1: X1, z1: Z1, type: 'building', h: 6 });
    // rolled-up door + sign
    k.at(X0 - 0.1, y + 4.6, 24, -Math.PI / 2); k.box(0, 0, 0, 9.4, 0.7, 0.5, Mats.metal(), 0x9a9a9a, { collide: false });
    const sg = new THREE.PlaneGeometry(9, 1.3); sg.rotateY(-Math.PI / 2); sg.translate(X0 - 0.15, H - 0.5, 24);
    this.b.add(sg, signMat('FIX & GO', { bg: '#f2c12e', fg: '#111111', w: 1024, h: 150, font: 'bold 110px "Barlow Condensed", Arial, sans-serif', neon: false }), { cast: false });
    // workshop
    k.at(78.8, y, 20, -Math.PI / 2); Furniture.counter(k, 5);
    k.at(78.6, y, 34, -Math.PI / 2); Furniture.shelfUnit(k, 8, 2.2);
    for (let i = 0; i < 4; i++) k.at(60 + i * 1.2, y, 46.5).cyl(0, 0, 0, 0.36, 0.36, 1.6, Mats.plastic(), 0x111111, { collide: true });
    k.at(68, y, 24); k.box(-1.6, 0, 0, 0.3, 0.2, 5, Mats.metal(), 0xc8a020, { collide: false }); k.box(1.6, 0, 0, 0.3, 0.2, 5, Mats.metal(), 0xc8a020, { collide: false });
    for (const [x, z] of [[64, 20], [72, 20], [64, 30], [72, 30], [68, 40]]) Furniture.ceilingLamp(k.at(0, 0, 0), x, H, z, W, 0xeef4ff, 7, 12);
    W.garageZone = { x0: 58, z0: 15, x1: 78, z1: 34 };
    W.addInteractable({
      pos: new THREE.Vector3(68, y + 1, 24), radius: 6, vehicleOnly: true,
      label: () => 'Repair & respray vehicle ($150)', action: () => W.game.repairVehicle(),
    });
    this.indoor(X0, 0, Z0, X1, H, Z1, 'Fix & Go');
  }
  police() {
    const c = this.world.city;
    c.building({ x0: 205, z0: -120, x1: 245, z1: -100.5, h: 12, kind: 'office', seed: 1, tint: 0xd8dce4, front: 'S', store: true, sign: 'POLICE · DISTRICT 4', roofProps: true });
    const k = this.kit.at(225, 0, -100.4);
    k.box(0, 6.5, 0, 40, 0.6, 0.15, Mats.glow(), 0x2a6aff, { collide: false });
  }
  clinic() {
    const c = this.world.city;
    c.building({ x0: -245, z0: -28, x1: -205, z1: -10.5, h: 14, kind: 'stucco', seed: 2, tint: 0xffffff, front: 'S', store: true, sign: 'ST. CLARA CLINIC', roofProps: true });
    const k = this.kit.at(-225, 0, -10.35);
    k.box(-15, 9, 0, 2.4, 0.7, 0.1, Mats.glow(), 0x2adf6a, { collide: false });
    k.box(-15, 8.15, 0, 0.7, 2.4, 0.1, Mats.glow(), 0x2adf6a, { collide: false });
  }
}
