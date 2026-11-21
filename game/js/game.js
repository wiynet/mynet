// Game orchestrator: renderer & post-processing, world construction, the main
// loop, gameplay services (damage, shops, saving) and settings.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { Input } from './core/input.js';
import { AudioSystem } from './core/audio.js';
import { CameraRig } from './core/camera.js';
import { SaveSystem, loadSettings, saveSettings, DEFAULT_SETTINGS } from './core/save.js';
import { clamp, lerp, fmtMoney } from './core/utils.js';
import { CollisionWorld } from './world/collision.js';
import { StaticBatcher } from './world/builder.js';
import { Tex, setAnisotropy } from './world/textures.js';
import { City } from './world/city.js';
import { Interiors, RESERVED } from './world/interiors.js';
import { Terrain } from './world/terrain.js';
import { Environment } from './world/environment.js';
import { POI, districtAt, VILLA } from './world/layout.js';
import { Particles } from './entities/particles.js';
import { Vehicle, collideVehicles, PAINTS } from './entities/vehicle.js';
import { Traffic, TrafficLights } from './entities/traffic.js';
import { Pedestrians, NPC } from './entities/peds.js';
import { Police } from './entities/police.js';
import { Player, DEFAULT_LOOK } from './entities/player.js';
import { Inventory, ITEMS } from './gameplay/inventory.js';
import { Missions, CONTACT_LOOKS } from './gameplay/missions.js';
import { Effects } from './gameplay/effects.js';
import { HUD } from './ui/hud.js';
import { UI } from './ui/menus.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.32 }, uGrain: { value: 0.018 }, uSat: { value: 1.06 }, uCA: { value: 0.0012 }, uHurt: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVig, uGrain, uSat, uCA, uHurt; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + d * uCA * r2 * 8.0).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - d * uCA * r2 * 8.0).b;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * 1.04 + 0.5;
      c *= 1.0 - uVig * smoothstep(0.12, 0.65, r2 * 1.6);
      c = mix(c, vec3(0.6, 0.02, 0.02), uHurt * smoothstep(0.08, 0.5, r2 * 1.6) * 0.7);
      c += (h(vUv * 1000.0 + uTime) - 0.5) * uGrain;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Game {
  constructor() {
    this.settings = loadSettings();
    this.canvas = document.getElementById('view');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5) * this.settings.resScale);
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.8;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    setAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 5000);
    this.input = new Input(this.canvas);
    this.audio = new AudioSystem();
    this.time = 0; this.paused = false; this.mode = 'loading';
    this.vehicles = []; this.buffs = { energy: 0 };
    this.stats = { walked: 0, driven: 0, topSpeed: 0, takedowns: 0, busted: 0, ko: 0 };
    this.indoors = false; this.indoorZone = null; this.inCity = true;
    this.fpsT = 0; this.fpsN = 0;
    window.addEventListener('resize', () => this.resize());
  }

  // ------------------------------------------------------------ boot
  async load(progress) {
    const step = async (pct, label, fn) => { progress(pct, label); await new Promise((r) => setTimeout(r, 16)); fn(); };
    const W = this.world = {
      scene: this.scene, game: this, audio: this.audio, Tex,
      batcher: new StaticBatcher(this.scene, 150), collision: new CollisionWorld(),
      interactables: [], lightAnchors: [], indoorZones: [], benches: [], mapRects: [], fountains: [], shopCounters: [],
      reserved: RESERVED,
      addInteractable: (o) => { W.interactables.push(o); return o; },
      addLightAnchor: (pos, color, intensity, distance, indoor = false, flicker = false) => W.lightAnchors.push({ pos, color, intensity, distance, indoor, flicker }),
    };
    W.lanternMat = new THREE.MeshStandardMaterial({ color: 0x8a1010, emissive: 0xff3a1a, emissiveIntensity: 1, roughness: 0.6, vertexColors: true });
    W.glowDecalMat = new THREE.MeshBasicMaterial({ map: Tex.radial('rgba(255,200,140,1)'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4 });
    W.beaconMat = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2020, emissiveIntensity: 2 });
    W.frondMat = new THREE.MeshStandardMaterial({ roughness: 0.8, vertexColors: true, side: THREE.DoubleSide });
    W.billboardMat = this.makeBillboard();
    W.particles = this.particles = new Particles(this.scene);
    await step(5, 'Laying out streets', () => { W.city = new City(W); });
    await step(15, 'Raising the skyline', () => W.city.build());
    await step(45, 'Furnishing interiors', () => { new Interiors(W).build(); });
    await step(60, 'Shaping the hills and coast', () => { new Terrain(W).build(); });
    await step(75, 'Optimizing geometry', () => W.batcher.build());
    await step(85, 'Lighting the city', () => {
      this.env = W.env = new Environment(W, this.renderer, this.scene);
      this.lights = new TrafficLights();
      this.traffic = new Traffic(W, this.lights);
      this.peds = new Pedestrians(W);
      this.police = new Police(W);
      this.effects = new Effects(W);
      this.inventory = new Inventory();
      this.player = new Player(W, DEFAULT_LOOK);
      this.cam = new CameraRig(this.camera, W);
      this.hud = new HUD(this);
      this.missions = new Missions(this);
      this.ui = new UI(this);
      this.setupComposer();
    });
    await step(92, 'Populating Solara', () => {
      this.hud.init();
      this.spawnStatics();
      this.player.position.set(POI.spawn.x, 0.15, POI.spawn.z); this.player.heading = Math.PI;
      this.env.setHour(17.3); this.env.setWeather('clear', true);
      this.applySettings();
      // warm-up render to compile shaders
      this.renderer.compile(this.scene, this.camera);
    });
    progress(100, 'Ready');
    this.input.onLockChange = (locked) => {
      if (!locked && this.mode === 'play' && !this.ui.anyOpen) this.ui.openPause('map');
      document.getElementById('clickToPlay').classList.toggle('show', !locked && this.mode === 'play' && !this.ui.anyOpen);
    };
    this.mode = 'title';
    this.ui.showTitle();
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }
  makeBillboard() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 288;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const ads = [['SOLARA FM', 'lo-fi · 24/7', '#ff5a7a', '#5a6aff'], ['VENTO GT', 'feel the coast', '#ff9a3c', '#d8262c'], ['QUIKMART', 'open all night', '#d8262c', '#f2c12e'], ['MERIDIAN', 'the future is up', '#2a8aa8', '#0c1218']];
    let i = 0;
    const draw = () => {
      const [a, b, c1, c2] = ads[i++ % ads.length], x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 512, 288); g.addColorStop(0, c1); g.addColorStop(1, c2);
      x.fillStyle = g; x.fillRect(0, 0, 512, 288);
      x.fillStyle = '#fff'; x.font = 'bold 72px "Barlow Condensed", Arial'; x.textAlign = 'center'; x.fillText(a, 256, 150);
      x.font = '28px Arial'; x.fillText(b, 256, 200); tex.needsUpdate = true;
    };
    draw(); setInterval(draw, 6000);
    const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.2 });
    return m;
  }
  setupComposer() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.settings.aa ? 4 : 0 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.45, 0.5, 1.05);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }
  spawnStatics() {
    const W = this.world;
    // clerks (Mara runs the noodle house)
    for (const sc of W.shopCounters) {
      const isMara = sc.shop === 'noodle';
      const n = new NPC(W, isMara ? CONTACT_LOOKS.mara : null, { x: sc.clerkPos.x, y: sc.clerkPos.y, z: sc.clerkPos.z, heading: sc.clerkRot, role: 'clerk', state: 'stand', persistent: true, name: isMara ? 'mara' : null });
      this.peds.add(n);
      if (isMara) this.mara = n;
    }
    const rc = new NPC(W, null, { x: -45, y: 0.15, z: -127, heading: 0, role: 'clerk', state: 'stand', persistent: true });
    this.peds.add(rc);
    // parked cars
    const spots = W.parkingSpots || [];
    spots.forEach((s, i) => {
      if ((i * 7) % 10 < 5) {
        const types = ['sedan', 'compact', 'suv', 'van', 'sports', 'compact'];
        this.spawnVehicle(types[i % types.length], PAINTS[(i * 3) % PAINTS.length], s.x, s.z, s.heading + (Math.random() - 0.5) * 0.06);
      }
    });
    this.homeCar = this.spawnVehicle('compact', 0x2a8aa8, 142, 103.6, Math.PI, { persistent: true });
    this.spawnVehicle('suv', 0x111214, 18, -560, -Math.PI / 2 + 0.3, { y: VILLA.y });
    const pc = this.spawnVehicle('police', 0xffffff, 212, -98.6, Math.PI / 2); pc.parkedPolice = true;
    const pc2 = this.spawnVehicle('police', 0xffffff, 236, -98.6, Math.PI / 2); pc2.parkedPolice = true;
    this.spawnVehicle('van', 0xf4f4f4, -60, -171.6, -Math.PI / 2);
    this.spawnVehicle('taxi', 0, 40, 172, Math.PI / 2);
  }
  spawnVehicle(type, color, x, z, heading, opts = {}) {
    const v = new Vehicle(this.world, type, color, { x, z, heading, y: opts.y, ...opts });
    if (opts.y != null) { v.pos.y = opts.y; }
    v.ground(true); v.syncVisual(0);
    this.vehicles.push(v);
    return v;
  }
  removeVehicle(v) { const i = this.vehicles.indexOf(v); if (i >= 0) this.vehicles.splice(i, 1); v.remove(); v.removed = true; }

  // ------------------------------------------------------------ game state
  newGame() {
    this.resetWorldState();
    this.inventory = new Inventory();
    this.missions.load({});
    this.missions.active = null;
    this.player.setAppearance(DEFAULT_LOOK);
    this.player.position.set(POI.spawn.x, 0.15, POI.spawn.z); this.player.heading = Math.PI;
    this.player.health = 100; this.player.stamina = 100; this.player.weapon = 'fists';
    this.env.setHour(17.1); this.env.setWeather(this.settings.weather === 'dynamic' ? 'clear' : this.settings.weather, true); this.env.day = 1; this.env.wetness = 0;
    this.stats = { walked: 0, driven: 0, topSpeed: 0, takedowns: 0, busted: 0, ko: 0 };
    this.mode = 'creator';
    this.cam.yaw = 0; this.cam.inited = false;
  }
  resetWorldState() {
    if (this.player.vehicle) this.player.exitVehicle();
    this.player.dead = false; this.player.busted = false; this.player.knockT = 0;
    this.env.timeMul = 1;
    this.police.clear();
    if (this.missions.active) { this.missions.cleanup(false); this.missions.active = null; }
    this.hud.objective(''); this.hud.timer(null); this.hud.subtitle(null); this.hud.waypoint = null; this.hud.setRoute(null);
    for (const k in this.missions.contacts) { this.peds.removeNPC(this.missions.contacts[k]); }
    this.missions.contacts = {};
  }
  beginStory() {
    this.mode = 'play';
    this.missions.init();
    this.letterbox(true); this.hud.hide(true);
    const sp = POI.spawn;
    this.cam.cinematic({
      from: new THREE.Vector3(-150, 140, 240), to: new THREE.Vector3(60, 60, 180), look: new THREE.Vector3(0, 20, -60), lookTo: new THREE.Vector3(sp.x, 5, sp.z), dur: 7, fov: 50,
      done: () => this.cam.cinematic({ from: new THREE.Vector3(sp.x + 14, 9, sp.z - 14), to: new THREE.Vector3(sp.x + 3, 2.4, sp.z - 5), look: new THREE.Vector3(sp.x, 1.5, sp.z), dur: 3.5, fov: 55, done: () => { this.letterbox(false); this.hud.hide(false); this.cam.yaw = Math.PI; this.cam.inited = false; this.missions.start('m1'); this.hud.notify('Tip: press <b>Esc</b> for the map, missions, inventory and settings.', 6); } }),
    });
    document.getElementById('introCard').classList.add('show');
    setTimeout(() => document.getElementById('introCard').classList.remove('show'), 6000);
    this.input.requestLock();
  }
  toTitle() {
    this.resetWorldState();
    this.mode = 'title'; this.ui.showTitle();
  }
  serialize() {
    const p = this.player;
    return {
      player: { x: p.position.x, y: p.position.y, z: p.position.z, heading: p.heading, health: p.health, appearance: p.h.appearance },
      inventory: this.inventory.serialize(), missions: this.missions.serialize(), stats: this.stats,
      env: { hour: this.env.hour, day: this.env.day, weather: this.env.weather },
      location: (this.indoorZone && this.indoorZone.name) || districtAt(p.position.x, p.position.z),
    };
  }
  saveGame(slot) {
    if (this.player.vehicle || this.missions.active) { /* still allowed: position snapshot */ }
    const ok = SaveSystem.write(slot, this.serialize());
    this.hud.notify(ok ? `Game saved (${slot === 'auto' ? 'autosave' : 'slot ' + slot}).` : 'Saved for this session only (storage unavailable).', 2.5);
  }
  autosave() { if (this.mode === 'play') SaveSystem.write('auto', this.serialize()); }
  loadGame(slot) {
    const d = SaveSystem.read(slot);
    if (!d) return;
    this.resetWorldState();
    this.inventory.load(d.inventory);
    this.missions.load(d.missions);
    this.stats = { ...this.stats, ...(d.stats || {}) };
    const p = this.player;
    p.setAppearance(d.player.appearance || DEFAULT_LOOK);
    p.position.set(d.player.x, d.player.y, d.player.z); p.heading = d.player.heading; p.health = d.player.health; p.stamina = 100; p.weapon = 'fists';
    this.env.setHour(d.env.hour); this.env.day = d.env.day; this.env.setWeather(this.settings.weather === 'dynamic' ? d.env.weather : this.settings.weather, true);
    this.ui.hideTitle();
    this.mode = 'play';
    this.missions.init();
    this.cam.yaw = p.heading; this.cam.inited = false;
    this.hud.notify('Game loaded.', 2);
    this.input.requestLock();
  }
  setPaused(v) {
    this.paused = v; this.input.enabled = !v;
    if (v) this.input.releaseLock();
    document.getElementById('clickToPlay').classList.remove('show');
  }
  letterbox(v) { document.getElementById('letterbox').classList.toggle('on', v); }
  cameraShake(a) { this.cam.shake(a); }
  setWaypoint(x, z) { this.hud.waypoint = new THREE.Vector3(x, 0, z); this.hud._routeT = 0; }

  // ------------------------------------------------------------ gameplay services
  heal(n) { const p = this.player; if (p.health >= p.maxHealth) { this.hud.notify('Already at full health.', 1.5); return false; } p.health = Math.min(p.maxHealth, p.health + n); this.audio.pickup(); return true; }
  energize(s) { this.buffs.energy = Math.max(this.buffs.energy, s); this.audio.pickup(); this.hud.notify(`Energy boost for ${s}s ⚡`, 2); return true; }
  useHealSnack() { this.heal(25); }
  useItem(id) {
    const it = ITEMS[id]; if (!it || !it.use || !this.inventory.count(id)) return;
    if (it.use(this) !== false) { this.inventory.remove(id); this.hud.notify(`Used ${it.name}.`, 1.5); }
  }
  quickUse(n) {
    const groups = [['noodles', 'snack'], ['energy', 'coffee', 'tea'], ['medkit'], ['repairkit']][n];
    const id = groups.find((x) => this.inventory.count(x));
    if (id) this.useItem(id); else this.hud.notify('No item for that slot.', 1.2);
  }
  buy(id) {
    const it = ITEMS[id];
    if (it.unique && this.inventory.count(id)) return;
    if (!this.inventory.spend(it.price)) { this.hud.notify('Not enough cash.', 1.5); return; }
    this.inventory.add(id, it.pack || 1); this.audio.cash();
    if (id === 'stungun' && !this.inventory.count('charges')) this.inventory.add('charges', 5);
    this.hud.notify(`Bought ${it.name}.`, 1.5);
  }
  useRepairKit() {
    const p = this.player;
    let v = p.vehicle;
    if (!v) { let bd = 5; for (const o of this.vehicles) { const d = o.pos.distanceTo(p.position); if (d < bd) { bd = d; v = o; } } }
    if (!v) { this.hud.notify('Stand next to a vehicle to use a repair kit.', 2); return false; }
    v.health = Math.min(1000, v.health + 500); v.dead = false; this.audio.pickup();
    return true;
  }
  repairVehicle() {
    const v = this.player.vehicle; if (!v) return;
    if (!this.inventory.spend(150)) { this.hud.notify('Repairs cost $150.', 2); return; }
    v.repair(); this.audio.cash();
    if (this.police.stars && !this.police.seen) { this.police.clear(); this.hud.notify('Fresh paint — the police lost track of you.', 3); }
    else this.hud.notify('Vehicle repaired.', 2);
  }
  sleepAndSave(place) {
    if (this.police.stars) { this.hud.notify("You can't rest while the police are after you.", 2.5); return; }
    this.letterbox(true);
    document.getElementById('fade').classList.add('on');
    setTimeout(() => {
      this.env.setHour(this.env.hour + 6); this.player.health = this.player.maxHealth;
      this.saveGame('auto');
      document.getElementById('fade').classList.remove('on'); this.letterbox(false);
      this.hud.notify(`You rested at the ${place}. Health restored. Game saved.`, 3.5);
    }, 1400);
  }
  openShop(id) { this.ui.openShop(id); }
  openWardrobe(paid) { this.ui.openWardrobe(paid, false); }
  damagePlayer(amount, from, kind = 'hit') {
    const p = this.player;
    if (p.dead || p.busted || this.mode !== 'play') return;
    if (p.blocking && kind === 'hit') amount *= 0.25;
    p.health -= amount; p.lastDamage = this.time;
    this.hud.hurt(); this.grade.uniforms.uHurt.value = Math.min(1, this.grade.uniforms.uHurt.value + amount / 30);
    this.cameraShake(Math.min(0.6, amount / 25));
    if (p.health <= 0) { p.health = 0; this.knockedOut(); }
  }
  knockedOut() {
    const p = this.player; p.dead = true; this.stats.ko++;
    if (p.vehicle) p.exitVehicle();
    const bill = Math.min(this.inventory.money, 100);
    this.ui.deathScreen('ko', `Hospital bill: ${fmtMoney(bill)}`);
    if (this.missions.active) this.missions.fail('You were knocked out.');
    setTimeout(() => {
      this.inventory.money -= bill; this.police.clear();
      p.position.set(POI.hospital.x, 0.15, POI.hospital.z); p.heading = 0; p.health = 100; p.dead = false; p.knockT = 0; p.vy = 0;
      this.cam.yaw = 0; this.cam.inited = false;
      this.env.setHour(this.env.hour + 2);
    }, 3800);
  }
  busted() {
    const p = this.player; if (p.busted || p.dead) return;
    p.busted = true; this.stats.busted++;
    if (p.vehicle) p.exitVehicle();
    const fine = Math.min(this.inventory.money, Math.max(50, Math.round(this.inventory.money * 0.1)));
    this.ui.deathScreen('busted', `Fine: ${fmtMoney(fine)} · stun charges confiscated`);
    if (this.missions.active) this.missions.fail('You were arrested.');
    setTimeout(() => {
      this.inventory.money -= fine; this.inventory.remove('charges', 999); this.police.clear(); this.player.weapon = 'fists';
      p.position.set(POI.police.x, 0.15, POI.police.z); p.heading = 0; p.busted = false; p.vy = 0;
      this.cam.yaw = 0; this.cam.inited = false;
      this.env.setHour(this.env.hour + 1);
    }, 3800);
  }
  onEnterVehicle(v) {
    if (v.parkedPolice) { v.parkedPolice = false; this.police.crime(1, this.player.position, this.police.witnessed(this.player.position, 40)); }
    if (v.police) this.hud.notify('Police cruiser — G toggles the siren.', 2.5);
    this.cam.lastMouse = -10;
  }
  onExitVehicle() { this.cam.lastMouse = this.time; }

  // ------------------------------------------------------------ settings
  applySettings() {
    const S = this.settings, r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5) * S.resScale);
    r.setSize(innerWidth, innerHeight);
    const shadowOn = S.shadows !== 'off';
    if (r.shadowMap.enabled !== shadowOn) { r.shadowMap.enabled = shadowOn; this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); }); }
    const ms = { low: 1024, high: 2048, ultra: 4096 }[S.shadows] || 1024;
    if (this.env.sun.shadow.mapSize.x !== ms) { this.env.sun.shadow.mapSize.set(ms, ms); if (this.env.sun.shadow.map) { this.env.sun.shadow.map.dispose(); this.env.sun.shadow.map = null; } }
    this.env.reflections = S.reflections;
    this.env.viewDistance = S.viewDistance;
    this.camera.far = 900 + 1800 * S.viewDistance; this.camera.updateProjectionMatrix();
    if (this.bloom) this.bloom.enabled = S.bloom;
    if (this.composer) {
      const n = S.aa ? 4 : 0;
      for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) if (rt.samples !== n) { rt.samples = n; rt.dispose(); }
      this.resize();
    }
    this.traffic.density = S.traffic; this.peds.density = S.peds;
    this.cam.sens = S.sens; this.cam.invertY = S.invertY; this.cam.baseFov = S.fov; this.cam.shakeEnabled = S.shake;
    Object.assign(this.audio.volumes, { master: S.master, sfx: S.sfx, music: S.music, ambient: S.ambient }); this.audio.applyVolumes();
    this.env.timeScale = S.timeScale;
    this.env.weatherLocked = S.weather !== 'dynamic';
    if (this.env.weatherLocked) this.env.setWeather(S.weather);
    document.getElementById('hud').classList.toggle('hidden', !S.hud || this.hud.hidden);
    document.getElementById('fps').style.display = S.fps ? 'block' : 'none';
  }
  resetSettings() { this.settings = { ...DEFAULT_SETTINGS }; saveSettings(this.settings); this.applySettings(); }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  // ------------------------------------------------------------ main loop
  frame() {
    const now = performance.now();
    let dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (dt <= 0) dt = 0.001;
    this.fpsN++; this.fpsT += dt;
    if (this.fpsT > 0.5) { document.getElementById('fps').textContent = Math.round(this.fpsN / this.fpsT) + ' FPS'; this.fpsN = 0; this.fpsT = 0; }
    if (document.body.dataset.mode !== this.mode) document.body.dataset.mode = this.mode;
    this.handleHotkeys();
    if (this.mode === 'title') this.updateTitle(dt);
    else if (!this.paused) this.update(dt);
    else if (this.ui.open === 'wardrobe') { this.player.h.animate(dt, { speed: 0 }); this.cam.portrait(this.player, dt); }
    this.render(dt);
    this.input.endFrame();
  }
  handleHotkeys() {
    const I = this.input, ui = this.ui;
    if (this.mode !== 'play') return;
    if (I.pressedRaw('Escape') || I.pressedRaw('KeyP')) {
      if (ui.open === 'pause' || ui.open === 'shop' || ui.open === 'wardrobe') ui.closeAll();
      else if (!ui.open) ui.openPause('map');
      return;
    }
    if (ui.open === 'pause') {
      if (I.pressedRaw('KeyM')) ui.tab === 'map' ? ui.closeAll() : ui.pauseTab('map');
      if (I.pressedRaw('Tab') || I.pressedRaw('KeyI')) ui.tab === 'inventory' ? ui.closeAll() : ui.pauseTab('inventory');
      if (I.pressedRaw('KeyJ')) ui.tab === 'missions' ? ui.closeAll() : ui.pauseTab('missions');
      return;
    }
    if (ui.open) return;
    if (this.cam.cine) return;
    if (I.pressedRaw('KeyM')) ui.openPause('map');
    else if (I.pressedRaw('Tab') || I.pressedRaw('KeyI')) ui.openPause('inventory');
    else if (I.pressedRaw('KeyJ')) ui.openPause('missions');
  }
  updateTitle(dt) {
    this.titleT = (this.titleT || 0) + dt;
    const t = this.titleT * 0.05;
    const focus = new THREE.Vector3(-20, 0, -80);
    this.camera.position.set(focus.x + Math.cos(t) * 190, 75 + Math.sin(t * 0.7) * 15, focus.z + Math.sin(t) * 190);
    this.camera.lookAt(focus.x, 25, focus.z);
    this.camera.fov = 50; this.camera.updateProjectionMatrix();
    this.simulateWorld(dt, focus);
    this.env.update(dt, focus, this.camera, false);
  }
  simulateWorld(dt, focus) {
    this.lights.update(dt);
    this.traffic.update(dt, focus);
    this.peds.update(dt, focus);
    for (const v of this.vehicles) { if (v.mode === 'physics' && v.driver !== 'player' && !v.police && (v.speed > 0.05 || v.airborne)) v.update(dt, null); v.syncVisual(dt); }
    collideVehicles(this.vehicles, (a, b, sp) => this.onCarCrash(a, b, sp));
    this.particles.update(dt, innerHeight);
    this.effects.update(dt);
  }
  onCarCrash(a, b, sp) {
    for (const v of [a, b]) {
      if (v.mode === 'ai' && sp > 2.5 && v.ai) {
        const car = v.ai; this.traffic.release(car); v.vel.multiplyScalar(0.5); v.crashedT = 0;
        if (v.npcDriver && Math.random() < 0.7) v.npcDriver.say(['Hey!!', 'Are you blind?!', 'My car!', 'Learn to drive!'][Math.floor(Math.random() * 4)]);
      }
    }
    const p = this.player.vehicle;
    if (p && (a === p || b === p) && sp > 6) {
      const other = a === p ? b : a;
      if (other.police) this.police.crime(1, this.player.position, true);
    }
  }

  update(dt) {
    this.time += dt;
    const p = this.player, I = this.input;
    I.enabled = !this.ui.anyOpen && !this.cam.cine && this.mode === 'play';
    this.buffs.energy = Math.max(0, this.buffs.energy - dt);
    this.grade.uniforms.uHurt.value = Math.max(0, this.grade.uniforms.uHurt.value - dt * 0.8);
    // interactions
    this.updateInteractions();
    if (I.pressed('KeyF')) { if (p.vehicle) p.exitVehicle(); else if (p.onFoot) p.tryEnterVehicle(); }
    if (I.pressed('KeyV')) this.cam.cycleDistance();
    if (I.pressed('KeyN')) { this.audio.radioOn = !this.audio.radioOn; this.hud.notify(this.audio.radioOn ? 'Radio on — Solara FM' : 'Radio off', 1.5); }
    for (let k = 0; k < 4; k++) if (I.pressed('Digit' + (k + 1))) this.quickUse(k);
    const prev = p.position.clone();
    p.update(dt, I, this.cam);
    const moved = Math.hypot(p.position.x - prev.x, p.position.z - prev.z);
    if (p.vehicle) { this.stats.driven += moved; this.stats.topSpeed = Math.max(this.stats.topSpeed, p.vehicle.speed); } else if (moved < 2) this.stats.walked += moved;
    const focus = p.position;
    this.inCity = Math.abs(focus.x) < 330 && focus.z > -330 && focus.z < 330;
    this.simulateWorld(dt, focus);
    this.police.update(dt);
    this.vehiclePedCollisions(dt);
    this.recoverCrashedCars(dt);
    this.missions.update(dt);
    // camera
    if (!this.cam.portraitMode) this.cam.update(dt, I, p, this.time);
    // indoors
    this.indoorZone = this.zoneAt(p.position);
    this.indoors = !!this.indoorZone;
    const camIndoor = !!this.zoneAt(this.camera.position);
    this.env.update(dt, focus, this.camera, camIndoor);
    for (const it of this.world.interactables) if (it.update) it.update(this.time, dt);
    // audio
    const d = districtAt(focus.x, focus.z);
    const v = p.vehicle;
    this.audio.update({
      urban: d === 'downtown' ? 1 : ['lantern', 'shops', 'plaza', 'apartments'].includes(d) ? 0.7 : d === 'hills' || d === 'outskirts' ? 0 : 0.4,
      park: d === 'park' ? 1 : 0, hills: d === 'hills' || d === 'outskirts' ? 1 : 0, coast: d === 'beach' || focus.z > 260 ? 1 : 0,
      rain: this.env.cur.rain, night: this.env.nightF > 0.5, indoors: this.indoors,
      inCar: !!v, rpm: v ? v.rpm : 0, throttle: v ? v.throttle : 0, engineOn: v ? v.engineOn : false, speed: v ? v.speed : p.speed,
      skid: v ? v.skid : 0, siren: this.police.cars.some((c) => c.siren && c.pos.distanceTo(focus) < 120) ? 1 : 0,
    });
    this.hud.update(dt);
  }
  zoneAt(p) {
    for (const z of this.world.indoorZones) if (p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1 && p.y > z.y0 - 0.5 && p.y < z.y1) return z;
    return null;
  }
  updateInteractions() {
    const p = this.player, I = this.input;
    if (!p.onFoot && !p.vehicle) { this.hud.prompt(null); return; }
    let best = null, bd = Infinity;
    for (const it of this.world.interactables) {
      if (it.dead || !it.radius) continue;
      if (it.enabled && !it.enabled()) continue;
      if (!!it.vehicleOnly !== !!p.vehicle) continue;
      const d = Math.hypot(it.pos.x - p.position.x, it.pos.z - p.position.z) + Math.abs(it.pos.y - (p.position.y + 1)) * 1.5;
      if (d < it.radius && d < bd) { bd = d; best = it; }
    }
    // auto-pickups
    if (best && best.auto) { best.action(); best.dead = true; return; }
    const start = p.onFoot ? this.missions.startPointNear(p.position) : null;
    let text = null;
    if (start) text = `<kbd>E</kbd> Start ${start.story ? 'mission' : 'job'}: <b>${start.title}</b>`;
    else if (best) text = `<kbd>E</kbd> ${typeof best.label === 'function' ? best.label() : best.label}`;
    if (p.onFoot && !text) {
      for (const v of this.vehicles) { const dp = v.doorPos(new THREE.Vector3()); if (dp.distanceTo(p.position) < 2.2 && v.speed < 6) { text = `<kbd>F</kbd> ${v.npcDriver ? 'Carjack' : 'Enter'} ${v.spec.name}`; break; } }
    }
    if (p.vehicle && !text && p.vehicle.speed < 1 && !this.missions.active) text = null;
    this.hud.prompt(this.ui.anyOpen || this.cam.cine ? null : text);
    if (I.pressed('KeyE')) {
      if (start) this.missions.start(start.id);
      else if (best) { best.action(); }
    }
  }
  vehiclePedCollisions() {
    const p = this.player;
    for (const v of this.vehicles) {
      const sp = v.speed; if (sp < 2) continue;
      const c = Math.cos(v.heading), s = Math.sin(v.heading), hl = v.spec.len / 2 + 0.3, hw = v.spec.wid / 2 + 0.3;
      const test = (pos) => {
        const dx = pos.x - v.pos.x, dz = pos.z - v.pos.z;
        const lz = dx * s + dz * c, lx = dx * c - dz * s;
        return Math.abs(lz) < hl && Math.abs(lx) < hw && Math.abs(pos.y - v.pos.y) < 1.5;
      };
      for (const n of this.peds.list) {
        if (n.inVehicle || n.knocked || n.role === 'clerk') continue;
        if (!test(n.pos)) continue;
        if (v.mode === 'ai') continue;
        n.knockDown(3.5 + Math.random() * 2, v.pos);
        n.vel.set(v.vel.x * 0.6 + (Math.random() - 0.5) * 2, 0, v.vel.y * 0.6 + (Math.random() - 0.5) * 2);
        n.health -= sp * 3;
        v.vel.multiplyScalar(0.92);
        this.audio.crash(0.15);
        if (v.driver === 'player') {
          this.stats.takedowns++;
          if (n.role === 'ped' || n.role === 'cop') this.police.crime(n.role === 'cop' ? 2 : 1, p.position, n.role === 'cop' || this.police.witnessed(p.position, 40));
          this.peds.alert(n.pos, 25, 'attacked', n);
          if (n.role === 'thug' && n.health <= 0 && n.onDefeat) { const f = n.onDefeat; n.onDefeat = null; f(n); }
          if (n.role === 'thief' && n.onDefeat) { const f = n.onDefeat; n.onDefeat = null; f(n); }
        }
      }
      if (p.onFoot && !p.knockT && v.driver !== 'player' && test(p.position) && sp > 3) {
        p.knockT = 1.4; p.vel.set(v.vel.x * 0.5, v.vel.y * 0.5);
        this.damagePlayer(Math.min(60, sp * 2.5), v.pos, 'car');
        this.audio.crash(0.2);
      }
    }
  }
  recoverCrashedCars(dt) {
    for (const v of this.vehicles) {
      if (v.mode !== 'physics' || v.driver === 'player' || v.police || !v.npcDriver) continue;
      v.crashedT = (v.crashedT || 0) + dt;
      if (v.speed < 0.5 && v.crashedT > 3) {
        const lane = !v.dead && this.traffic.nearestLane(v.pos.x, v.pos.z, v.heading);
        if (lane && Math.hypot(v.pos.x - this.player.position.x, v.pos.z - this.player.position.z) > 8) { this.traffic.adopt(v, lane); v.crashedT = 0; }
        else if (v.crashedT > 6) {
          const d = v.npcDriver; d.inVehicle = null; v.npcDriver = null; v.doorPos(d.pos); d.state = 'walk'; d.from = null; d.role = 'ped';
          d.say(['Unbelievable.', 'I\'m calling my insurance.', 'Great. Just great.'][Math.floor(Math.random() * 3)]);
        }
      }
    }
  }
  render(dt) {
    const env = this.env;
    if (this.cam.portraitMode && this.ui.open === 'wardrobe' && !this.paused) this.cam.portrait(this.player, dt);
    const camIn = !!this.zoneAt(this.camera.position);
    const nearLantern = this.camera.position.z > -230 && this.camera.position.z < -130 && this.camera.position.x < -60 && this.camera.position.x > -300;
    env.renderReflection(this.camera, !camIn && (env.wetness > 0.05 || nearLantern) && this.camera.position.y < 120);
    this.grade.uniforms.uTime.value = performance.now() * 0.001 % 100;
    this.bloom.strength = 0.35 + env.nightF * 0.45;
    this.composer.render(dt);
  }
}
