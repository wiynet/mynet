// Mission system: story missions, side jobs, a time trial, random street events
// and collectibles. Missions are step lists executed by a small state machine.
import * as THREE from 'three';
import { POI, hillRoadX, hillRoadY, VILLA } from '../world/layout.js';
import { NPC } from '../entities/peds.js';
import { fmtMoney, fmtTime } from '../core/utils.js';

const THUG = (c) => ({ sex: 'm', skin: [0xd29f7a, 0xb07a52, 0xe8b996][c % 3], hair: 'buzz', hairColor: 0x141010, top: 'hoodie', topColor: [0x3a1a1a, 0x1a1a1e, 0x4a3a12][c % 3], innerColor: 0x111111, legs: 'pants', legColor: 0x1a1a1a, shoeColor: 0xf0f0f0, hat: c === 1 ? 'beanie' : 'none', hatColor: 0x8a1a1a, height: 1.03, build: 1.12 });
export const CONTACT_LOOKS = {
  mara: { sex: 'f', skin: 0xe8b996, hair: 'bun', hairColor: 0x141010, top: 'long', topColor: 0xf2f2f2, innerColor: 0xf2f2f2, legs: 'pants', legColor: 0x1a1a1e, shoeColor: 0x111111, hat: 'none', hatColor: 0, height: 0.97, build: 0.95 },
  ines: { sex: 'f', skin: 0xd29f7a, hair: 'long', hairColor: 0x3a2416, top: 'jacket', topColor: 0xe8e0d0, innerColor: 0x1a1a1e, legs: 'pants', legColor: 0xe8e0d0, shoeColor: 0x8a2a2a, hat: 'none', hatColor: 0, height: 1.0, build: 0.92, glasses: true },
  dex: { sex: 'm', skin: 0x8a5a3a, hair: 'curly', hairColor: 0x141010, top: 'jacket', topColor: 0x5a3a22, innerColor: 0xc8a050, legs: 'pants', legColor: 0x2a2a2e, shoeColor: 0x5a3a22, hat: 'none', hatColor: 0, height: 1.04, build: 1.05 },
};

const DELIVERY_SPOTS = [[160, 100.5], [-210, 100.5], [45, 259.5], [-230, 180.5], [240, -79.5], [-60, 169.5], [200, 10.5], [-30, -259.5], [120, -169.5], [-250, 10.5], [10, 100.5], [230, 259.5]];
const POSTCARDS = [[-150, -183, 0.6], [-20, -45, 0.6], [45, 0.5, 4.6], [-36, 39, 0.6], [140, 140, 0.6], [-252, 230, 0.6], [120, 418, 2.2], [0, -500, 26], [34, -545, 34.8], [-6, -588, 38.6], [-300, -100, 2], [330, 50, 3], [-140, 26, 0.8], [66, 46, 0.8], [250, 300, 0.6]];

export class Missions {
  constructor(game) {
    this.g = game; this.active = null; this.completed = new Set(); this.records = {}; this.postcards = new Set();
    this.contacts = {}; this.startPoints = []; this.eventT = 120; this.event = null; this.noPolice = false;
    this.defs = this.defineMissions();
  }
  get story() { return this.defs.filter((d) => d.story); }
  isDone(id) { return this.completed.has(id); }

