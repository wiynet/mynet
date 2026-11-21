// Placement kit: builds props/furniture in a local frame (rotations in 90° steps)
// and emits batched geometry + matching AABB colliders.
import * as THREE from 'three';
import { worldBox, transformGeo, colorize } from './builder.js';
import { Mats } from './materials.js';

export class Kit {
  constructor(world) {
    this.world = world; this.b = world.batcher; this.col = world.collision;
    this.ox = 0; this.oy = 0; this.oz = 0; this.rot = 0; this.c = 1; this.s = 0;
  }
  at(x, y, z, rot = 0) {
    this.ox = x; this.oy = y; this.oz = z; this.rot = rot;
    this.c = Math.round(Math.cos(rot)); this.s = Math.round(Math.sin(rot));
    return this;
  }
  /** Local -> world (rotation around Y like three.js: x' = x*c + z*s, z' = -x*s + z*c). */
  tx(lx, lz) { return [this.ox + lx * this.c + lz * this.s, this.oz - lx * this.s + lz * this.c]; }
  /** Add a local geometry (already positioned in local frame). */
  geo(g, material, color = 0xffffff, { cast = true, receive = true } = {}) {
    transformGeo(g, this.ox, this.oy, this.oz, this.rot);
    colorize(g, color);
    this.b.add(g, material, { cast, receive });
    return g;
  }
  collider(lx0, ly0, lz0, lx1, ly1, lz1, opts) {
    const [ax, az] = this.tx(lx0, lz0), [bx, bz] = this.tx(lx1, lz1);
    return this.col.add(Math.min(ax, bx), this.oy + ly0, Math.min(az, bz), Math.max(ax, bx), this.oy + ly1, Math.max(az, bz), opts);
  }
  /** Box by local center (x,z), bottom y, sizes. */
  box(x, y, z, sx, sy, sz, material = Mats.paint(), color = 0xffffff, { collide = true, tile = 1, cast = true, colOpts } = {}) {
    const g = worldBox(sx, sy, sz, tile); g.translate(x, y + sy / 2, z);
    this.geo(g, material, color, { cast });
    if (collide) this.collider(x - sx / 2, y, z - sz / 2, x + sx / 2, y + sy, z + sz / 2, colOpts);
    return g;
  }
  cyl(x, y, z, rt, rb, h, material = Mats.metal(), color = 0xffffff, { seg = 12, collide = false, cast = true } = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y + h / 2, z);
    this.geo(g, material, color, { cast });
    if (collide) { const r = Math.max(rt, rb); this.collider(x - r, y, z - r, x + r, y + h, z + r); }
    return g;
  }
  sphere(x, y, z, r, material, color, { sx = 1, sy = 1, sz = 1, seg = 10, cast = true } = {}) {
    const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.6)); g.scale(sx, sy, sz); g.translate(x, y, z);
    this.geo(g, material, color, { cast });
    return g;
  }
  /** World-space point for an anchor in the local frame. */
  point(lx, ly, lz) { const [x, z] = this.tx(lx, lz); return new THREE.Vector3(x, this.oy + ly, z); }
}

