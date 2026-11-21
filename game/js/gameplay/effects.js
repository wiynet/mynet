// World-space gameplay visuals: mission markers, checkpoints, stun bolts, postcards.
import * as THREE from 'three';

function gradTex() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0.9)');
  x.fillStyle = g; x.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}
function cardTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 88;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 128, 88); g.addColorStop(0, '#ff9a3c'); g.addColorStop(0.5, '#ff5a7a'); g.addColorStop(1, '#5a6aff');
  x.fillStyle = g; x.fillRect(0, 0, 128, 88);
  x.fillStyle = '#fff3'; x.beginPath(); x.arc(90, 60, 22, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.font = 'bold 22px sans-serif'; x.fillText('SOLARA', 10, 30);
  x.strokeStyle = '#fff'; x.lineWidth = 4; x.strokeRect(2, 2, 124, 84);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Effects {
  constructor(world) {
    this.world = world; this.scene = world.scene; this.markers = []; this.bolts = []; this.cards = [];
    this.grad = gradTex(); this.card = cardTex();
    this.chevGeo = new THREE.ConeGeometry(0.35, 0.6, 4); this.chevGeo.rotateX(Math.PI);
    // one persistent light for zaps (adding lights at runtime would recompile shaders)
    this.flash = new THREE.PointLight(0x7fd8ff, 0, 9); this.scene.add(this.flash); this.flashT = 0;
  }
  marker(pos, color, kind = 'objective') {
    const grp = new THREE.Group(); grp.position.copy(pos);
    const big = kind === 'checkpoint', next = kind === 'checkpointNext';
    const R = big ? 4.5 : next ? 3 : kind === 'small' ? 0.6 : 1.1, H = big ? 7 : next ? 4 : kind === 'small' ? 0.8 : 2.4;
    const mat = new THREE.MeshBasicMaterial({ color, map: this.grad, transparent: true, opacity: next ? 0.35 : 0.85, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
    let column = null, ring = null, chev = null;
    if (kind !== 'vehicle') {
      const cg = new THREE.CylinderGeometry(R, R, H, 32, 1, true); cg.translate(0, H / 2, 0);
      const uv = cg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
      column = new THREE.Mesh(cg, mat); grp.add(column);
      const rg = new THREE.RingGeometry(R * 0.82, R, 40); rg.rotateX(-Math.PI / 2); rg.translate(0, 0.05, 0);
      ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false })); grp.add(ring);
    }
    if (kind === 'objective' || kind === 'vehicle' || kind === 'small' || kind === 'story' || kind === 'side') {
      chev = new THREE.Mesh(this.chevGeo, new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.95 }));
      chev.position.y = kind === 'vehicle' ? 0 : H + 0.6; grp.add(chev);
      if (kind === 'small') { chev.scale.setScalar(0.5); chev.position.y = 1.4; }
    }
    if (kind === 'story' || kind === 'side') {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'); x.fillStyle = '#' + color.toString(16).padStart(6, '0'); x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill();
      x.fillStyle = '#111'; x.font = 'bold 36px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(kind === 'story' ? '★' : '$', 32, 34);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, toneMapped: false }));
      sp.scale.set(0.9, 0.9, 1); sp.position.y = H + 1.5; grp.add(sp); if (chev) chev.visible = false;
    }
    this.scene.add(grp);
    const m = {
      grp, column, chev, kind, t: Math.random() * 6,
      setPos: (x, y, z) => grp.position.set(x, y, z),
      setVisible: (v) => { grp.visible = v; },
      remove: () => { this.scene.remove(grp); const i = this.markers.indexOf(m); if (i >= 0) this.markers.splice(i, 1); },
    };
    this.markers.push(m);
    return m;
  }
  bolt(a, b) {
    const pts = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const p = new THREE.Vector3().lerpVectors(a, b, i / n);
      if (i > 0 && i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25));
      pts.push(p);
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 1, toneMapped: false, blending: THREE.AdditiveBlending }));
    this.scene.add(l); this.bolts.push({ l, t: 0 });
    this.flash.position.copy(b); this.flash.intensity = 8; this.flashT = 0.15;
  }
  postcard(pos) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.42), new THREE.MeshBasicMaterial({ map: this.card, side: THREE.DoubleSide, toneMapped: false }));
    m.position.copy(pos); this.scene.add(m);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.world.Tex.radial('rgba(255,190,120,1)'), color: 0xffc080, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(1.8, 1.8, 1); m.add(glow);
    this.cards.push(m); return m;
  }
  removePostcard(m) { this.scene.remove(m); const i = this.cards.indexOf(m); if (i >= 0) this.cards.splice(i, 1); this.world.particles.emit('spark', m.position, null, 20); }
  update(dt) {
    if (this.flashT > 0) { this.flashT -= dt; this.flash.intensity = Math.max(0, this.flashT / 0.15) * 8; }
    for (const m of this.markers) {
      m.t += dt;
      if (m.chev) { m.chev.position.y += Math.sin(m.t * 3) * 0.004; m.chev.rotation.y += dt * 1.5; }
      if (m.column) m.column.material.opacity = (m.kind === 'checkpointNext' ? 0.3 : 0.7) + Math.sin(m.t * 3) * 0.12;
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]; b.t += dt; b.l.material.opacity = 1 - b.t / 0.2;
      if (b.t > 0.2) { this.scene.remove(b.l); b.l.geometry.dispose(); this.bolts.splice(i, 1); }
    }
    for (const c of this.cards) { c.rotation.y += dt * 1.6; c.position.y += Math.sin(performance.now() * 0.002 + c.position.x) * 0.002; }
  }
}