  // ------------------------------------------------------------ definitions
  defineMissions() {
    const g = this.g;
    const villaDoor = new THREE.Vector3(8, VILLA.y, -582.5);
    return [
      {
        id: 'm1', story: true, title: 'Welcome to Solara', contact: null, startPos: new THREE.Vector3(POI.spawn.x, 0.15, POI.spawn.z + 1.5), reward: 500,
        available: () => true,
        desc: 'Meet Mara at her noodle house and run an errand up to Mirador Heights.',
        steps: [
          { type: 'dialog', lines: [['Mara (phone)', 'Kai! You finally made it to Solara. Welcome home.', 3.2], ['Mara (phone)', "Come by my noodle house on Lantern Row. I've got a job — easy money.", 3.6], ['Kai', "On my way. Don't let the broth go cold.", 2.6]] },
          { type: 'goto', pos: new THREE.Vector3(-150, 0.15, -162.5), radius: 2.4, text: "Go to Mara's Noodle House on <b>Lantern Row</b>.", onFoot: true },
          { type: 'dialog', speaker: 'mara', lines: [['Mara', "Look at you! Still can't dress yourself, I see.", 3], ['Mara', 'I need this envelope delivered to Ines Vega. Her villa is up in Mirador Heights.', 3.8], ['Mara', 'Take my car — it\'s parked out front. And Kai... no scratches.', 3.4]], onEnd: () => { g.inventory.add('envelope'); g.hud.notify('Received: Mara\'s Envelope ✉', 3); } },
          { type: 'enterVehicle', tag: 'maraCar', text: "Get in Mara's car outside.", spawn: { type: 'sedan', color: 0x8a1a1a, x: -138, z: -174.6, heading: Math.PI / 2 } },
          { type: 'goto', pos: new THREE.Vector3(10, VILLA.y, -565), radius: 6, text: 'Drive up the hill road to the <b>Vega villa</b> in Mirador Heights.', inVehicle: 'maraCar' },
          { type: 'goto', pos: new THREE.Vector3(9, VILLA.y + 4, -599.2), radius: 1.8, text: 'Take the envelope to the <b>office upstairs</b>.', onFoot: true, hint: 'The front door is on the terrace. Press E to open doors.' },
          { type: 'interact', pos: new THREE.Vector3(9, VILLA.y + 4.8, -600.5), label: 'Leave the envelope on the desk', text: 'Leave the envelope on the desk.', onEnd: () => g.inventory.remove('envelope') },
          { type: 'dialog', lines: [['Ines (phone)', "So you're Mara's friend. The envelope's on my desk — good.", 3.2], ['Ines (phone)', "Enjoy the view from the terrace. I'll have more work for someone reliable.", 3.6]] },
        ],
      },
      {
        id: 'm2', story: true, title: 'Special Delivery', contact: 'ines', contactPos: new THREE.Vector3(-4, VILLA.y + 0.12, -579.5), contactHeading: Math.PI, startPos: new THREE.Vector3(-4, VILLA.y, -578), reward: 1200,
        available: () => this.isDone('m1'), desc: 'Collect a sealed package and get it to Meridian Tower against the clock.',
        steps: [
          { type: 'dialog', speaker: 'ines', lines: [['Ines', 'A package is waiting for me at Bayview Parking. A client in Meridian Tower needs it today.', 3.8], ['Ines', 'Once you have it, you have two and a half minutes. Their lawyers are... punctual.', 3.6]] },
          { type: 'goto', pos: new THREE.Vector3(30, 0.15, 40), radius: 3, text: 'Collect the package at <b>Bayview Parking</b>.', spawnProp: 'package' },
          { type: 'interact', pos: new THREE.Vector3(30, 0.6, 40), label: 'Pick up package', text: 'Pick up the package.', onEnd: () => { g.inventory.add('package'); this.removeProp(); } },
          { type: 'goto', pos: new THREE.Vector3(-45, 0.15, -124.4), radius: 2.5, text: 'Deliver the package to the <b>Meridian Tower</b> reception.', timer: 150, onFoot: true },
          { type: 'dialog', lines: [['Receptionist', 'Right on time. Ms. Vega sends her regards, I assume.', 3], ['Kai', 'Something like that.', 2]], onEnd: () => g.inventory.remove('package') },
        ],
      },
      {
        id: 'm3', story: true, title: 'Street Justice', contact: 'dex', contactPos: new THREE.Vector3(-98, 0.15, -7.5), contactHeading: Math.PI, startPos: new THREE.Vector3(-98, 0.15, -5.8), reward: 1500,
        available: () => this.isDone('m2'), desc: 'Run the Rust Vipers off Bayview Avenue and recover a stolen car.',
        steps: [
          { type: 'dialog', speaker: 'dex', lines: [['Dex', "You're the one Ines trusts? Good. The Rust Vipers are shaking down the shops down the avenue.", 4], ['Dex', 'Nobody gets hurt bad, understand? Just make them leave. Then bring back the car they took.', 4]] },
          { type: 'goto', pos: new THREE.Vector3(-40, 0.15, 9), radius: 9, text: 'Find the <b>Rust Vipers</b> on Bayview Avenue.' },
          { type: 'defeat', count: 3, pos: new THREE.Vector3(-40, 0.15, 10), text: 'Take down the Rust Vipers <span class="dim">(punch: LMB, guard: RMB, kick on 3rd hit)</span>.' },
          { type: 'enterVehicle', tag: 'stolenCar', text: 'Take back the stolen car.', spawn: { type: 'sports', color: 0x1a3a7a, x: -30, z: 4.2, heading: Math.PI / 2 } },
          { type: 'goto', pos: new THREE.Vector3(66, 0.15, 24), radius: 5, text: 'Bring the car to <b>Fix & Go</b> for a check-up.', inVehicle: 'stolenCar' },
          { type: 'dialog', lines: [['Dex (phone)', 'Clean work. Keep the stun gun — it\'s yours. Non-lethal, the way I like it.', 3.6]], onEnd: () => { if (!g.inventory.count('stungun')) g.inventory.add('stungun'); g.inventory.add('charges', 10); g.hud.notify('Received: Stun Gun + 10 charges. Press Q to equip.', 4); } },
        ],
      },
      {
        id: 'm4', story: true, title: 'Golden Hour', contact: 'ines', contactPos: new THREE.Vector3(118, 0.15, 282.5), contactHeading: Math.PI, startPos: new THREE.Vector3(120, 0.15, 280), reward: 3000,
        available: () => this.isDone('m3'), desc: 'Race the sunset from the pier to the Mirador overlook in a borrowed supercar.',
        onStart: () => { g.env.setHour(17.45); g.env.setWeather('clear', true); g.env.timeMul = 0.12; this.noPolice = true; },
        onEnd: () => { g.env.timeMul = 1; },
        steps: [
          { type: 'dialog', speaker: 'ines', lines: [['Ines', "There's a car I want you to deliver to my overlook. It's a Vento GT, so try not to fall in love.", 4], ['Ines', 'Beat the sunset. I want to see it parked by the railing before the sun goes down.', 3.6]] },
          { type: 'enterVehicle', tag: 'vento', text: 'Get in the <b>Vento GT</b>.', spawn: { type: 'sports', color: 0xd8602a, x: 108, z: 276, heading: -Math.PI / 2 } },
          { type: 'checkpoints', text: 'Race to the <b>Mirador Overlook</b> before sunset!', timer: 170, inVehicle: 'vento', points: [[90, 262], [90, 100], [10, 90], [0, 10], [-10, -90], [-90, -100], [-100, -180], [-180, -170], [-180, -262], [-10, -270], [hillRoadX(-360), -360], [hillRoadX(-460), -460], [24, -553]] },
          { type: 'cinematic', shot: () => ({ from: new THREE.Vector3(60, VILLA.y + 14, -520), to: new THREE.Vector3(10, VILLA.y + 5, -530), look: new THREE.Vector3(0, 10, -300), lookTo: new THREE.Vector3(-80, 0, -200), dur: 7, fov: 45 }), text: '' },
          { type: 'dialog', lines: [['Ines', 'Right on time. Look at that — the whole city on fire.', 3.2], ['Ines', 'Stick around, Kai. Solara has plenty more for you.', 3.4]], onEnd: () => { this.noPolice = false; } },
        ],
      },
      {
        id: 'noodle', story: false, title: 'Noodle Rush', contact: null, startPos: new THREE.Vector3(-147, 0.15, -165), reward: 0, repeat: true,
        available: () => this.isDone('m1'), desc: 'Deliver hot noodles across the city. The faster, the bigger the tip.',
        steps: [{ type: 'custom', run: 'delivery' }],
      },
      {
        id: 'sprint', story: false, title: 'Ocean Drive Sprint', contact: null, startPos: new THREE.Vector3(-200, 0.15, 281), reward: 250, repeat: true,
        available: () => true, desc: 'Time trial along the coast and back. Beat your best time.',
        steps: [
          { type: 'enterVehicle', tag: 'sprintCar', text: 'Get in the sprint car.', spawn: { type: 'sports', color: 0xe0b020, x: -205, z: 274.8, heading: Math.PI / 2 }, any: true },
          { type: 'checkpoints', text: 'Hit every checkpoint as fast as you can.', countUp: true, inVehicle: 'any', points: [[-90, 274], [0, 274], [90, 274], [180, 274], [262, 260], [270, 180], [180, 175], [90, 185], [0, 180], [-90, 185], [-180, 175], [-262, 180], [-270, 262], [-200, 274]] },
        ],
      },
    ];
  }