// ---------------------------------------------------------------- furniture
// Each function takes a kit already positioned with .at(); local +z = front.
export const Furniture = {
  sofa(k, color = 0x6b6f78, w = 2.4) {
    const f = Mats.fabric();
    k.box(0, 0, 0, w, 0.42, 0.95, f, color);
    k.box(0, 0.42, -0.35, w, 0.48, 0.25, f, color, { collide: false });
    k.box(-w / 2 + 0.12, 0.42, 0.02, 0.24, 0.22, 0.9, f, color, { collide: false });
    k.box(w / 2 - 0.12, 0.42, 0.02, 0.24, 0.22, 0.9, f, color, { collide: false });
    for (let i = 0; i < 3; i++) k.box(-w / 3 + (i * w) / 3, 0.42, 0.08, w / 3 - 0.08, 0.12, 0.7, f, 0xd8d2c8, { collide: false });
    k.box(-w / 3, 0.5, -0.18, 0.45, 0.4, 0.14, f, 0xc69a5a, { collide: false });
  },
  armchair(k, color = 0x8a5a3a) {
    const f = Mats.fabric();
    k.box(0, 0, 0, 0.9, 0.42, 0.85, f, color);
    k.box(0, 0.42, -0.32, 0.9, 0.45, 0.2, f, color, { collide: false });
    k.box(-0.38, 0.42, 0, 0.14, 0.2, 0.8, f, color, { collide: false });
    k.box(0.38, 0.42, 0, 0.14, 0.2, 0.8, f, color, { collide: false });
  },
  coffeeTable(k) {
    k.box(0, 0.36, 0, 1.2, 0.05, 0.65, Mats.wood(), 0xffffff);
    k.box(0, 0, 0, 1.0, 0.36, 0.5, Mats.metal(), 0x222222, { collide: false });
    k.box(0.25, 0.41, 0.05, 0.25, 0.04, 0.18, Mats.paint(), 0xb83a3a, { collide: false });
    k.cyl(-0.3, 0.41, 0, 0.06, 0.05, 0.16, Mats.plastic(), 0xeeeeee, { collide: false });
  },
  table(k, w = 1.8, d = 0.9, top = Mats.wood(), color = 0xffffff, chairs = true) {
    k.box(0, 0.72, 0, w, 0.05, d, top, color);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08), 0.06, 0.72, 0.06, Mats.metal(), 0x2a2a2a, { collide: false });
    if (chairs) {
      const n = Math.max(1, Math.floor(w / 0.7));
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (w / n) * (i + 0.5);
        for (const side of [-1, 1]) Furniture.chair(k, x, side * (d / 2 + 0.3), side > 0 ? 0 : Math.PI);
      }
    }
  },
  chair(k, x, z, facing = 0, color = 0x3a3a3a) {
    // facing 0 => seat back on +z side (chair faces -z toward table)
    const s = Math.cos(facing) > 0 ? 1 : -1;
    k.box(x, 0.44, z, 0.44, 0.05, 0.44, Mats.wood(), 0xffffff, { collide: false });
    k.box(x, 0.49, z + s * 0.2, 0.44, 0.45, 0.04, Mats.wood(), 0xffffff, { collide: false });
    k.box(x, 0, z, 0.36, 0.44, 0.36, Mats.metal(), color, { collide: false });
  },
  bed(k, color = 0xe8e4dc, accent = 0x3c4a5c) {
    k.box(0, 0, 0, 1.8, 0.35, 2.1, Mats.wood(), 0x8a6a50);
    k.box(0, 0.35, 0.05, 1.7, 0.22, 1.95, Mats.fabric(), color, { collide: false });
    k.box(0, 0.57, 0.35, 1.72, 0.06, 1.3, Mats.fabric(), accent, { collide: false });
    k.box(-0.42, 0.57, -0.75, 0.6, 0.14, 0.38, Mats.fabric(), 0xffffff, { collide: false });
    k.box(0.42, 0.57, -0.75, 0.6, 0.14, 0.38, Mats.fabric(), 0xffffff, { collide: false });
    k.box(0, 0, -1.07, 1.9, 1.1, 0.08, Mats.wood(), 0x6a4a36);
  },
  nightstand(k, x, z) {
    k.box(x, 0, z, 0.5, 0.5, 0.45, Mats.wood(), 0xa08060);
    k.cyl(x, 0.5, z, 0.08, 0.1, 0.25, Mats.plastic(), 0xeeeeee, { collide: false });
    k.cyl(x, 0.75, z, 0.16, 0.2, 0.2, Mats.lamp(), 0xfff0d0, { collide: false });
  },
  wardrobe(k, w = 1.6, color = 0xf0ece4) {
    k.box(0, 0, 0, w, 2.2, 0.6, Mats.paint(), color);
    k.box(0, 0.05, 0.305, 0.02, 2.1, 0.01, Mats.paint(), 0x888888, { collide: false });
    k.box(-0.1, 1.0, 0.31, 0.03, 0.3, 0.03, Mats.chrome(), 0xffffff, { collide: false });
    k.box(0.1, 1.0, 0.31, 0.03, 0.3, 0.03, Mats.chrome(), 0xffffff, { collide: false });
  },
  desk(k, w = 1.6) {
    k.box(0, 0.74, 0, w, 0.05, 0.75, Mats.wood(), 0x5a4030);
    k.box(-w / 2 + 0.25, 0, 0, 0.45, 0.74, 0.7, Mats.wood(), 0x4a3426, { collide: false });
    k.box(w / 2 - 0.04, 0, 0, 0.06, 0.74, 0.7, Mats.metal(), 0x222222, { collide: false });
    k.collider(-w / 2, 0, -0.38, w / 2, 0.79, 0.38);
    k.box(0.1, 0.79, -0.2, 0.6, 0.38, 0.03, Mats.plastic(), 0x111111, { collide: false });
    k.box(0.1, 0.83, -0.18, 0.56, 0.32, 0.01, Mats.glow(), 0x3a6ea8, { collide: false });
    k.box(0.1, 0.79, 0.1, 0.45, 0.02, 0.15, Mats.plastic(), 0x222222, { collide: false });
    Furniture.chair(k, 0.1, 0.65, 0, 0x111111);
  },
  bookshelf(k, w = 1.6, h = 2.2) {
    const wd = Mats.wood();
    k.box(0, 0, 0, w, h, 0.35, wd, 0x7a5a40, { collide: false });
    k.collider(-w / 2, 0, -0.18, w / 2, h, 0.18);
    const cols = [0xa83232, 0x2f5f8f, 0xd8b04a, 0x3f7a4a, 0x6a3a7a, 0xe0d8c8, 0x222222];
    for (let r = 0; r < 5; r++) {
      let x = -w / 2 + 0.06;
      while (x < w / 2 - 0.1) {
        const bw = 0.03 + Math.random() * 0.05, bh = 0.22 + Math.random() * 0.12;
        k.box(x + bw / 2, 0.08 + r * (h / 5), 0.04, bw, bh, 0.24, Mats.paint(), cols[Math.floor(Math.random() * cols.length)], { collide: false, cast: false });
        x += bw + 0.005;
      }
    }
  },
  plant(k, x, z, h = 1.2) {
    k.cyl(x, 0, z, 0.22, 0.17, 0.4, Mats.plastic(), 0xd9d4cc, { collide: true });
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      k.sphere(x + Math.cos(a) * 0.15, 0.5 + h * 0.4 + (i % 2) * 0.2, z + Math.sin(a) * 0.15, 0.28, Mats.leaves(), 0x3f7a3a, { sy: 1.3, seg: 6 });
    }
  },
  floorLamp(k, x, z, world) {
    k.cyl(x, 0, z, 0.15, 0.18, 0.04, Mats.metal(), 0x222222);
    k.cyl(x, 0.04, z, 0.015, 0.015, 1.45, Mats.metal(), 0x222222);
    k.cyl(x, 1.45, z, 0.18, 0.26, 0.3, Mats.lamp(), 0xfff0d8);
    if (world) world.addLightAnchor(k.point(x, 1.4, z), 0xffd8a8, 5, 7, true);
  },
  ceilingLamp(k, x, y, z, world, color = 0xfff2e0, intensity = 7, dist = 10) {
    k.cyl(x, y - 0.12, z, 0.25, 0.25, 0.08, Mats.lamp(), 0xffffff, { cast: false });
    if (world) world.addLightAnchor(k.point(x, y - 0.3, z), color, intensity, dist, true);
  },
  rug(k, x, z, w, d) {
    const g = new THREE.BoxGeometry(w, 0.012, d); g.translate(x, 0.006, z);
    k.geo(g, Mats.rug(), 0xffffff, { cast: false });
  },
  painting(k, x, y, z, w = 1.2, h = 0.9, seed = 1) {
    const g = new THREE.PlaneGeometry(w, h); g.translate(x, y, z + 0.02);
    const mtl = new THREE.MeshStandardMaterial({ map: (k.world.paintTex || (k.world.paintTex = {}))[seed] || ((k.world.paintTex[seed] = k.world.Tex.painting(seed))), roughness: 0.6, vertexColors: true });
    k.geo(g, mtl, 0xffffff, { cast: false });
  },
  tv(k, world, x, y, z) {
    k.box(x, 0, z, 2.0, 0.45, 0.45, Mats.wood(), 0x2a2622);
    k.box(x, y, z - 0.05, 1.65, 0.95, 0.06, Mats.plastic(), 0x0a0a0a, { collide: false });
    // dynamic screen (toggled on/off)
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x050505, toneMapped: false });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.58, 0.88), screenMat);
    const p = k.point(x, y + 0.475, z - 0.015);
    screen.position.copy(p); screen.rotation.y = k.rot;
    world.scene.add(screen);
    world.addInteractable({
      pos: p, radius: 2.2, label: () => (screen.userData.on ? 'Turn off TV' : 'Turn on TV'),
      action: () => { screen.userData.on = !screen.userData.on; world.audio.click(); },
      update: (t) => {
        if (!screen.userData.on) { screenMat.color.setHex(0x050505); return; }
        const h = (Math.sin(t * 0.7) * 0.5 + 0.5) * 0.6 + 0.4 * Math.sin(t * 3.1) ** 2;
        screenMat.color.setHSL((t * 0.05) % 1, 0.6, 0.25 + h * 0.3);
      },
    });
  },
  kitchen(k, w = 4, color = 0xf2f0ec, top = 0x2a2a2e) {
    // counter run along local x, against wall at -z
    k.box(0, 0, 0, w, 0.88, 0.62, Mats.paint(), color);
    k.box(0, 0.88, 0.01, w + 0.02, 0.05, 0.66, Mats.marble(), top, { collide: false });
    k.box(0, 1.5, -0.12, w, 0.7, 0.38, Mats.paint(), color, { collide: false });
    k.box(-w / 2 + 0.5, 0.93, 0.05, 0.6, 0.02, 0.5, Mats.metal(), 0x111111, { collide: false }); // cooktop
    k.box(w / 4, 0.9, 0.05, 0.5, 0.04, 0.4, Mats.chrome(), 0xcccccc, { collide: false }); // sink
    k.cyl(w / 4, 0.93, -0.18, 0.02, 0.02, 0.3, Mats.chrome(), 0xffffff, { collide: false });
    for (let i = 0; i < Math.floor(w / 0.6); i++) k.box(-w / 2 + 0.3 + i * 0.6, 0.6, 0.315, 0.2, 0.02, 0.02, Mats.chrome(), 0xffffff, { collide: false });
  },
  fridge(k, x, z, world, heal = true) {
    k.box(x, 0, z, 0.85, 1.9, 0.7, Mats.metal(), 0xd8dade);
    k.box(x - 0.3, 0.9, z + 0.36, 0.03, 0.5, 0.03, Mats.chrome(), 0xffffff, { collide: false });
    if (heal && world) {
      world.addInteractable({ pos: k.point(x, 1, z + 0.6), radius: 1.6, label: 'Grab a snack (+25 health)', action: () => world.game.useHealSnack() });
    }
  },
  island(k, w = 2.6) {
    k.box(0, 0, 0, w, 0.9, 1.0, Mats.paint(), 0x2f3640);
    k.box(0, 0.9, 0, w + 0.2, 0.06, 1.15, Mats.marble(), 0xffffff, { collide: false });
    for (let i = 0; i < 3; i++) {
      const x = -w / 2 + 0.45 + i * ((w - 0.9) / 2);
      k.cyl(x, 0, 0.85, 0.03, 0.12, 0.72, Mats.chrome(), 0xffffff);
      k.cyl(x, 0.72, 0.85, 0.2, 0.18, 0.06, Mats.fabric(), 0x222222, { collide: false });
    }
  },
  tub(k) {
    k.box(0, 0, 0, 1.7, 0.55, 0.8, Mats.tiles(), 0xffffff);
    k.box(0, 0.45, 0, 1.5, 0.11, 0.6, Mats.pool(), 0xffffff, { collide: false });
  },
  toilet(k, x, z) {
    k.box(x, 0, z, 0.4, 0.42, 0.55, Mats.tiles(), 0xffffff);
    k.box(x, 0.42, z - 0.22, 0.42, 0.4, 0.18, Mats.tiles(), 0xffffff, { collide: false });
  },
  sink(k, x, z) {
    k.box(x, 0, z, 0.9, 0.82, 0.5, Mats.wood(), 0x6a5040);
    k.box(x, 0.82, z, 0.95, 0.05, 0.55, Mats.marble(), 0xffffff, { collide: false });
    k.box(x, 1.2, z - 0.24, 0.8, 0.8, 0.02, Mats.chrome(), 0xffffff, { collide: false }); // mirror
  },
  fireplace(k, world, w = 2.2) {
    k.box(0, 0, 0, w, 1.1, 0.5, Mats.marble(), 0x3a3a3c);
    k.box(0, 0.25, 0.2, w * 0.6, 0.45, 0.12, Mats.glow(), 0xff7a2a, { collide: false });
    world.addLightAnchor(k.point(0, 0.7, 0.8), 0xff8840, 4, 7, true, true);
  },
  railing(k, x0, z0, x1, z1, y, h = 1.0) {
    // glass balustrade with steel cap
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const g = new THREE.BoxGeometry(0.03, h, len); g.rotateY(ang); g.translate(cx, y + h / 2, cz);
    k.geo(g, Mats.glass(), 0xffffff, { cast: false });
    const g2 = new THREE.BoxGeometry(0.06, 0.05, len); g2.rotateY(ang); g2.translate(cx, y + h, cz);
    k.geo(g2, Mats.chrome(), 0xffffff);
    const minx = Math.min(x0, x1) - 0.05, maxx = Math.max(x0, x1) + 0.05, minz = Math.min(z0, z1) - 0.05, maxz = Math.max(z0, z1) + 0.05;
    k.collider(minx, y, minz, maxx, y + h, maxz);
  },
  shelfUnit(k, w = 3, h = 1.8, products = true) {
    k.box(0, 0, 0, w, h, 0.6, Mats.metal(), 0xdddddd);
    if (!products) return;
    const cols = [0xd83a3a, 0x3a7ad8, 0xf2c84a, 0x4ab86a, 0xf08a3a, 0xffffff, 0x9a5ad8];
    for (let r = 0; r < 4; r++) for (let side of [-1, 1]) {
      let x = -w / 2 + 0.1;
      while (x < w / 2 - 0.15) {
        const pw = 0.1 + Math.random() * 0.15, ph = 0.12 + Math.random() * 0.2;
        k.box(x + pw / 2, 0.15 + r * (h / 4), side * 0.33, pw, ph, 0.08, Mats.plastic(), cols[Math.floor(Math.random() * cols.length)], { collide: false, cast: false });
        x += pw + 0.03;
      }
    }
  },
  fridgeDisplay(k, w = 3) {
    k.box(0, 0, 0, w, 2.1, 0.7, Mats.metal(), 0x333840);
    k.box(0, 0.1, 0.33, w - 0.1, 1.9, 0.02, Mats.glow(), 0xcfe8ff, { collide: false });
    const cols = [0xd83a3a, 0x3a7ad8, 0xf2c84a, 0x4ab86a, 0xffffff];
    for (let r = 0; r < 4; r++) for (let i = 0; i < w / 0.14 - 1; i++) k.cyl(-w / 2 + 0.12 + i * 0.14, 0.2 + r * 0.45, 0.25, 0.035, 0.035, 0.22, Mats.plastic(), cols[(i + r) % cols.length], { collide: false, cast: false, seg: 6 });
  },
  counter(k, w = 3) {
    k.box(0, 0, 0, w, 1.0, 0.7, Mats.wood(), 0x8a6040);
    k.box(0, 1.0, 0, w + 0.1, 0.05, 0.8, Mats.marble(), 0x222222, { collide: false });
    k.box(w / 4, 1.05, 0, 0.4, 0.25, 0.35, Mats.plastic(), 0x222222, { collide: false });
  },
  clothesRack(k, w = 2) {
    k.box(0, 1.45, 0, w, 0.04, 0.04, Mats.chrome(), 0xffffff, { collide: false });
    k.box(-w / 2, 0, 0, 0.04, 1.47, 0.04, Mats.chrome(), 0xffffff, { collide: false });
    k.box(w / 2, 0, 0, 0.04, 1.47, 0.04, Mats.chrome(), 0xffffff, { collide: false });
    k.collider(-w / 2, 0, -0.3, w / 2, 1.5, 0.3);
    const cols = [0x1f2a44, 0xd8d0c0, 0x8a2a2a, 0x2a6a4a, 0x111111, 0xc8a050, 0x5a7ab0];
    for (let i = 0; i < w / 0.12; i++) k.box(-w / 2 + 0.1 + i * 0.12, 0.6, 0, 0.05, 0.8, 0.5, Mats.fabric(), cols[i % cols.length], { collide: false, cast: false });
  },
  stool(k, x, z, color = 0xb02020) {
    k.cyl(x, 0, z, 0.04, 0.15, 0.7, Mats.chrome(), 0xffffff);
    k.cyl(x, 0.7, z, 0.2, 0.2, 0.07, Mats.fabric(), color, { collide: false });
  },
  staircase(k, x, z, width, rise, run, steps, dir = 1, material = Mats.wood(), color = 0xffffff) {
    // steps climb along local +z (dir=1) from (x,z); each step a solid box from floor
    for (let i = 0; i < steps; i++) {
      const top = (i + 1) * rise;
      const cz = z + dir * (i * run + run / 2);
      k.box(x, 0, cz, width, top, run, material, color, { collide: true, cast: true });
    }
  },
};
