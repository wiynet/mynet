// Static collision world: axis-aligned boxes in a spatial hash, plus the terrain
// height function. Used by the player, NPCs, vehicles and the camera.
const CELL = 8;

export class CollisionWorld {
  constructor() {
    this.cells = new Map();
    this.boxes = [];
    this.terrainHeight = () => 0;
    this._stamp = 0;
  }
  _key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  /** Adds a box. opts: { low: drivable curb, door, tag, dynamic } */
  add(minX, minY, minZ, maxX, maxY, maxZ, opts = {}) {
    const b = { minX, minY, minZ, maxX, maxY, maxZ, enabled: true, stamp: 0, ...opts };
    this.boxes.push(b);
    this._insert(b);
    return b;
  }
  addCentered(cx, cy, cz, sx, sy, sz, opts) {
    return this.add(cx - sx / 2, cy, cz - sz / 2, cx + sx / 2, cy + sy, cz + sz / 2, opts);
  }
  _insert(b) {
    const x0 = Math.floor(b.minX / CELL), x1 = Math.floor(b.maxX / CELL);
    const z0 = Math.floor(b.minZ / CELL), z1 = Math.floor(b.maxZ / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = this._key(ix, iz);
      let c = this.cells.get(k); if (!c) { c = []; this.cells.set(k, c); }
      c.push(b);
    }
  }
  /** Collect enabled boxes overlapping a horizontal rectangle (deduplicated). */
  query(minX, minZ, maxX, maxZ, out = []) {
    out.length = 0;
    const stamp = ++this._stamp;
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const c = this.cells.get(this._key(ix, iz)); if (!c) continue;
      for (const b of c) {
        if (b.stamp === stamp || !b.enabled) continue;
        b.stamp = stamp;
        if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
        out.push(b);
      }
    }
    return out;
  }

  /** Highest walkable surface under a circle at (x,z) whose top is <= maxY. */
  groundAt(x, z, maxY, radius = 0.25) {
    let g = this.terrainHeight(x, z);
    const list = this.query(x - radius, z - radius, x + radius, z + radius, this._tmpG || (this._tmpG = []));
    for (const b of list) {
      if (b.noGround) continue;
      if (b.maxY <= maxY && b.maxY > g && x + radius > b.minX && x - radius < b.maxX && z + radius > b.minZ && z - radius < b.maxZ) g = b.maxY;
    }
    return g;
  }
  /** Drivable height for vehicles (terrain + low curbs/ramps). */
  driveHeight(x, z) {
    let g = this.terrainHeight(x, z);
    const list = this.query(x, z, x, z, this._tmpD || (this._tmpD = []));
    for (const b of list) if (b.low && b.maxY > g && b.maxY - g < 0.35 && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) g = b.maxY;
    return g;
  }

  /**
   * Push a vertical cylinder out of boxes. pos is mutated. Returns true if hit.
   * Boxes whose top is below feet+step are ignored (they are walked over).
   */
  resolveCylinder(pos, radius, height, step = 0.45) {
    const feet = pos.y;
    const list = this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius, this._tmpC || (this._tmpC = []));
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      for (const b of list) {
        if (b.maxY <= feet + step || b.minY >= feet + height) continue;
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = radius - d;
          pos.x += (dx / d) * push; pos.z += (dz / d) * push;
        } else {
          // Center inside the box: push out along the smallest axis.
          const l = pos.x - b.minX, r = b.maxX - pos.x, n = pos.z - b.minZ, s = b.maxZ - pos.z;
          const m = Math.min(l, r, n, s);
          if (m === l) pos.x = b.minX - radius; else if (m === r) pos.x = b.maxX + radius;
          else if (m === n) pos.z = b.minZ - radius; else pos.z = b.maxZ + radius;
        }
      }
    }
    return hit;
  }
  /** Lowest ceiling above y within a circle (for jumping / standing up). */
  ceilingAt(x, z, y, radius = 0.3) {
    let c = Infinity;
    const list = this.query(x - radius, z - radius, x + radius, z + radius, this._tmpE || (this._tmpE = []));
    for (const b of list) if (b.minY >= y && b.minY < c && x + radius > b.minX && x - radius < b.maxX && z + radius > b.minZ && z - radius < b.maxZ) c = b.minY;
    return c;
  }

  /** Segment vs boxes; returns the hit fraction t in [0,1] (1 = clear). */
  raycast(ax, ay, az, bx, by, bz, ignoreLow = true) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const list = this.query(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), this._tmpR || (this._tmpR = []));
    let best = 1;
    for (const b of list) {
      if (ignoreLow && b.low) continue;
      if (b.noCam) continue;
      let t0 = 0, t1 = best, ok = true;
      const axes = [[ax, dx, b.minX, b.maxX], [ay, dy, b.minY, b.maxY], [az, dz, b.minZ, b.maxZ]];
      for (const [o, d, mn, mx] of axes) {
        if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { ok = false; break; } continue; }
        let ta = (mn - o) / d, tb = (mx - o) / d;
        if (ta > tb) { const tt = ta; ta = tb; tb = tt; }
        if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 < best) best = t0;
    }
    // Terrain check by sampling.
    for (let i = 1; i <= 8; i++) {
      const t = (i / 8) * best;
      if (ay + dy * t < this.terrainHeight(ax + dx * t, az + dz * t) + 0.1) { best = Math.max(0, t - 1 / 8); break; }
    }
    return best;
  }
  /** True if a straight line between two points is unobstructed (line of sight). */
  visible(ax, ay, az, bx, by, bz) { return this.raycast(ax, ay, az, bx, by, bz) > 0.98; }
}

/**
 * 2D separating-axis test between oriented rectangles.
 * Rect: {x, z, hx, hz, angle}. Returns {nx, nz, depth} pushing A out of B, or null.
 */
export function obbOverlap(a, b) {
  const axes = [];
  const ca = Math.cos(a.angle), sa = Math.sin(a.angle), cb = Math.cos(b.angle), sb = Math.sin(b.angle);
  // Local axes: forward = (sin, cos) in (x,z) for heading angle, right = (cos, -sin)
  axes.push([sa, ca], [ca, -sa], [sb, cb], [cb, -sb]);
  const dx = a.x - b.x, dz = a.z - b.z;
  let minDepth = Infinity, nx = 0, nz = 0;
  for (const [ax, az] of axes) {
    const ra = a.hz * Math.abs(sa * ax + ca * az) + a.hx * Math.abs(ca * ax - sa * az);
    const rb = b.hz * Math.abs(sb * ax + cb * az) + b.hx * Math.abs(cb * ax - sb * az);
    const d = dx * ax + dz * az;
    const overlap = ra + rb - Math.abs(d);
    if (overlap <= 0) return null;
    if (overlap < minDepth) { minDepth = overlap; const s = d < 0 ? -1 : 1; nx = ax * s; nz = az * s; }
  }
  return { nx, nz, depth: minDepth };
}