  // ------------------------------------------------------------ setup
  init() {
    const g = this.g;
    // collectible postcards
    for (let i = 0; i < POSTCARDS.length; i++) {
      if (this.postcards.has(i)) continue;
      const [x, z, y] = POSTCARDS[i];
      const m = g.effects.postcard(new THREE.Vector3(x, y + 1, z));
      g.world.addInteractable({
        pos: new THREE.Vector3(x, y + 1, z), radius: 1.6, auto: true, label: 'Postcard',
        enabled: () => !this.postcards.has(i),
        action: () => { this.postcards.add(i); g.effects.removePostcard(m); g.inventory.earn(100); g.audio.cash(); g.hud.notify(`Postcard found! (${this.postcards.size}/${POSTCARDS.length}) +$100`, 3); if (this.postcards.size === POSTCARDS.length) { g.inventory.earn(1000); g.hud.notify('All postcards collected! Bonus +$1,000', 5); } g.autosave(); },
      });
    }
    this.refreshStarts();
  }
  totalPostcards() { return POSTCARDS.length; }
  refreshStarts() {
    const g = this.g;
    for (const sp of this.startPoints) sp.marker.remove();
    this.startPoints = [];
    for (const d of this.defs) {
      const avail = d.available() && (!this.isDone(d.id) || d.repeat);
      // contact NPCs
      if (d.contact) {
        const key = d.id + d.contact;
        if (avail && !this.contacts[key]) {
          const n = new NPC(g.world, CONTACT_LOOKS[d.contact], { x: d.contactPos.x, y: d.contactPos.y, z: d.contactPos.z, heading: d.contactHeading, role: 'contact', state: 'stand', persistent: true, name: d.contact });
          g.peds.add(n); this.contacts[key] = n;
        } else if (!avail && this.contacts[key] && !(this.active && this.active.def === d)) { g.peds.removeNPC(this.contacts[key]); delete this.contacts[key]; }
      }
      if (!avail) continue;
      const marker = g.effects.marker(d.startPos, d.story ? 0xffb02e : 0x5ad8ff, d.story ? 'story' : 'side');
      this.startPoints.push({ def: d, marker });
    }
  }
  startPointNear(pos) {
    if (this.active) return null;
    for (const sp of this.startPoints) {
      const p = sp.def.startPos;
      if (Math.hypot(p.x - pos.x, p.z - pos.z) < 2.4 && Math.abs(p.y - pos.y) < 2.5) return sp.def;
    }
    return null;
  }

