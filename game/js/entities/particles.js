// Pooled billboard particles (smoke, dust, sparks, water splashes, stun effects).
import * as THREE from 'three';

function softTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t;
}

export class Particles {
  constructor(scene, max = 600) {
    this.max = max; this.items = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    const tex = softTex();
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 600 } },
      vertexShader: `attribute vec4 aColor; attribute float aSize; uniform float scale; varying vec4 vC;
        void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a * t.a); if (gl_FragColor.a < 0.01) discard; }`,
      transparent: true, depthWrite: false,
    });
    this.addMat = this.mat.clone(); this.addMat.blending = THREE.AdditiveBlending;
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; scene.add(this.points);
    this.geo = g;
    // additive set
    const g2 = g.clone();
    this.pos2 = g2.attributes.position.array; this.col2 = g2.attributes.aColor.array; this.size2 = g2.attributes.aSize.array;
    this.points2 = new THREE.Points(g2, this.addMat); this.points2.frustumCulled = false; scene.add(this.points2);
    this.geo2 = g2; this.items2 = [];
  }
  /** kind: smoke | dust | spark | splash | zap | star */
  emit(kind, p, v = null, n = 1) {
    for (let i = 0; i < n; i++) {
      const additive = kind === 'spark' || kind === 'zap' || kind === 'star';
      const list = additive ? this.items2 : this.items;
      if (list.length >= this.max) list.shift();
      const it = { x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, life: 1, age: 0, size: 1, r: 1, g: 1, b: 1, a: 1, grow: 0, grav: 0, drag: 1 };
      const rnd = (s) => (Math.random() - 0.5) * s;
      if (kind === 'smoke') Object.assign(it, { vx: rnd(0.6), vy: 1 + Math.random(), vz: rnd(0.6), life: 2.2, size: 0.8, grow: 1.4, r: 0.25, g: 0.25, b: 0.27, a: 0.5 });
      if (kind === 'dust') Object.assign(it, { vx: rnd(1.5), vy: 0.3 + Math.random() * 0.4, vz: rnd(1.5), life: 1.0, size: 0.5, grow: 1.2, r: 0.6, g: 0.55, b: 0.5, a: 0.35 });
      if (kind === 'splash') Object.assign(it, { vx: rnd(2), vy: 1 + Math.random() * 2, vz: rnd(2), life: 0.5, size: 0.25, grow: 0.6, r: 0.8, g: 0.85, b: 0.9, a: 0.5, grav: 9 });
      if (kind === 'spark') Object.assign(it, { vx: rnd(6), vy: Math.random() * 4, vz: rnd(6), life: 0.35, size: 0.12, r: 1, g: 0.8, b: 0.4, a: 1, grav: 12 });
      if (kind === 'zap') Object.assign(it, { vx: rnd(1), vy: rnd(1), vz: rnd(1), life: 0.25, size: 0.35, r: 0.4, g: 0.8, b: 1, a: 1 });
      if (kind === 'star') Object.assign(it, { vx: 0, vy: 0, vz: 0, life: 0.12, size: 0.14, r: 1, g: 0.95, b: 0.4, a: 1 });
      if (kind === 'impact') Object.assign(it, { vx: rnd(2), vy: rnd(2), vz: rnd(2), life: 0.2, size: 0.5, grow: 2, r: 1, g: 1, b: 1, a: 0.6 });
      if (v) { it.vx += v.x; it.vy += v.y; it.vz += v.z; }
      list.push(it);
    }
  }
  _upd(list, pos, col, size, geo, dt) {
    let n = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i]; it.age += dt;
      if (it.age >= it.life) { list.splice(i, 1); continue; }
      it.vy -= it.grav * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
      const k = it.age / it.life;
      pos[n * 3] = it.x; pos[n * 3 + 1] = it.y; pos[n * 3 + 2] = it.z;
      col[n * 4] = it.r; col[n * 4 + 1] = it.g; col[n * 4 + 2] = it.b; col[n * 4 + 3] = it.a * (1 - k);
      size[n] = it.size * (1 + it.grow * k);
      n++;
    }
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true; geo.attributes.aColor.needsUpdate = true; geo.attributes.aSize.needsUpdate = true;
  }
  update(dt, viewportH) {
    this.mat.uniforms.scale.value = viewportH * 0.9; this.addMat.uniforms.scale.value = viewportH * 0.9;
    this._upd(this.items, this.pos, this.col, this.size, this.geo, dt);
    this._upd(this.items2, this.pos2, this.col2, this.size2, this.geo2, dt);
  }
}
