// Terrain (hills, beach), the ocean, the winding road to Mirador Heights and the pier.
import * as THREE from 'three';
import { terrainHeight, WORLD, SEA_LEVEL, hillRoadX, hillRoadY, HILL_ROAD, VILLA } from './layout.js';
import { Mats } from './materials.js';
import { RNG, smoothstep, fbm } from '../core/utils.js';
import { Kit } from './kit.js';

const STEP = 4;

export class Terrain {
  constructor(world) { this.world = world; this.rng = new RNG(99); }
  build() {
    this.buildGround();
    this.buildFarLands();
    this.buildOcean();
    this.buildHillRoad();
    this.buildPier();
    this.scatter();
  }
  buildGround() {
    const { minX, maxX, minZ, maxZ } = WORLD;
    const nx = Math.round((maxX - minX) / STEP), nz = Math.round((maxZ - minZ) / STEP);
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3), col = new Float32Array((nx + 1) * (nz + 1) * 3), uv = new Float32Array((nx + 1) * (nz + 1) * 2);
    const heights = new Float32Array((nx + 1) * (nz + 1));
    const c = new THREE.Color();
    const grass = new THREE.Color(0x5f7a3c), dry = new THREE.Color(0xa89a62), rock = new THREE.Color(0x707257), sand = new THREE.Color(0xe0cfa4), wetSand = new THREE.Color(0xb09a72);
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = minX + i * STEP, z = minZ + j * STEP, k = j * (nx + 1) + i;
      const h = terrainHeight(x, z);
      heights[k] = h;
      const inCity = Math.abs(x) < 286 && z > -286 && z < 286;
      pos[k * 3] = x; pos[k * 3 + 1] = inCity ? h - 0.3 : h; pos[k * 3 + 2] = z;
      uv[k * 2] = x / 8; uv[k * 2 + 1] = z / 8;
      // color by height/slope/zone
      const hx = terrainHeight(x + 2, z) - terrainHeight(x - 2, z), hz = terrainHeight(x, z + 2) - terrainHeight(x, z - 2);
      const slope = Math.sqrt(hx * hx + hz * hz) / 4;
      c.copy(grass).lerp(dry, smoothstep(0.3, 0.8, fbm(x * 0.01, z * 0.01, 3)) * 0.8);
      c.lerp(rock, smoothstep(0.35, 0.8, slope));
      if (z > 288) c.copy(sand).lerp(wetSand, smoothstep(0.2, -0.6, h));
      const v = 0.85 + fbm(x * 0.08, z * 0.08, 2) * 0.3;
      col[k * 3] = c.r * v; col[k * 3 + 1] = c.g * v; col[k * 3 + 2] = c.b * v;
    }
    const idx = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, Mats.terrain());
    mesh.receiveShadow = true; mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    this.world.scene.add(mesh);
    // Physics uses the same triangulation so feet/wheels match the mesh exactly.
    const col2 = this.world.collision;
    col2.terrainHeight = (x, z) => {
      if (Math.abs(x) <= 286 && z >= -286 && z <= 288) return 0;
      const fx = (x - minX) / STEP, fz = (z - minZ) / STEP;
      const i = Math.max(0, Math.min(nx - 1, Math.floor(fx))), j = Math.max(0, Math.min(nz - 1, Math.floor(fz)));
      const u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fz - j));
      const a = heights[j * (nx + 1) + i], b = heights[j * (nx + 1) + i + 1], d = heights[(j + 1) * (nx + 1) + i], e = heights[(j + 1) * (nx + 1) + i + 1];
      // triangles (a,d,b) and (b,d,e)
      if (u + v <= 1) return a + (b - a) * u + (d - a) * v;
      return e + (d - e) * (1 - u) + (b - e) * (1 - v);
    };
  }
  /** Distant mountain ring + ground skirt so the world never ends in a void. */
  buildFarLands() {
    const { minX, maxX, minZ, maxZ } = WORLD;
    // low-res continuation of the terrain far beyond the playable bounds
    const S2 = 24, x0 = -1700, x1 = 1700, z0 = -1900, z1 = 480;
    const nx = Math.round((x1 - x0) / S2), nz = Math.round((z1 - z0) / S2);
    const P = [], C = [], I = [];
    const cc = new THREE.Color(), grass = new THREE.Color(0x5a7038), dry = new THREE.Color(0x9a8c5a);
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + i * S2, z = z0 + j * S2;
      const inside = x > minX + 8 && x < maxX - 8 && z > minZ + 8 && z < maxZ - 8;
      let h = terrainHeight(x, z);
      if (Math.abs(x) > 470 || z < -690) h += fbm(x * 0.004, z * 0.004, 3) * 70 * smoothstep(470, 900, Math.max(Math.abs(x), -z - 220));
      P.push(x, inside ? h - 3 : h - 0.4, z);
      cc.copy(grass).lerp(dry, fbm(x * 0.01, z * 0.01, 2) * 0.8); if (z > 290) cc.setHex(0xc8b48a);
      C.push(cc.r, cc.g, cc.b);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; I.push(a, d, b, b, d, e); }
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); og.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    og.setIndex(I); og.computeVertexNormals();
    const om = new THREE.Mesh(og, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); om.receiveShadow = false;
    this.world.scene.add(om);
  }
  buildOcean() {
    const g = new THREE.PlaneGeometry(3000, 1600, 60, 30); g.rotateX(-Math.PI / 2);
    g.translate(0, SEA_LEVEL, 300 + 800);
    const mtl = new THREE.MeshStandardMaterial({ color: 0x1b5366, roughness: 0.06, metalness: 0.05, normalMap: Mats.water().normalMap, normalScale: new THREE.Vector2(0.55, 0.55), transparent: true, opacity: 0.94 });
    mtl.normalMap.repeat.set(1, 1);
    const tU = { value: 0 };
    mtl.onBeforeCompile = (sh) => {
      sh.uniforms.uT = tU;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT; varying vec2 vWxz;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vec4 wpo = modelMatrix * vec4(position, 1.0); vWxz = wpo.xz;
transformed.y += sin(wpo.x * 0.05 + uT * 0.9) * 0.25 + sin(wpo.z * 0.08 + uT * 1.3) * 0.18;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uT; varying vec2 vWxz;')
        .replace('#include <normal_fragment_maps>', `
vec3 n1 = texture2D(normalMap, vWxz * 0.012 + vec2(uT * 0.006, uT * 0.004)).xyz * 2.0 - 1.0;
vec3 n2 = texture2D(normalMap, vWxz * 0.031 - vec2(uT * 0.008, -uT * 0.005)).xyz * 2.0 - 1.0;
vec3 mapN = normalize(vec3((n1.xy + n2.xy) * normalScale, 1.0));
normal = normalize(tbn * mapN);`)
        .replace('#include <opaque_fragment>', `
float shore = smoothstep(380.0, 300.0, vWxz.y);
outgoingLight = mix(outgoingLight, outgoingLight + vec3(0.05, 0.12, 0.12), shore * 0.6);
#include <opaque_fragment>`);
    };
    const mesh = new THREE.Mesh(g, mtl); mesh.receiveShadow = false;
    this.world.scene.add(mesh);
    this.world.oceanTime = tU;
    this.world.mapRects.push({ x0: -1500, z0: 345, x1: 1500, z1: 1500, type: 'sea' });
    // foam line
    const fg = new THREE.PlaneGeometry(1000, 6, 100, 1); fg.rotateX(-Math.PI / 2);
    const fpos = fg.attributes.position;
    for (let i = 0; i < fpos.count; i++) {
      const x = fpos.getX(i);
      // shoreline where terrain crosses sea level (~z 333)
      let z = 333; for (let zz = 300; zz < 380; zz += 0.5) { if (terrainHeight(x, zz) < SEA_LEVEL + 0.05) { z = zz; break; } }
      fpos.setZ(i, fpos.getZ(i) + z); fpos.setY(i, SEA_LEVEL + 0.05);
    }
    const fmat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, map: this.world.Tex.radial('rgba(255,255,255,1)') });
    this.world.foam = new THREE.Mesh(fg, fmat); this.world.scene.add(this.world.foam);
  }
  buildHillRoad() {
    const pts = [];
    for (let z = HILL_ROAD.z0; z >= HILL_ROAD.z1 - 0.01; z -= 2) pts.push(z);
    const w = HILL_ROAD.width / 2;
    const pos = [], uv = [], idx = [], nrm = [];
    let dist = 0, prev = null;
    for (const z of pts) {
      const x = hillRoadX(z), y = Math.max(hillRoadY(z), 0) + 0.05;
      if (prev) dist += Math.hypot(x - prev[0], z - prev[1], y - prev[2]);
      // perpendicular direction
      const dx = hillRoadX(z - 1) - hillRoadX(z + 1), dz = -2, l = Math.hypot(dx, dz);
      const px = -dz / l, pz = dx / l;
      pos.push(x - px * w, y, z - pz * w, x + px * w, y, z + pz * w);
      nrm.push(0, 1, 0, 0, 1, 0);
      uv.push(0, dist / 9, HILL_ROAD.width / 9, dist / 9);
      prev = [x, z, y];
    }
    for (let i = 0; i < pts.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    // ensure normals face up
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    this.world.batcher.add(g, Mats.asphalt(), { cast: false, color: 0xffffff });
    // center dashes + guard rails + lamps
    const k = new Kit(this.world);
    for (let i = 0; i < pts.length - 2; i += 3) {
      const z = pts[i], x = hillRoadX(z), y = Math.max(hillRoadY(z), 0) + 0.07;
      const ang = Math.atan2(hillRoadX(z - 1) - hillRoadX(z + 1), -2);
      const dg = new THREE.PlaneGeometry(0.15, 3); dg.rotateX(-Math.PI / 2); dg.rotateY(ang); dg.translate(x, y, z);
      this.world.batcher.add(dg, Mats.lane(), { color: 0xe8b830, cast: false });
    }
    let li = 0;
    for (let z = HILL_ROAD.z0 - 20; z > HILL_ROAD.z1 + 10; z -= 6) {
      li++;
      for (const side of [-1, 1]) {
        const x = hillRoadX(z) + side * (w + 0.8), y = hillRoadY(z);
        k.at(x, y, z); k.box(0, 0, 0, 0.12, 0.8, 0.12, Mats.metal(), 0x8a8a8a, { collide: false });
        const x2 = hillRoadX(z - 6) + side * (w + 0.8), y2 = hillRoadY(z - 6);
        const len = Math.hypot(x2 - x, z - 6 - z, y2 - y);
        const rg = new THREE.BoxGeometry(0.06, 0.3, len); rg.rotateX(Math.atan2(y2 - y, 6)); rg.rotateY(Math.atan2(x2 - x, -6)); rg.translate((x + x2) / 2, (y + y2) / 2 + 0.6, z - 3);
        this.world.batcher.add(rg, Mats.metal(), { color: 0xb8b8b8 });
        this.world.collision.add(Math.min(x, x2) - 0.15, Math.min(y, y2) - 1, z - 6, Math.max(x, x2) + 0.15, Math.max(y, y2) + 0.9, z, { noCam: true });
      }
      if (li % 6 === 0) {
        const x = hillRoadX(z) + (w + 1.5), y = hillRoadY(z);
        this.world.city.streetLamp(x, z, -1, 0, y);
      }
    }
  }
  buildPier() {
    const k = new Kit(this.world), x0 = 112, x1 = 128, z0 = 288, z1 = 420, y = 1.6;
    k.at(0, 0, 0);
    // deck as low collider ramps up from the promenade
    const deck = new THREE.BoxGeometry(x1 - x0, 0.3, z1 - z0); deck.translate((x0 + x1) / 2, y - 0.15, (z0 + z1) / 2);
    this.world.batcher.add(deck, Mats.wood(), { color: 0xb89870 });
    const ramp = new THREE.BoxGeometry(x1 - x0, 0.3, 14); ramp.rotateX(Math.atan2(y - 0.15, 14)); ramp.translate((x0 + x1) / 2, (y + 0.15) / 2 - 0.15, 285);
    this.world.batcher.add(ramp, Mats.wood(), { color: 0xb89870 });
    // ramp steps as low colliders so cars/peds climb
    for (let i = 0; i < 10; i++) this.world.collision.add(x0, 0, 278 + i * 1.4, x1, 0.15 + (y - 0.15) * (i + 1) / 10, 279.4 + i * 1.4, { low: true, noCam: true });
    this.world.collision.add(x0, 0, z0, x1, y, z1, { low: true, noCam: true });
    for (let z = z0 + 4; z < z1; z += 8) for (const x of [x0 + 0.5, x1 - 0.5]) {
      k.at(x, -3, z); k.cyl(0, 0, 0, 0.25, 0.25, y + 3, Mats.wood(), 0x6a5038, { seg: 8 });
      k.at(x, y, z); k.box(0, 0, 0, 0.15, 1.1, 0.15, Mats.wood(), 0xe8e0d0, { collide: false });
    }
    for (const x of [x0 + 0.3, x1 - 0.3]) {
      const rg = new THREE.BoxGeometry(0.1, 0.1, z1 - z0); rg.translate(x, y + 1.05, (z0 + z1) / 2);
      this.world.batcher.add(rg, Mats.wood(), { color: 0xf0e8dc });
      this.world.collision.add(x - 0.1, y, z0, x + 0.1, y + 1.1, z1, { noCam: true });
    }
    this.world.collision.add(x0, y, z1 - 0.1, x1, y + 1.1, z1 + 0.1, { noCam: true });
    for (let z = z0 + 10; z < z1; z += 24) { this.world.city.kit.at(0, 0, 0); this.pierLamp(x0 + 0.6, z, y); this.pierLamp(x1 - 0.6, z, y); }
    this.world.mapRects.push({ x0, z0, x1, z1, type: 'pier' });
    // pier-end café kiosk
    k.at(120, y, 410); k.box(0, 0, 0, 6, 3, 4, Mats.paint(), 0xf4f0e8); k.box(0, 3, 0, 7, 0.2, 5, Mats.paint(), 0x2a8aa8, { collide: false });
  }
  pierLamp(x, z, y) {
    const k = new Kit(this.world).at(x, y, z);
    k.cyl(0, 0, 0, 0.06, 0.08, 3.4, Mats.metal(), 0x1a1a1a);
    k.sphere(0, 3.6, 0, 0.25, Mats.lamp(), 0xffffff, { cast: false });
    this.world.addLightAnchor(new THREE.Vector3(x, y + 3.5, z), 0xffd6a0, 6, 14, false);
  }
  scatter() {
    const r = this.rng, city = this.world.city;
    let placed = 0;
    for (let n = 0; n < 2600 && placed < 520; n++) {
      const x = r.range(WORLD.minX + 10, WORLD.maxX - 10), z = r.range(WORLD.minZ + 10, 300);
      if (Math.abs(x) < 296 && z > -296) continue;
      const h = terrainHeight(x, z);
      if (z < -280 && Math.abs(x - hillRoadX(z)) < HILL_ROAD.width / 2 + 4 && z > -560) continue;
      if (Math.abs(x - VILLA.x) < VILLA.hx + 4 && Math.abs(z - VILLA.z) < VILLA.hz + 4) continue;
      const dense = fbm(x * 0.012 + 40, z * 0.012, 3);
      if (dense < 0.45) continue;
      city.tree(x, z, r.range(0.9, 1.6), z < -300 && r.chance(0.6) ? 'pine' : (r.chance(0.15) ? 'palm' : 'round'), h - 0.1);
      placed++;
    }
    // rocks
    const k = new Kit(this.world);
    for (let n = 0; n < 160; n++) {
      const x = r.range(WORLD.minX + 10, WORLD.maxX - 10), z = r.range(WORLD.minZ + 10, 250);
      if (Math.abs(x) < 300 && z > -300) continue;
      if (z < -280 && Math.abs(x - hillRoadX(z)) < 12 && z > -560) continue;
      if (Math.abs(x - VILLA.x) < VILLA.hx + 4 && Math.abs(z - VILLA.z) < VILLA.hz + 4) continue;
      const h = terrainHeight(x, z), s = r.range(0.6, 2.2);
      const g = new THREE.DodecahedronGeometry(s, 0); g.scale(1, r.range(0.5, 0.9), 1.2); g.rotateY(r.range(0, 6));
      k.at(x, h + s * 0.2, z); k.geo(g, Mats.terrain(), 0x8a847a);
      this.world.collision.add(x - s * 0.8, h - 1, z - s * 0.8, x + s * 0.8, h + s * 0.8, z + s * 0.8);
    }
    // beach umbrellas & towels
    for (let x = -260; x < 260; x += r.range(14, 26)) {
      const z = r.range(300, 322), h = terrainHeight(x, z);
      k.at(x, h, z);
      k.cyl(0, 0, 0, 0.04, 0.04, 2.4, Mats.metal(), 0xdddddd);
      const cone = new THREE.ConeGeometry(1.6, 0.6, 10, 1, true); cone.translate(0, 2.4, 0);
      k.geo(cone, this.world.frondMat, r.pick([0xe84a3a, 0x3a8ae8, 0xf2c84a, 0xffffff, 0x3ab88a]));
      const tw = new THREE.PlaneGeometry(0.9, 1.9); tw.rotateX(-Math.PI / 2); tw.translate(1.4, 0.03, 0.3);
      k.geo(tw, this.world.frondMat, r.pick([0xf2a0b0, 0x80c8f0, 0xf8e080]), { cast: false });
    }
  }
}
