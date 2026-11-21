// Minimal AAA-style HUD: rotating minimap with GPS route and blips, health /
// stamina bars, money, wanted level, clock & weather, mission tracker,
// objectives, subtitles, notifications, prompts, speech bubbles and banners.
import * as THREE from 'three';
import { WORLD, LINES, terrainHeight, hillRoadX, HILL_ROAD, districtAt, DISTRICT_NAMES, POI } from '../world/layout.js';
import { fmtMoney, fmtTime, clamp } from '../core/utils.js';
import { WEATHERS } from '../world/environment.js';

const $ = (id) => document.getElementById(id);
const MAP_S = 2; // px per meter in the base map

export function buildMapImage(world) {
  const W = (WORLD.maxX - WORLD.minX) * MAP_S, H = (WORLD.maxZ - WORLD.minZ) * MAP_S;
  const c = document.createElement('canvas'); c.width = W / 2; c.height = H / 2; // terrain at half res
  const x = c.getContext('2d');
  const img = x.createImageData(c.width, c.height), d = img.data;
  for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) {
    const wx = WORLD.minX + (i * 2) / MAP_S, wz = WORLD.minZ + (j * 2) / MAP_S;
    const h = terrainHeight(wx, wz);
    let r = 52, gg = 64, b = 46;
    if (wz > 290) { r = 150; gg = 138; b = 108; }
    if (h < -0.6) { r = 28; gg = 52; b = 72; }
    const shade = clamp(1 + (h > 1 ? h / 120 : 0), 0.8, 1.4);
    const k = (j * c.width + i) * 4; d[k] = r * shade; d[k + 1] = gg * shade; d[k + 2] = b * shade; d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const full = document.createElement('canvas'); full.width = W; full.height = H;
  const f = full.getContext('2d');
  f.imageSmoothingEnabled = true; f.drawImage(c, 0, 0, W, H);
  const P = (wx, wz) => [(wx - WORLD.minX) * MAP_S, (wz - WORLD.minZ) * MAP_S];
  // city ground
  const [cx0, cz0] = P(-288, -288); f.fillStyle = '#3d4248'; f.fillRect(cx0, cz0, 576 * MAP_S, 580 * MAP_S);
  // block pads
  for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) { const [a, b] = P(LINES[i] + 7, LINES[j] + 7); f.fillStyle = '#585e66'; f.fillRect(a, b, 76 * MAP_S, 76 * MAP_S); }
  const colors = { building: '#7b828c', tower: '#8d95a0', park: '#4f7a45', plaza: '#6f6a62', parking: '#4b5058', water: '#2c5a78', sea: '#1d4058', pier: '#8a7458' };
  const rects = [...world.mapRects].sort((a, b) => (a.type === 'park' || a.type === 'plaza' || a.type === 'parking' ? -1 : 0) - (b.type === 'park' || b.type === 'plaza' || b.type === 'parking' ? -1 : 0));
  for (const r of rects) {
    if (r.type === 'sea') continue;
    const [a, b] = P(r.x0, r.z0), w = (r.x1 - r.x0) * MAP_S, h = (r.z1 - r.z0) * MAP_S;
    f.fillStyle = colors[r.type] || '#777';
    if (r.round) { f.beginPath(); f.ellipse(a + w / 2, b + h / 2, w / 2, h / 2, 0, 0, 7); f.fill(); } else f.fillRect(a, b, w, h);
    if (r.type === 'building' || r.type === 'tower') { f.strokeStyle = 'rgba(0,0,0,0.25)'; f.lineWidth = 1; f.strokeRect(a, b, w, h); }
  }
  // roads on top
  f.fillStyle = '#c9ccd1';
  for (const l of LINES) { const [a, b] = P(-277, l - 7); f.fillRect(a, b, 554 * MAP_S, 14 * MAP_S); const [c2, d2] = P(l - 7, -277); f.fillRect(c2, d2, 14 * MAP_S, 554 * MAP_S); }
  // hill road
  f.strokeStyle = '#c9ccd1'; f.lineWidth = HILL_ROAD.width * MAP_S; f.lineCap = 'round'; f.beginPath();
  for (let z = HILL_ROAD.z0; z >= HILL_ROAD.z1; z -= 4) { const [a, b] = P(hillRoadX(z), z); if (z === HILL_ROAD.z0) f.moveTo(a, b); else f.lineTo(a, b); }
  f.stroke();
  // labels
  f.fillStyle = 'rgba(255,255,255,0.55)'; f.font = `600 ${11 * MAP_S}px "Barlow Condensed", Arial`; f.textAlign = 'center';
  const lab = [['LANTERN ROW', -180, -205], ['DOWNTOWN', 0, -140], ['BAYVIEW AVE', -60, -45], ['GREENWAY PARK', -45, 92], ['PALM GROVE', 190, 140], ['OCEAN DRIVE', 0, 300], ['MIRADOR HEIGHTS', 0, -610], ['OLD HARBOR FLATS', 225, -230], ['SOLARA BAY', 0, 400]];
  for (const [t, wx, wz] of lab) { const [a, b] = P(wx, wz); f.fillText(t, a, b); }
  return full;
}