  // ------------------------------------------------------------ runtime
  start(id) {
    const g = this.g, def = this.defs.find((d) => d.id === id);
    if (!def || this.active) return;
    this.active = { def, idx: -1, entities: [], vehicles: {}, timer: null, t: 0, cp: 0, data: {} };
    for (const sp of this.startPoints) sp.marker.remove();
    this.startPoints = [];
    if (def.onStart) def.onStart();
    g.hud.missionTitle(def.title, def.story ? 'Story mission' : 'Side job');
    g.audio.missionStart();
    if (g.police.heat > 0 && def.story) { g.police.clear(); }
    this.next();
  }
  next() {
    const a = this.active; if (!a) return;
    const prev = a.def.steps[a.idx];
    if (prev && prev.onEnd) prev.onEnd();
    this.clearStepVisuals();
    a.idx++; a.t = 0;
    const step = a.def.steps[a.idx];
    if (!step) return this.pass();
    a.step = step;
    this.enterStep(step);
  }
  clearStepVisuals() {
    const a = this.active;
    if (a.marker) { a.marker.remove(); a.marker = null; }
    if (a.cpMarkers) { a.cpMarkers.forEach((m) => m.remove()); a.cpMarkers = null; }
    if (a.interact) { a.interact.dead = true; a.interact = null; }
    this.g.hud.setRoute(null);
  }
  enterStep(s) {
    const g = this.g, a = this.active;
    a.timer = s.timer != null ? s.timer : null;
    g.hud.objective(s.text || '', s.type === 'dialog' ? '' : s.text);
    if (s.hint) setTimeout(() => this.active && this.active.step === s && g.hud.notify(s.hint, 4), 1500);
    if (s.type === 'dialog') {
      a.lineIdx = -1; a.lineT = 0;
      this.nextLine();
    } else if (s.type === 'goto') {
      a.marker = g.effects.marker(s.pos, 0x5ad8ff, 'objective');
      g.hud.setRoute(s.pos);
      if (s.spawnProp) this.spawnProp(s.spawnProp, s.pos);
    } else if (s.type === 'interact') {
      a.marker = g.effects.marker(new THREE.Vector3(s.pos.x, s.pos.y - 0.6, s.pos.z), 0x5ad8ff, 'small');
      a.interact = g.world.addInteractable({ pos: s.pos, radius: 2.6, label: s.label, action: () => { if (this.active && this.active.step === s) this.next(); } });
    } else if (s.type === 'enterVehicle') {
      let v = a.vehicles[s.tag];
      if (!v && s.spawn) {
        const sp = s.spawn;
        v = g.spawnVehicle(sp.type, sp.color, sp.x, sp.z, sp.heading, { persistent: true, missionTag: s.tag });
        a.vehicles[s.tag] = v;
      }
      a.marker = g.effects.marker(new THREE.Vector3(v.pos.x, v.pos.y + 2.4, v.pos.z), 0x5ad8ff, 'vehicle');
      a.markerFollow = v;
      g.hud.setRoute(v.pos);
    } else if (s.type === 'defeat') {
      a.enemies = [];
      for (let i = 0; i < s.count; i++) {
        const n = new NPC(g.world, THUG(i), { x: s.pos.x + (i - 1) * 2.2, y: 0.15, z: s.pos.z + (i % 2) * 1.5, heading: Math.PI, role: 'thug', state: 'stand', tough: true, health: 95 });
        n.onDefeat = () => { a.defeated = (a.defeated || 0) + 1; g.hud.notify(`Rust Viper down (${a.defeated}/${s.count})`, 2); };
        n.idleKind = 'talk';
        g.peds.add(n); a.enemies.push(n); a.entities.push(n);
        n.say(['Who\'s this clown?', 'Beat it, tourist.', 'You lost?'][i], 2.5);
      }
      a.defeated = 0;
    } else if (s.type === 'checkpoints') {
      a.cp = 0; a.timer = s.timer != null ? s.timer : null; a.elapsed = 0;
      this.showCheckpoint();
    } else if (s.type === 'cinematic') {
      const shot = s.shot();
      g.letterbox(true); g.hud.hide(true);
      g.cam.cinematic({ ...shot, done: () => { g.letterbox(false); g.hud.hide(false); this.next(); } });
    } else if (s.type === 'custom') {
      if (s.run === 'delivery') this.deliveryStart();
    }
  }
  nextLine() {
    const a = this.active, s = a.step;
    a.lineIdx++;
    const L = s.lines[a.lineIdx];
    const c = s.speaker && this.contactNPC(s.speaker);
    if (!L) { if (c) c.talking = false; this.g.hud.subtitle(null); return this.next(); }
    a.lineT = L[2];
    this.g.hud.subtitle(L[0], L[1]);
    if (c) c.talking = L[0].startsWith(c.name[0].toUpperCase() + c.name.slice(1));
  }
  contactNPC(name) {
    if (name === 'mara') return this.g.mara;
    for (const k in this.contacts) if (k.endsWith(name)) return this.contacts[k];
    return null;
  }
  showCheckpoint() {
    const a = this.active, s = a.step, g = this.g;
    if (a.cpMarkers) a.cpMarkers.forEach((m) => m.remove());
    a.cpMarkers = [];
    const p = s.points[a.cp]; if (!p) return;
    const y = this.cpY(p);
    a.cpMarkers.push(g.effects.marker(new THREE.Vector3(p[0], y, p[1]), 0xffd23f, 'checkpoint'));
    const n = s.points[a.cp + 1];
    if (n) a.cpMarkers.push(g.effects.marker(new THREE.Vector3(n[0], this.cpY(n), n[1]), 0xffd23f, 'checkpointNext'));
    g.hud.setRoute(new THREE.Vector3(p[0], y, p[1]));
    g.hud.objective(s.text, `${s.text} <span class="dim">(${a.cp + 1}/${s.points.length})</span>`);
  }
  cpY(p) { return this.g.world.collision.terrainHeight(p[0], p[1]) + (p[1] < -280 ? 0 : 0.1); }

