// Menus: title screen, pause menu (map, missions, inventory, character,
// settings, saves, controls), shops, wardrobe/character creator, death screens.
import { ITEMS, SHOPS } from '../gameplay/inventory.js';
import { SaveSystem, PRESETS, saveSettings } from '../core/save.js';
import { fmtMoney, fmtTime, clamp } from '../core/utils.js';
import { SKIN_TONES, HAIR_COLORS, HAIR_STYLES, TOP_STYLES, LEG_STYLES, HATS, CLOTH_COLORS } from '../entities/humanoid.js';
import { WEATHERS } from '../world/environment.js';
import { DISTRICT_NAMES, districtAt } from '../world/layout.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const CONTROLS = [
  ['On foot', [['W A S D', 'Move'], ['Mouse', 'Look around'], ['Shift', 'Sprint (uses stamina)'], ['Caps Lock / Z', 'Toggle walk'], ['C', 'Crouch'], ['Space', 'Jump'], ['E', 'Interact / open doors / shops'], ['F', 'Enter / exit vehicle'], ['LMB', 'Punch (3rd hit = kick) / fire stun gun'], ['RMB', 'Guard (unarmed) / aim (stun gun)'], ['Q', 'Switch fists / stun gun'], ['V or wheel', 'Camera distance'], ['1–4', 'Quick-use items']]],
  ['Driving', [['W / S', 'Accelerate / brake & reverse'], ['A / D', 'Steer'], ['Space', 'Handbrake (drift)'], ['H', 'Horn'], ['L', 'Headlights'], ['N', 'Radio on/off'], ['F', 'Exit vehicle (bail out at speed)']]],
  ['Menus', [['Esc / P', 'Pause menu'], ['M', 'Map'], ['Tab / I', 'Inventory'], ['J', 'Mission log'], ['Enter', 'Skip dialogue line']]],
];