export class HUD {
  constructor(game) {
    this.g = game;
    this.mini = $('minimap'); this.mctx = this.mini.getContext('2d');
    this.notifyQ = []; this.route = null; this.routeTarget = null; this.waypoint = null;
    this.bubbles = new Map();
    this.areaName = ''; this.areaT = 0; this.objT = 0; this.lastMoney = null; this.moneyAnim = null;
    this.hidden = false;
  }
  init() {
    this.mapImg = buildMapImage(this.g.world);
  }
  hide(v) { this.hidden = v; $('hud').classList.toggle('hidden', v || !this.g.settings.hud); }
  // ------------------------------------------------------------ text elements
  notify(html, dur = 3) {
    const box = $('notify');
    const el = document.createElement('div'); el.className = 'note'; el.innerHTML = html;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, dur * 1000);
    while (box.children.length > 4) box.firstChild.remove();
  }
  objective(text, tracker = text) {
    const el = $('objective');
    if (text) { el.innerHTML = text; el.classList.add('show'); this.objT = 7; } else el.classList.remove('show');
    const a = this.g.missions.active;
    const tr = $('tracker');
    if (a || tracker) {
      tr.classList.add('show');
      $('trTitle').textContent = a ? a.def.title : (this.g.missions.event ? 'Street event' : '');
      $('trObj').innerHTML = tracker || '';
    } else tr.classList.remove('show');
    if (!tracker && !a) tr.classList.remove('show');
  }
  trackDistance(d) { $('trDist').textContent = d > 5 ? (d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m') : ''; }
  timer(sec, up = false) {
    const el = $('trTimer');
    if (sec == null) { el.textContent = ''; el.className = ''; return; }
    el.textContent = fmtTime(sec); el.className = !up && sec < 15 ? 'urgent' : '';
  }
  subtitle(speaker, text) {
    const el = $('subtitle');
    if (!speaker || !this.g.settings.subtitles) { el.classList.remove('show'); return; }
    el.innerHTML = `<span class="spk">${speaker}:</span> ${text}`; el.classList.add('show');
  }
  prompt(text) {
    const el = $('prompt');
    if (!text) { el.classList.remove('show'); return; }
    if (el.dataset.t !== text) { el.innerHTML = text; el.dataset.t = text; }
    el.classList.add('show');
  }
  missionTitle(title, kind) { this.banner(`<div class="bk">${kind}</div><div class="bt">${title}</div>`, 3.2, 'start'); }
  missionPassed(head, title, reward, sub = '') { this.banner(`<div class="bh">${head}</div><div class="bt">${title}</div>${reward ? `<div class="br">+${fmtMoney(reward)}</div>` : ''}${sub ? `<div class="bk">${sub}</div>` : ''}`, 5, 'pass'); }
  missionFailed(title, reason) { this.banner(`<div class="bh fail">MISSION FAILED</div><div class="bt">${title}</div><div class="bk">${reason}</div>`, 4.5, 'fail'); }
  banner(html, dur, kind) {
    const el = $('banner'); el.innerHTML = html; el.className = 'show ' + kind;
    clearTimeout(this._bt); this._bt = setTimeout(() => (el.className = ''), dur * 1000);
  }
  credits() {
    const el = $('credits'); el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 9000);
  }
  flashStars() { const el = $('stars'); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  hurt() { const el = $('hurt'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
  bubble(npc, text, dur) {
    let b = this.bubbles.get(npc);
    if (!b) { const el = document.createElement('div'); el.className = 'bubble'; $('bubbles').appendChild(el); b = { el }; this.bubbles.set(npc, b); }
    b.el.textContent = text; b.t = dur; b.el.classList.add('show');
  }
  setRoute(target) { this.routeTarget = target ? target.clone() : null; this._routeT = 0; }

  // ------------------------------------------------------------ per-frame
  update(dt) {
    const g = this.g, p = g.player, env = g.env;
    if (this.objT > 0) { this.objT -= dt; if (this.objT <= 0) $('objective').classList.remove('show'); }
    // bars
    $('hpFill').style.width = (p.health / p.maxHealth) * 100 + '%';
    $('hpFill').classList.toggle('low', p.health < 30);
    $('stFill').style.width = p.stamina + '%';
    $('stFill').classList.toggle('ex', !!p.exhausted);
    // money (counts up)
    const m = g.inventory.money;
    if (this.lastMoney === null) this.lastMoney = m;
    if (m !== this.lastMoney) {
      const diff = m - this.lastMoney;
      const d = $('moneyDelta'); d.textContent = (diff > 0 ? '+' : '−') + fmtMoney(Math.abs(diff)); d.className = 'show ' + (diff > 0 ? 'pos' : 'neg');
      clearTimeout(this._md); this._md = setTimeout(() => (d.className = ''), 2200);
      this.lastMoney = m;
    }
    $('money').textContent = fmtMoney(m);
    // stars
    const stars = g.police.stars;
    $('stars').innerHTML = stars ? Array.from({ length: 5 }, (_, i) => `<span class="${i < stars ? 'on' : ''} ${g.police.seen ? '' : 'blink'}">★</span>`).join('') : '';
    // clock/weather
    $('clock').textContent = env.clock;
    $('weather').textContent = WEATHERS[env.weather].icon + ' ' + WEATHERS[env.weather].label;
    // weapon
    const wpn = $('weapon');
    if (p.weapon === 'stun') { wpn.innerHTML = `<span>⚡ STUN</span><b>${g.inventory.count('charges')}</b>`; wpn.classList.add('show'); }
    else wpn.classList.remove('show');
    $('crosshair').classList.toggle('show', p.aiming);
    // vehicle hud
    const vh = $('vehud');
    if (p.vehicle) {
      const v = p.vehicle;
      vh.classList.add('show');
      $('spd').textContent = Math.round(Math.abs(v.forwardSpeed) * 3.6);
      $('gear').textContent = v.gear || 'N';
      $('vname').textContent = v.spec.name;
      $('vhpFill').style.width = (v.health / 10) + '%';
      $('vhpFill').classList.toggle('low', v.health < 300);
      $('radio').textContent = g.audio.radioOn ? '♪ Solara FM — Lo-fi' : 'Radio off';
    } else vh.classList.remove('show');
    // district name
    const dn = DISTRICT_NAMES[districtAt(p.position.x, p.position.z)] || '';
    const zone = g.indoorZone ? g.indoorZone.name : dn;
    if (zone !== this.areaName) { this.areaName = zone; const el = $('area'); el.textContent = zone; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
    // bubbles
    const cam = g.camera, v3 = new THREE.Vector3();
    for (const [npc, b] of this.bubbles) {
      b.t -= dt;
      if (b.t <= 0 || npc.removed) { b.el.remove(); this.bubbles.delete(npc); continue; }
      v3.set(npc.pos.x, npc.pos.y + 2.15, npc.pos.z).project(cam);
      const vis = v3.z < 1 && Math.hypot(npc.pos.x - cam.position.x, npc.pos.z - cam.position.z) < 35;
      b.el.style.display = vis ? 'block' : 'none';
      if (vis) b.el.style.transform = `translate(${(v3.x * 0.5 + 0.5) * innerWidth}px, ${(-v3.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
    }
    // route recompute
    this._routeT = (this._routeT || 0) - dt;
    const tgt = this.routeTarget || this.waypoint;
    if (tgt && this._routeT <= 0) { this._routeT = 0.5; this.route = this.computeRoute(p.position, tgt); }
    if (!tgt) this.route = null;
    if (this.waypoint && Math.hypot(p.position.x - this.waypoint.x, p.position.z - this.waypoint.z) < 12) { this.waypoint = null; this.notify('Waypoint reached.', 1.5); }
    this.drawMinimap();
  }

  /** GPS: shortest path over the road grid (BFS on intersections) plus the hill road. */
  computeRoute(from, to) {
    const near = (v) => LINES.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
    const toGrid = (p) => {
      if (p.z < -280) return { x: 0, z: -270 };
      return { x: clamp(near(p.x), -270, 270), z: clamp(near(p.z), -270, 270) };
    };
    const a = toGrid(from), b = toGrid(to);
    const pts = [[from.x, from.z]];
    if (from.z < -285) for (let z = Math.max(HILL_ROAD.z1, Math.min(from.z, HILL_ROAD.z0)); z <= HILL_ROAD.z0; z += 15) pts.push([hillRoadX(z), z]);
    // Manhattan route along grid: x first then z (choose order that keeps the path on roads)
    pts.push([a.x, a.z]);
    if (a.x !== b.x || a.z !== b.z) {
      const viaX = [b.x, a.z], viaZ = [a.x, b.z];
      const fx = Math.abs(from.x - a.x) > Math.abs(from.z - a.z);
      pts.push(fx ? viaZ : viaX);
      pts.push([b.x, b.z]);
    }
    if (to.z < -285) for (let z = HILL_ROAD.z0; z >= Math.max(HILL_ROAD.z1, to.z); z -= 15) pts.push([hillRoadX(z), z]);
    pts.push([to.x, to.z]);
    return pts;
  }

  blips() {
    const g = this.g, list = [];
    for (const sp of g.missions.startPoints) list.push({ x: sp.def.startPos.x, z: sp.def.startPos.z, c: sp.def.story ? '#ffb02e' : '#5ad8ff', icon: sp.def.story ? '★' : '$', edge: sp.def.story });
    const a = g.missions.active;
    if (a) {
      if (a.marker && a.marker.grp.visible) list.push({ x: a.marker.grp.position.x, z: a.marker.grp.position.z, c: '#5ad8ff', icon: '●', edge: true, big: true });
      if (a.cpMarkers && a.cpMarkers[0]) list.push({ x: a.cpMarkers[0].grp.position.x, z: a.cpMarkers[0].grp.position.z, c: '#ffd23f', icon: '●', edge: true, big: true });
      if (a.enemies) for (const n of a.enemies) if (!n.removed && !n.defeated) list.push({ x: n.pos.x, z: n.pos.z, c: '#ff4a4a', icon: '●' });
    }
    if (g.missions.event && !g.missions.event.thief.removed) list.push({ x: g.missions.event.thief.pos.x, z: g.missions.event.thief.pos.z, c: '#ff4a4a', icon: '●', edge: true, big: true });
    for (const v of g.police.cars) list.push({ x: v.pos.x, z: v.pos.z, c: Math.sin(performance.now() * 0.01) > 0 ? '#ff3b3b' : '#3b7bff', icon: '■' });
    for (const c of g.police.cops) list.push({ x: c.pos.x, z: c.pos.z, c: '#3b7bff', icon: '•' });
    const st = [[POI.safehouse, '⌂', '#7dff9a'], [POI.quikmart, '🛒', '#fff'], [POI.clothing, '👕', '#fff'], [POI.noodle, '🍜', '#fff'], [POI.garage, '🔧', '#fff'], [POI.hospital, '✚', '#ff6b6b'], [POI.police, '⛨', '#6b9bff']];
    for (const [p, icon, c] of st) list.push({ x: p.x, z: p.z, c, icon, small: true });
    if (this.waypoint) list.push({ x: this.waypoint.x, z: this.waypoint.z, c: '#d070ff', icon: '◆', edge: true });
    return list;
  }

  drawMinimap() {
    const c = this.mini, x = this.mctx, g = this.g, p = g.player;
    const W = c.width, H = c.height;
    const fast = p.vehicle ? clamp(p.vehicle.speed / 40, 0, 1) : 0;
    const scale = (W / 260) * (1.05 - fast * 0.4); // px per meter
    const rot = g.cam.yaw + Math.PI;
    x.save();
    x.clearRect(0, 0, W, H);
    x.fillStyle = '#20262c'; x.fillRect(0, 0, W, H);
    x.translate(W / 2, H * 0.62);
    x.rotate(rot);
    x.scale(scale / MAP_S, scale / MAP_S);
    x.drawImage(this.mapImg, -(p.position.x - WORLD.minX) * MAP_S, -(p.position.z - WORLD.minZ) * MAP_S);
    x.restore();
    // route
    const toS = (wx, wz) => {
      const dx = (wx - p.position.x) * scale, dz = (wz - p.position.z) * scale;
      const cs = Math.cos(rot), sn = Math.sin(rot);
      return [W / 2 + dx * cs - dz * sn, H * 0.62 + dx * sn + dz * cs];
    };
    if (this.route) {
      x.save(); x.strokeStyle = this.routeTarget ? '#ffd23f' : '#d070ff'; x.lineWidth = 3.5; x.lineJoin = 'round'; x.globalAlpha = 0.9;
      x.beginPath(); this.route.forEach(([wx, wz], i) => { const [sx, sy] = toS(wx, wz); if (i) x.lineTo(sx, sy); else x.moveTo(sx, sy); }); x.stroke(); x.restore();
    }
    // blips
    x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const b of this.blips()) {
      let [sx, sy] = toS(b.x, b.z);
      const inside = sx > 8 && sx < W - 8 && sy > 8 && sy < H - 8;
      if (!inside) { if (!b.edge) continue; sx = clamp(sx, 9, W - 9); sy = clamp(sy, 9, H - 9); }
      if (b.small && (Math.abs(sx - W / 2) > W / 2 || Math.abs(sy - H / 2) > H / 2)) continue;
      x.font = b.big ? 'bold 16px sans-serif' : b.small ? '12px sans-serif' : 'bold 13px sans-serif';
      x.fillStyle = 'rgba(0,0,0,0.55)'; x.beginPath(); x.arc(sx, sy, b.big ? 8 : 7, 0, 7); x.fill();
      x.fillStyle = b.c; x.fillText(b.icon, sx, sy + 1);
    }
    // player arrow
    x.save(); x.translate(W / 2, H * 0.62); x.rotate(rot + Math.PI - p.heading);
    x.fillStyle = '#fff'; x.strokeStyle = '#111'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, -9); x.lineTo(6.5, 7); x.lineTo(0, 3.5); x.lineTo(-6.5, 7); x.closePath(); x.stroke(); x.fill();
    x.restore();
    // north indicator
    const [nx, ny] = toS(p.position.x, p.position.z - 1000);
    const k = Math.min(1, (W / 2 - 10) / Math.hypot(nx - W / 2, ny - H * 0.62));
    x.fillStyle = '#fff'; x.font = 'bold 11px sans-serif'; x.fillText('N', W / 2 + (nx - W / 2) * k, H * 0.62 + (ny - H * 0.62) * k);
    // heat flashing border
    if (g.police.stars) { x.strokeStyle = Math.sin(performance.now() * 0.012) > 0 ? '#ff3b3b' : '#3b7bff'; x.lineWidth = 5; x.strokeRect(0, 0, W, H); }
  }

  /** Full-screen map in the pause menu (pan/zoom/waypoint). */
  drawFullMap(canvas, view) {
    const x = canvas.getContext('2d'), W = canvas.width, H = canvas.height, g = this.g;
    x.fillStyle = '#1d4058'; x.fillRect(0, 0, W, H);
    x.save(); x.translate(W / 2, H / 2); x.scale(view.zoom, view.zoom);
    x.drawImage(this.mapImg, -(view.cx - WORLD.minX) * MAP_S, -(view.cz - WORLD.minZ) * MAP_S);
    x.restore();
    const toS = (wx, wz) => [W / 2 + (wx - view.cx) * MAP_S * view.zoom, H / 2 + (wz - view.cz) * MAP_S * view.zoom];
    if (this.route) {
      x.strokeStyle = this.routeTarget ? '#ffd23f' : '#d070ff'; x.lineWidth = 4; x.beginPath();
      this.route.forEach(([wx, wz], i) => { const [sx, sy] = toS(wx, wz); if (i) x.lineTo(sx, sy); else x.moveTo(sx, sy); }); x.stroke();
    }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const b of this.blips()) {
      const [sx, sy] = toS(b.x, b.z);
      x.fillStyle = 'rgba(0,0,0,0.6)'; x.beginPath(); x.arc(sx, sy, 11, 0, 7); x.fill();
      x.fillStyle = b.c; x.font = 'bold 15px sans-serif'; x.fillText(b.icon, sx, sy + 1);
    }
    const [px, py] = toS(g.player.position.x, g.player.position.z);
    x.save(); x.translate(px, py); x.rotate(-g.player.heading + Math.PI);
    x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, -12); x.lineTo(8, 9); x.lineTo(0, 4); x.lineTo(-8, 9); x.closePath(); x.stroke(); x.fill();
    x.restore();
    return toS;
  }
}