  update(dt) {
    const g = this.g, a = this.active, p = g.player;
    // random events & side content when idle
    this.updateEvents(dt);
    // mission start prompt handled by game (startPointNear)
    if (!a) return;
    a.t += dt;
    const s = a.step; if (!s) return;
    if (a.timer != null && s.type !== 'checkpoints' || (s.type === 'checkpoints' && s.timer)) {
      if (a.timer != null) { a.timer -= dt; g.hud.timer(a.timer); if (a.timer <= 0) return this.fail("Time's up!"); }
    }
    // tagged vehicle destroyed?
    for (const tag in a.vehicles) { const v = a.vehicles[tag]; if (v.dead || v.sunk) return this.fail(v.sunk ? 'The car ended up in the water.' : 'The car was wrecked.'); }
    if (a.markerFollow && a.marker) a.marker.setPos(a.markerFollow.pos.x, a.markerFollow.pos.y + 2.4, a.markerFollow.pos.z);
    const pos = p.position;
    switch (s.type) {
      case 'dialog':
        a.lineT -= dt;
        if (a.lineT <= 0 || g.input.pressedRaw('Enter')) this.nextLine();
        break;
      case 'goto': {
        const d = Math.hypot(pos.x - s.pos.x, pos.z - s.pos.z), dy = Math.abs(pos.y - s.pos.y);
        g.hud.trackDistance(d);
        if (s.inVehicle && p.vehicle !== a.vehicles[s.inVehicle] && a.t > 0.5) {
          g.hud.objective(s.text, `Get back in the car. <span class="dim">${s.text}</span>`);
          a.marker.setVisible(false); g.hud.setRoute(a.vehicles[s.inVehicle].pos);
          break;
        }
        a.marker.setVisible(true); g.hud.setRoute(s.pos);
        if (d < s.radius && dy < 3 && (!s.onFoot || !p.vehicle) && (!s.inVehicle || p.vehicle === a.vehicles[s.inVehicle])) {
          if (s.inVehicle && p.vehicle && p.vehicle.speed > 6) { g.hud.notify('Slow down and stop in the marker.', 1.5); break; }
          g.audio.checkpoint(); this.next();
        }
        break;
      }
      case 'enterVehicle': {
        const v = a.vehicles[s.tag];
        if (v) g.hud.setRoute(v.pos);
        if (p.vehicle && (p.vehicle === v || (s.any && p.vehicle))) { if (s.any) a.vehicles[s.tag] = p.vehicle; this.next(); }
        break;
      }
      case 'defeat': {
        for (const n of a.enemies) if (!n.knocked && !n.defeated && n.state === 'stand' && Math.hypot(n.pos.x - pos.x, n.pos.z - pos.z) < 16) { n.state = 'thug'; n.say(['Get him!', 'You asked for it!', 'Rust Vipers!'][Math.floor(Math.random() * 3)]); }
        if (a.defeated >= s.count) { g.hud.notify('The Rust Vipers are running away.', 3); this.next(); }
        break;
      }
      case 'checkpoints': {
        a.elapsed += dt;
        if (s.countUp) g.hud.timer(a.elapsed, true);
        const cp = s.points[a.cp];
        const needVeh = s.inVehicle === 'any' ? !!p.vehicle : !s.inVehicle || p.vehicle === a.vehicles[s.inVehicle];
        if (!needVeh) { g.hud.objective(s.text, 'Get back in a car to continue.'); break; }
        if (cp && Math.hypot(pos.x - cp[0], pos.z - cp[1]) < 9) {
          g.audio.checkpoint(); a.cp++;
          if (a.cp >= s.points.length) {
            if (s.countUp) {
              const best = this.records[a.def.id];
              a.result = a.elapsed;
              if (!best || a.elapsed < best) { this.records[a.def.id] = a.elapsed; a.newRecord = true; }
            }
            this.next();
          } else this.showCheckpoint();
        }
        break;
      }
      case 'custom': if (s.run === 'delivery') this.deliveryUpdate(dt); break;
    }
  }
  pass() {
    const g = this.g, a = this.active; const def = a.def;
    let reward = def.reward;
    let sub = '';
    if (def.id === 'sprint') {
      const t = a.result || 0;
      reward = a.newRecord ? (this.isDone('sprint') ? 150 : 250) : 50;
      sub = `Time ${fmtTime(t)}${a.newRecord ? ' — NEW RECORD!' : ` (best ${fmtTime(this.records.sprint)})`}`;
    }
    if (def.id === 'noodle') { reward = a.data.earned || 0; sub = `${a.data.done || 0} deliveries`; }
    this.completed.add(def.id);
    if (def.onEnd) def.onEnd();
    g.inventory.earn(reward);
    this.cleanup(true);
    this.active = null;
    g.hud.missionPassed(def.story ? 'MISSION PASSED' : 'JOB COMPLETE', def.title, reward, sub);
    g.audio.missionPass();
    g.hud.objective(''); g.hud.timer(null);
    this.refreshStarts();
    g.autosave();
    if (def.id === 'm4') setTimeout(() => g.hud.credits(), 5200);
    if (def.id === 'm1') setTimeout(() => g.hud.notify('New: <b>Special Delivery</b> — talk to Ines on the villa terrace (amber marker). Side job <b>Noodle Rush</b> unlocked at Mara\'s.', 6), 5500);
  }
  fail(reason) {
    const g = this.g, a = this.active; if (!a) return;
    this.clearStepVisuals();
    this.cleanup(false);
    const def = a.def;
    if (def.onEnd) def.onEnd();
    this.active = null; this.noPolice = false;
    g.hud.missionFailed(def.title, reason);
    g.audio.missionFail();
    g.hud.objective(''); g.hud.timer(null); g.hud.subtitle(null);
    for (const id of ['envelope', 'package']) g.inventory.remove(id, 99);
    this.refreshStarts();
  }
  cancel() { if (this.active) this.fail('Mission abandoned.'); }
  cleanup(passed) {
    const g = this.g, a = this.active;
    this.clearStepVisuals();
    for (const e of a.entities) if (!e.removed) {
      if (e.role === 'thug' && passed) { e.persistent = false; e.role = 'ped'; } else g.peds.removeNPC(e);
    }
    for (const tag in a.vehicles) {
      const v = a.vehicles[tag];
      v.persistent = false; v.missionTag = null;
      if (!passed && g.player.vehicle !== v) g.removeVehicle(v);
    }
    this.removeProp();
  }
  spawnProp(kind, pos) {
    const g = this.g;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.5), new THREE.MeshStandardMaterial({ color: 0xb08850, roughness: 0.8 }));
    m.position.set(pos.x, pos.y + 0.23, pos.z); m.castShadow = true;
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.52), new THREE.MeshStandardMaterial({ color: 0xd8c8a0 })); tape.position.y = 0.1; m.add(tape);
    g.world.scene.add(m); this.prop = m;
  }
  removeProp() { if (this.prop) { this.g.world.scene.remove(this.prop); this.prop = null; } }

  // ------------------------------------------------------------ Noodle Rush (side job)
  deliveryStart() {
    const a = this.active; a.data = { done: 0, earned: 0, total: 3 };
    this.g.hud.subtitle('Mara', 'Three orders tonight. Hot and fast — tips depend on it!', 3);
    setTimeout(() => this.g.hud.subtitle(null), 3200);
    this.deliveryNext();
  }
  deliveryNext() {
    const a = this.active, g = this.g;
    const opts = DELIVERY_SPOTS.filter((s) => Math.hypot(s[0] - g.player.position.x, s[1] - g.player.position.z) > 120);
    const s = opts[Math.floor(Math.random() * opts.length)];
    const pos = new THREE.Vector3(s[0], 0.15, s[1]);
    const dist = Math.hypot(pos.x - g.player.position.x, pos.z - g.player.position.z);
    a.data.target = pos; a.data.limit = Math.round(30 + dist / 9);
    a.timer = a.data.limit;
    if (a.marker) a.marker.remove();
    a.marker = g.effects.marker(pos, 0x5ad8ff, 'objective');
    g.hud.setRoute(pos);
    g.hud.objective('', `Deliver order <b>${a.data.done + 1}/${a.data.total}</b> to the marked address.`);
  }
  deliveryUpdate() {
    const a = this.active, g = this.g, p = g.player.position, t = a.data.target;
    const d = Math.hypot(p.x - t.x, p.z - t.z);
    g.hud.trackDistance(d);
    if (d < 3.5 && (!g.player.vehicle || g.player.vehicle.speed < 3)) {
      const tip = Math.round(40 + Math.max(0, a.timer) / a.data.limit * 120);
      a.data.earned += tip; a.data.done++;
      g.audio.cash(); g.hud.notify(`Delivered! Tip: ${fmtMoney(tip)}`, 2.5);
      if (a.data.done >= a.data.total) { a.timer = null; g.hud.timer(null); this.next(); }
      else this.deliveryNext();
    }
  }

  // ------------------------------------------------------------ random events
  updateEvents(dt) {
    const g = this.g;
    if (this.event) return this.updateThief(dt);
    if (this.active || !g.inCity || g.player.vehicle) return;
    this.eventT -= dt;
    if (this.eventT > 0) return;
    this.eventT = 150 + Math.random() * 180;
    // purse snatcher: pick a ped near the player
    const p = g.player.position;
    const cands = g.peds.list.filter((n) => n.role === 'ped' && !n.knocked && n.state === 'walk' && Math.hypot(n.pos.x - p.x, n.pos.z - p.z) < 30 && Math.hypot(n.pos.x - p.x, n.pos.z - p.z) > 8);
    if (cands.length < 2) return;
    const victim = cands[0], thief = cands[1];
    thief.role = 'thief'; thief.persistent = true; thief.state = 'flee'; thief.timer = 999; thief.threat = p.clone(); thief.from = null; thief.tough = false; thief.health = 40;
    thief.onDefeat = () => { this.event.caught = true; };
    victim.say('Help! He stole my purse!', 3); victim.state = 'idle'; victim.idleKind = 'look'; victim.timer = 30;
    this.event = { thief, victim, t: 0 };
    g.hud.notify('<b>Purse snatcher!</b> Chase him down and knock him over.', 4);
    g.hud.objective('', 'Stop the <b>purse snatcher</b>.');
  }
  updateThief(dt) {
    const e = this.event, g = this.g, p = g.player.position;
    e.t += dt;
    const th = e.thief;
    if (th.removed) { this.event = null; g.hud.objective(''); return; }
    th.threat = p.clone(); th.timer = 999;
    if (th.knocked && !e.caught) e.caught = true;
    if (e.caught && !e.returned) {
      e.returned = true; th.persistent = false; th.role = 'ped';
      g.inventory.earn(150); g.audio.cash();
      g.hud.notify('Purse recovered! The owner thanks you: +$150', 3.5);
      e.victim.say('Thank you so much!', 3);
      g.hud.objective('');
      this.event = null; return;
    }
    const d = Math.hypot(th.pos.x - p.x, th.pos.z - p.z);
    if (d > 140 || e.t > 120) { g.hud.notify('The thief got away.', 3); th.persistent = false; th.role = 'ped'; this.event = null; g.hud.objective(''); }
  }

  serialize() { return { completed: [...this.completed], records: this.records, postcards: [...this.postcards] }; }
  load(d) { this.completed = new Set(d.completed || []); this.records = d.records || {}; this.postcards = new Set(d.postcards || []); }
}
