// Geometry helpers and a static batcher that merges thousands of props into a
// few draw calls per world chunk and material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

/** Box whose UVs are in world meters divided by tile size, so textures keep scale. */
export function worldBox(sx, sy, sz, tile = 1, tileY = tile) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    let w, h;
    if (ny > 0.5) { w = sx; h = sz; } else if (nx > 0.5) { w = sz; h = sy; } else { w = sx; h = sy; }
    uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * h / (ny > 0.5 ? tile : tileY));
  }
  return g;
}
export function planeXZ(sx, sz, tile = 1) {
  const g = new THREE.PlaneGeometry(sx, sz);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx / tile, uv.getY(i) * sz / tile);
  return g;
}

function normalize(g) {
  if (!g.index) {
    const idx = new Array(g.attributes.position.count); for (let i = 0; i < idx.length; i++) idx[i] = i;
    g.setIndex(idx);
  }
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
export function transformGeo(g, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s); g.applyMatrix4(_m); return g;
}
export function colorize(g, color) {
  _c.set(color);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

export class StaticBatcher {
  constructor(scene, chunk = 120) {
    this.scene = scene; this.chunk = chunk;
    this.buckets = new Map(); // key -> {material, geos[], castShadow, receiveShadow}
    this.meshes = [];
  }
  /**
   * Add a geometry already in world space. material must have vertexColors if colored.
   */
  add(geo, material, { color = 0xffffff, cast = true, receive = true, chunkKey = null } = {}) {
    normalize(geo);
    if (!geo.attributes.color) colorize(geo, color);
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const cx = Math.floor(((bb.min.x + bb.max.x) / 2) / this.chunk), cz = Math.floor(((bb.min.z + bb.max.z) / 2) / this.chunk);
    const key = (chunkKey || (cx + ',' + cz)) + '|' + material.uuid + '|' + cast + receive;
    let b = this.buckets.get(key);
    if (!b) { b = { material, geos: [], cast, receive }; this.buckets.set(key, b); }
    b.geos.push(geo);
  }
  build() {
    for (const b of this.buckets.values()) {
      // Split very large buckets to keep index ranges sane.
      for (let i = 0; i < b.geos.length; i += 400) {
        const merged = mergeGeometries(b.geos.slice(i, i + 400), false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, b.material);
        mesh.castShadow = b.cast; mesh.receiveShadow = b.receive;
        mesh.matrixAutoUpdate = false; mesh.updateMatrix();
        this.scene.add(mesh); this.meshes.push(mesh);
      }
      b.geos.forEach((g) => g.dispose());
    }
    this.buckets.clear();
  }
}

/** Material factory with shared instances (keeps shader count low). */
const matCache = new Map();
export function mat(key, make) {
  if (!matCache.has(key)) matCache.set(key, make());
  return matCache.get(key);
}
export function stdMat(key, params) {
  return mat(key, () => new THREE.MeshStandardMaterial({ vertexColors: true, ...params }));
}