export class UI {
  constructor(game) {
    this.g = game; this.open = null; this.mapView = { cx: 0, cz: -100, zoom: 0.5 };
    this.bindStatic();
  }
  get anyOpen() { return !!this.open; }
  sfx(kind = 'click') { this.g.audio[kind] && this.g.audio[kind](); }
  bindStatic() {
    document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.sfx(); this.pauseTab(b.dataset.tab); }));
    $('btnResume').addEventListener('click', () => this.closeAll());
    document.addEventListener('mouseover', (e) => { if (e.target.closest && e.target.closest('button')) this.sfx('hover'); });
    const mc = $('fullmap');
    let drag = null;
    mc.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: this.mapView.cx, cz: this.mapView.cz, moved: false }; });
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      const k = (mc.width / mc.clientWidth) / (2 * this.mapView.zoom);
      this.mapView.cx = drag.cx - dx * k; this.mapView.cz = drag.cz - dy * k;
    });
    window.addEventListener('mouseup', (e) => {
      if (drag && !drag.moved && e.target === mc) {
        const r = mc.getBoundingClientRect(), sx = (e.clientX - r.left) * (mc.width / r.width), sy = (e.clientY - r.top) * (mc.height / r.height);
        const wx = this.mapView.cx + (sx - mc.width / 2) / (2 * this.mapView.zoom), wz = this.mapView.cz + (sy - mc.height / 2) / (2 * this.mapView.zoom);
        if (e.button === 2) this.g.hud.waypoint = null; else { this.g.setWaypoint(wx, wz); }
        this.sfx();
      }
      drag = null;
    });
    mc.addEventListener('contextmenu', (e) => { e.preventDefault(); this.g.hud.waypoint = null; });
    mc.addEventListener('wheel', (e) => { e.preventDefault(); this.mapView.zoom = clamp(this.mapView.zoom * (e.deltaY > 0 ? 0.85 : 1.18), 0.2, 3); }, { passive: false });
  }

  // ------------------------------------------------------------ title
  showTitle() {
    this.open = 'title';
    const t = $('title'); t.classList.add('show');
    const latest = SaveSystem.latest();
    const m = $('titleMenu');
    m.innerHTML = '';
    const btn = (label, fn, cls = '') => { const b = document.createElement('button'); b.className = 'tbtn ' + cls; b.innerHTML = label; b.onclick = () => { this.g.audio.init(); this.sfx(); fn(); }; m.appendChild(b); return b; };
    if (latest) btn(`Continue <small>${this.saveLabel(latest.data)}</small>`, () => this.g.loadGame(latest.slot), 'primary');
    btn('New Game', () => this.startCreator(), latest ? '' : 'primary');
    btn('Load Game', () => this.titleSub('load'));
    btn('Settings', () => this.titleSub('settings'));
    btn('Controls', () => this.titleSub('controls'));
    $('titleSub').innerHTML = '';
  }
  titleSub(kind) {
    const s = $('titleSub');
    s.innerHTML = `<div class="panel glass"><div class="ph"><h3>${{ load: 'Load Game', settings: 'Settings', controls: 'Controls' }[kind]}</h3><button class="x" id="tsClose">✕</button></div><div id="tsBody" class="pbody"></div></div>`;
    $('tsClose').onclick = () => { this.sfx(); s.innerHTML = ''; };
    const body = $('tsBody');
    if (kind === 'load') this.renderSaves(body, false);
    if (kind === 'settings') this.renderSettings(body);
    if (kind === 'controls') this.renderControls(body);
  }
  hideTitle() { $('title').classList.remove('show'); if (this.open === 'title') this.open = null; }
  startCreator() {
    this.hideTitle();
    this.g.newGame();
    this.openWardrobe(false, true);
  }
  saveLabel(d) {
    const pct = Math.round(((d.missions?.completed || []).filter((x) => /^m\d/.test(x)).length / 4) * 100);
    return `${new Date(d.savedAt).toLocaleString()} · ${pct}% · ${fmtMoney(d.inventory?.money || 0)}`;
  }

  // ------------------------------------------------------------ pause
  openPause(tab = 'map') {
    if (this.open && this.open !== 'pause') return;
    this.open = 'pause'; this.g.setPaused(true);
    $('pause').classList.add('show');
    $('pauseStats').innerHTML = `<span>${this.g.env.clock}</span><span>Day ${this.g.env.day}</span><span>${fmtMoney(this.g.inventory.money)}</span>`;
    this.pauseTab(tab);
  }
  pauseTab(tab) {
    this.tab = tab;
    document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tabpage').forEach((p) => p.classList.toggle('show', p.id === 'tab-' + tab));
    const g = this.g;
    if (tab === 'map') { this.mapView.cx = g.player.position.x; this.mapView.cz = g.player.position.z; this.mapView.zoom = 0.55; this.drawMap(); }
    if (tab === 'missions') this.renderMissions($('tab-missions'));
    if (tab === 'inventory') this.renderInventory($('tab-inventory'));
    if (tab === 'character') this.renderCharacter($('tab-character'));
    if (tab === 'settings') this.renderSettings($('tab-settings'));
    if (tab === 'game') this.renderGameTab($('tab-game'));
  }
  drawMap() {
    if (this.open !== 'pause' || this.tab !== 'map') return;
    const c = $('fullmap');
    const r = c.getBoundingClientRect();
    if (c.width !== Math.round(r.width) || c.height !== Math.round(r.height)) { c.width = Math.round(r.width); c.height = Math.round(r.height); }
    this.g.hud.drawFullMap(c, this.mapView);
    requestAnimationFrame(() => this.drawMap());
  }
  closeAll() {
    for (const id of ['pause', 'shop', 'wardrobe']) $(id).classList.remove('show');
    if (this.open === 'wardrobe' && this.wardrobeState && !this.wardrobeState.committed) this.g.player.setAppearance(this.wardrobeState.orig);
    this.open = null; this.g.setPaused(false); this.g.cam.portraitMode = false;
    this.g.input.requestLock();
    setTimeout(() => { if (!this.g.input.locked && this.g.mode === 'play' && !this.open) document.getElementById('clickToPlay').classList.add('show'); }, 400);
  }
  renderMissions(el) {
    const M = this.g.missions;
    const story = M.defs.filter((d) => d.story), side = M.defs.filter((d) => !d.story);
    const row = (d) => {
      const done = M.isDone(d.id), avail = d.available();
      const status = M.active && M.active.def === d ? '<b class="live">IN PROGRESS</b>' : done && !d.repeat ? '<b class="ok">COMPLETE</b>' : avail ? '<b class="av">AVAILABLE</b>' : '<b class="lk">LOCKED</b>';
      const rec = d.id === 'sprint' && M.records.sprint ? ` · Best ${fmtTime(M.records.sprint)}` : '';
      return `<div class="mrow ${avail ? '' : 'locked'}"><div><div class="mt">${d.title}</div><div class="md">${d.desc}${rec}</div></div><div class="ms">${status}${d.reward ? `<span>${fmtMoney(d.reward)}</span>` : ''}${avail && !M.active && (!done || d.repeat) ? `<button class="sbtn" data-wp="${d.id}">Set waypoint</button>` : ''}</div></div>`;
    };
    const pct = Math.round((story.filter((d) => M.isDone(d.id)).length / story.length) * 100);
    el.innerHTML = `<div class="cols"><div><h4>Story — ${pct}%</h4>${story.map(row).join('')}</div><div><h4>Side activities</h4>${side.map(row).join('')}
      <div class="mrow"><div><div class="mt">Solara Postcards</div><div class="md">Collectible cards hidden around the city, the hills and the pier. $100 each.</div></div><div class="ms"><b class="av">${M.postcards.size}/${M.totalPostcards()}</b></div></div>
      <div class="mrow"><div><div class="mt">Street events</div><div class="md">Purse snatchers appear around town. Knock them over to return the purse.</div></div></div>
      ${M.active ? '<button class="sbtn danger" id="abandon">Abandon current mission</button>' : ''}</div></div>`;
    el.querySelectorAll('[data-wp]').forEach((b) => (b.onclick = () => { const d = M.defs.find((x) => x.id === b.dataset.wp); this.g.setWaypoint(d.startPos.x, d.startPos.z); this.g.hud.notify(`Waypoint set: ${d.title}`, 2); this.sfx(); }));
    const ab = el.querySelector('#abandon'); if (ab) ab.onclick = () => { M.cancel(); this.renderMissions(el); };
  }
  renderInventory(el) {
    const g = this.g, inv = g.inventory;
    const items = inv.list();
    el.innerHTML = `<div class="invhead"><div class="big">${fmtMoney(inv.money)}</div><div class="dim">Cash</div></div>
      <div class="grid">${items.map((it) => `<div class="card"><div class="ic">${it.icon}</div><div class="nm">${it.name}${it.n > 1 ? ` <b>×${it.n}</b>` : ''}</div><div class="ds">${it.desc}</div>${it.use ? `<button class="sbtn" data-use="${it.id}">Use</button>` : it.id === 'stungun' ? `<button class="sbtn" data-eq="1">${g.player.weapon === 'stun' ? 'Unequip' : 'Equip'}</button>` : ''}</div>`).join('') || '<div class="dim">Your pockets are empty.</div>'}</div>
      <div class="dim small">Quick-use: 1 Snack/Ramen · 2 Energy/Coffee/Tea · 3 First-Aid · 4 Repair Kit</div>`;
    el.querySelectorAll('[data-use]').forEach((b) => (b.onclick = () => { g.useItem(b.dataset.use); this.renderInventory(el); }));
    el.querySelectorAll('[data-eq]').forEach((b) => (b.onclick = () => { g.player.cycleWeapon(); this.renderInventory(el); }));
  }
  renderCharacter(el) {
    const g = this.g, p = g.player, M = g.missions;
    const stats = g.stats;
    el.innerHTML = `<div class="cols"><div>
      <h4>Kai — status</h4>
      <div class="stat"><span>Health</span><div class="sb"><i style="width:${p.health}%" class="hp"></i></div><b>${Math.round(p.health)}</b></div>
      <div class="stat"><span>Stamina</span><div class="sb"><i style="width:${p.stamina}%" class="st"></i></div><b>${Math.round(p.stamina)}</b></div>
      <div class="stat"><span>Wanted</span><b>${'★'.repeat(g.police.stars) || 'None'}</b></div>
      <div class="stat"><span>Location</span><b>${(g.indoorZone && g.indoorZone.name) || DISTRICT_NAMES[districtAt(p.position.x, p.position.z)]}</b></div>
      <div class="stat"><span>Vehicle</span><b>${p.vehicle ? p.vehicle.spec.name : 'On foot'}</b></div>
      <div class="stat"><span>Buffs</span><b>${g.buffs.energy > 0 ? `⚡ Energy ${Math.ceil(g.buffs.energy)}s` : '—'}</b></div>
      </div><div><h4>Career</h4>
      <div class="stat"><span>Story progress</span><b>${Math.round((M.story.filter((d) => M.isDone(d.id)).length / 4) * 100)}%</b></div>
      <div class="stat"><span>Distance walked</span><b>${(stats.walked / 1000).toFixed(2)} km</b></div>
      <div class="stat"><span>Distance driven</span><b>${(stats.driven / 1000).toFixed(2)} km</b></div>
      <div class="stat"><span>Top speed</span><b>${Math.round(stats.topSpeed * 3.6)} km/h</b></div>
      <div class="stat"><span>Takedowns</span><b>${stats.takedowns}</b></div>
      <div class="stat"><span>Times busted / knocked out</span><b>${stats.busted} / ${stats.ko}</b></div>
      <div class="stat"><span>Postcards</span><b>${M.postcards.size}/${M.totalPostcards()}</b></div>
      <div class="dim small">Change your look at home (wardrobe) or buy new clothes at Thread & Co. on Bayview Avenue.</div>
      </div></div>`;
  }
  renderGameTab(el) {
    el.innerHTML = `<div class="cols"><div><h4>Save game</h4><div id="saveSlots"></div></div><div><h4>Controls</h4><div id="ctrl"></div><div class="row gap"><button class="sbtn danger" id="toTitle">Quit to title</button></div></div></div>`;
    this.renderSaves($('saveSlots'), true);
    this.renderControls($('ctrl'));
    $('toTitle').onclick = () => { this.sfx(); this.closeAll(); this.g.toTitle(); };
  }
  renderSaves(el, canSave) {
    const draw = () => {
      el.innerHTML = SaveSystem.slots.map((s) => {
        const d = SaveSystem.read(s);
        return `<div class="slot"><div><div class="mt">${s === 'auto' ? 'Autosave' : 'Slot ' + s}</div><div class="md">${d ? this.saveLabel(d) + ' · ' + (d.location || '') : 'Empty'}</div></div><div class="row">${canSave && s !== 'auto' ? `<button class="sbtn" data-save="${s}">Save</button>` : ''}${d ? `<button class="sbtn" data-load="${s}">Load</button>` : ''}${d && s !== 'auto' ? `<button class="sbtn ghost" data-del="${s}">Delete</button>` : ''}</div></div>`;
      }).join('');
      el.querySelectorAll('[data-save]').forEach((b) => (b.onclick = () => { this.g.saveGame(b.dataset.save); this.sfx('pickup'); draw(); }));
      el.querySelectorAll('[data-load]').forEach((b) => (b.onclick = () => { this.sfx(); $('titleSub').innerHTML = ''; this.closeAll(); this.hideTitle(); this.g.loadGame(b.dataset.load); }));
      el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { SaveSystem.remove(b.dataset.del); draw(); }));
    };
    draw();
  }
  renderControls(el) {
    el.innerHTML = CONTROLS.map(([h, rows]) => `<h5>${h}</h5>${rows.map(([k, v]) => `<div class="krow"><kbd>${k}</kbd><span>${v}</span></div>`).join('')}`).join('');
  }
  renderSettings(el) {
    const g = this.g, S = g.settings;
    const sel = (key, label, opts) => `<label class="set"><span>${label}</span><select data-k="${key}">${opts.map(([v, l]) => `<option value="${v}" ${String(S[key]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    const rng = (key, label, min, max, step, fmt = (v) => v) => `<label class="set"><span>${label}</span><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${S[key]}"><em>${fmt(S[key])}</em></label>`;
    const chk = (key, label) => `<label class="set"><span>${label}</span><input type="checkbox" data-k="${key}" ${S[key] ? 'checked' : ''}></label>`;
    el.innerHTML = `<div class="cols three"><div><h4>Graphics</h4>
      ${sel('preset', 'Quality preset', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra'], ['custom', 'Custom']])}
      ${rng('resScale', 'Resolution scale', 0.5, 1, 0.05, (v) => Math.round(v * 100) + '%')}
      ${sel('shadows', 'Shadows', [['off', 'Off'], ['low', 'Low'], ['high', 'High'], ['ultra', 'Ultra']])}
      ${sel('reflections', 'Wet-street reflections', [['off', 'Off'], ['half', 'Half res'], ['full', 'Full']])}
      ${chk('bloom', 'Bloom / glow')}${chk('aa', 'Anti-aliasing (MSAA)')}
      ${rng('viewDistance', 'View distance', 0.5, 1.6, 0.1, (v) => Math.round(v * 100) + '%')}
      ${rng('traffic', 'Traffic density', 0, 40, 1)}${rng('peds', 'Pedestrian density', 0, 60, 1)}
      ${chk('fps', 'Show FPS')}
      </div><div><h4>Controls & camera</h4>
      ${rng('sens', 'Mouse sensitivity', 0.2, 3, 0.05, (v) => (+v).toFixed(2))}${chk('invertY', 'Invert Y axis')}
      ${rng('fov', 'Field of view', 50, 85, 1, (v) => v + '°')}${chk('shake', 'Camera shake')}
      <h4>Audio</h4>
      ${rng('master', 'Master volume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')}${rng('sfx', 'Effects', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')}
      ${rng('music', 'Car radio', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')}${rng('ambient', 'City ambience', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')}
      </div><div><h4>Gameplay</h4>
      ${sel('timeScale', 'Day length', [['0', 'Frozen time'], ['0.5', '48 min'], ['1', '24 min'], ['2', '12 min'], ['6', '4 min']])}
      ${sel('weather', 'Weather', [['dynamic', 'Dynamic'], ...Object.entries(WEATHERS).map(([k, w]) => [k, 'Always ' + w.label.toLowerCase()])])}
      ${chk('hud', 'Show HUD')}${chk('subtitles', 'Subtitles')}
      <div class="dim small">Settings are saved automatically.</div>
      <button class="sbtn ghost" id="resetSet">Reset to defaults</button>
      </div></div>`;
    el.querySelectorAll('[data-k]').forEach((inp) => {
      const ev = inp.type === 'range' ? 'input' : 'change';
      inp.addEventListener(ev, () => {
        const k = inp.dataset.k;
        let v = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? parseFloat(inp.value) : inp.value;
        if (k === 'timeScale') v = parseFloat(v);
        S[k] = v;
        if (k === 'preset' && PRESETS[v]) Object.assign(S, PRESETS[v]);
        else if (['resScale', 'shadows', 'reflections', 'bloom', 'aa', 'viewDistance', 'traffic', 'peds'].includes(k)) S.preset = 'custom';
        if (inp.nextElementSibling && inp.nextElementSibling.tagName === 'EM') inp.nextElementSibling.textContent = inp.parentElement.innerHTML && (k === 'sens' ? (+v).toFixed(2) : ['resScale', 'viewDistance', 'master', 'sfx', 'music', 'ambient'].includes(k) ? Math.round(v * 100) + '%' : k === 'fov' ? v + '°' : v);
        g.applySettings(); saveSettings(S);
        if (k === 'preset') this.renderSettings(el);
      });
    });
    el.querySelector('#resetSet').onclick = () => { g.resetSettings(); this.renderSettings(el); };
  }

  // ------------------------------------------------------------ shop
  openShop(id) {
    const g = this.g, shop = SHOPS[id];
    this.open = 'shop'; g.setPaused(true);
    const el = $('shop'); el.classList.add('show');
    const draw = () => {
      el.innerHTML = `<div class="panel glass shoppanel"><div class="ph"><h3>${shop.name}</h3><div class="cash">${fmtMoney(g.inventory.money)}</div><button class="x" id="shopClose">✕</button></div>
        <div class="pbody shopgrid">${shop.items.map((k) => { const it = ITEMS[k]; const owned = g.inventory.count(k); const dis = (it.unique && owned) || !g.inventory.canAfford(it.price); return `<div class="card"><div class="ic">${it.icon}</div><div class="nm">${it.name}</div><div class="ds">${it.desc}</div><div class="row"><b class="price">${fmtMoney(it.price)}</b>${owned ? `<span class="dim">Owned ${it.unique ? '' : owned}</span>` : ''}<button class="sbtn" data-buy="${k}" ${dis ? 'disabled' : ''}>${it.unique && owned ? 'Owned' : 'Buy'}</button></div></div>`; }).join('')}</div>
        <div class="dim small center">Esc to close</div></div>`;
      el.querySelector('#shopClose').onclick = () => this.closeAll();
      el.querySelectorAll('[data-buy]').forEach((b) => (b.onclick = () => { g.buy(b.dataset.buy); draw(); }));
    };
    draw();
  }

  // ------------------------------------------------------------ wardrobe / character creator
  openWardrobe(paid, creator = false) {
    const g = this.g, p = g.player;
    this.open = 'wardrobe'; g.setPaused(!creator ? true : false); g.cam.portraitMode = true;
    const orig = { ...p.h.appearance };
    const cur = { ...orig };
    this.wardrobeState = { orig, cur, committed: false };
    const el = $('wardrobe'); el.classList.add('show');
    const price = () => {
      if (!paid) return 0;
      let n = 0; for (const k of ['hair', 'hairColor', 'top', 'topColor', 'innerColor', 'legs', 'legColor', 'shoeColor', 'hat', 'hatColor', 'glasses']) if (cur[k] !== orig[k]) n++;
      return n * 45;
    };
    const swatches = (key, colors) => `<div class="sw">${colors.map((c) => `<button class="swc ${cur[key] === c ? 'on' : ''}" data-k="${key}" data-v="${c}" style="background:${hex(c)}"></button>`).join('')}</div>`;
    const choice = (key, opts, labels) => `<div class="ch">${opts.map((o, i) => `<button class="chb ${cur[key] === o ? 'on' : ''}" data-k="${key}" data-s="${o}">${labels ? labels[i] : o}</button>`).join('')}</div>`;
    const draw = () => {
      const cost = price();
      el.innerHTML = `<div class="panel glass wardrobe"><div class="ph"><h3>${creator ? 'Create your character' : paid ? 'Thread & Co.' : 'Wardrobe'}</h3>${paid ? `<div class="cash">${fmtMoney(g.inventory.money)}</div>` : ''}</div><div class="pbody">
        ${creator ? `<div class="grp"><span>Body</span>${choice('sex', ['m', 'f'], ['Masculine', 'Feminine'])}</div><div class="grp"><span>Skin tone</span>${swatches('skin', SKIN_TONES)}</div>` : ''}
        <div class="grp"><span>Hair</span>${choice('hair', HAIR_STYLES)}${swatches('hairColor', HAIR_COLORS)}</div>
        <div class="grp"><span>Top</span>${choice('top', TOP_STYLES, ['T-shirt', 'Long sleeve', 'Jacket', 'Hoodie', 'Tank'])}${swatches('topColor', CLOTH_COLORS)}${cur.top === 'jacket' ? `<span class="sub">Shirt underneath</span>${swatches('innerColor', CLOTH_COLORS)}` : ''}</div>
        <div class="grp"><span>Bottoms</span>${choice('legs', LEG_STYLES, ['Pants', 'Shorts', 'Skirt'])}${swatches('legColor', CLOTH_COLORS)}</div>
        <div class="grp"><span>Shoes</span>${swatches('shoeColor', CLOTH_COLORS)}</div>
        <div class="grp"><span>Headwear</span>${choice('hat', HATS, ['None', 'Cap', 'Beanie'])}${cur.hat !== 'none' ? swatches('hatColor', CLOTH_COLORS) : ''}</div>
        <div class="grp"><span>Glasses</span>${choice('glasses', [false, true], ['No', 'Yes'])}</div>
        ${creator ? `<div class="grp"><span>Height</span><input type="range" min="0.92" max="1.08" step="0.01" value="${cur.height}" data-r="height"></div><div class="grp"><span>Build</span><input type="range" min="0.85" max="1.2" step="0.01" value="${cur.build}" data-r="build"></div>` : ''}
        </div><div class="pfoot">${paid ? `<span class="price">${cost ? fmtMoney(cost) : 'No changes'}</span>` : ''}
        <button class="sbtn ghost" id="wdCancel">${creator ? 'Randomize' : 'Cancel'}</button><button class="sbtn primary" id="wdOk" ${paid && cost > g.inventory.money ? 'disabled' : ''}>${creator ? 'Start game' : paid ? 'Buy outfit' : 'Done'}</button></div></div>`;
      el.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { cur[b.dataset.k] = parseInt(b.dataset.v, 10); apply(); }));
      el.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { const v = b.dataset.s; cur[b.dataset.k] = v === 'true' ? true : v === 'false' ? false : v; apply(); }));
      el.querySelectorAll('[data-r]').forEach((r) => (r.oninput = () => { cur[r.dataset.r] = parseFloat(r.value); p.setAppearance(cur); }));
      $('wdCancel').onclick = () => {
        this.sfx();
        if (creator) { const pick = (a) => a[Math.floor(Math.random() * a.length)]; Object.assign(cur, { skin: pick(SKIN_TONES), hair: pick(HAIR_STYLES), hairColor: pick(HAIR_COLORS), top: pick(TOP_STYLES), topColor: pick(CLOTH_COLORS), legColor: pick(CLOTH_COLORS), shoeColor: pick(CLOTH_COLORS) }); apply(); }
        else { p.setAppearance(orig); this.closeAll(); }
      };
      $('wdOk').onclick = () => {
        const cost = price();
        if (paid && cost && !g.inventory.spend(cost)) return;
        if (paid && cost) g.audio.cash();
        this.wardrobeState.committed = true; this.sfx('pickup');
        this.closeAll();
        if (creator) g.beginStory();
        else g.hud.notify(paid ? 'New outfit purchased.' : 'Outfit changed.', 2);
      };
    };
    const apply = () => { this.sfx(); p.setAppearance(cur); draw(); };
    draw();
  }

  // ------------------------------------------------------------ overlays
  deathScreen(kind, text) {
    const el = $('overlay');
    el.innerHTML = `<div class="ovt ${kind}">${kind === 'busted' ? 'BUSTED' : 'KNOCKED OUT'}</div><div class="ovs">${text}</div>`;
    el.className = 'show ' + kind;
    setTimeout(() => (el.className = ''), 4200);
  }
}
