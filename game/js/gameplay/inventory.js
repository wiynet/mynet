// Money, items and their effects. Shops sell from these definitions.
export const ITEMS = {
  snack: { name: 'Street Snack', desc: 'Restores 25 health.', price: 15, icon: '🥪', use: (g) => g.heal(25) },
  noodles: { name: "Mara's Ramen", desc: 'Hearty bowl. Restores 60 health.', price: 30, icon: '🍜', use: (g) => g.heal(60) },
  tea: { name: 'Bubble Tea', desc: 'Sprint longer for 60 s.', price: 12, icon: '🧋', use: (g) => g.energize(60) },
  coffee: { name: 'Coffee', desc: 'Refills stamina.', price: 6, icon: '☕', use: (g) => { g.player.stamina = 100; return true; } },
  energy: { name: 'Volt Energy', desc: 'Full stamina + sprint boost for 90 s.', price: 20, icon: '⚡', use: (g) => { g.player.stamina = 100; return g.energize(90); } },
  medkit: { name: 'First-Aid Kit', desc: 'Restores full health.', price: 120, icon: '⛑', use: (g) => g.heal(100) },
  repairkit: { name: 'Repair Kit', desc: 'Fixes 50% vehicle damage (use near or in a car).', price: 180, icon: '🔧', use: (g) => g.useRepairKit() },
  stungun: { name: 'Stun Gun', desc: 'Non-lethal. Knocks targets down for a few seconds. Equip with Q.', price: 400, icon: '🔫', unique: true },
  charges: { name: 'Stun Charges', desc: 'Ammunition for the stun gun (x10 per pack).', price: 60, icon: '🔋', pack: 10 },
  package: { name: 'Sealed Package', desc: 'Deliver it to Meridian Tower.', icon: '📦', mission: true },
  envelope: { name: "Mara's Envelope", desc: 'For Ines Vega. Do not open.', icon: '✉', mission: true },
  purse: { name: 'Recovered Purse', desc: 'Return it to the owner.', icon: '👛', mission: true },
};

export const SHOPS = {
  quikmart: { name: 'QuikMart 24/7', items: ['snack', 'coffee', 'energy', 'medkit', 'repairkit', 'stungun', 'charges'] },
  noodle: { name: "Mara's Noodle House", items: ['noodles', 'tea', 'snack'] },
};

export class Inventory {
  constructor() { this.money = 250; this.items = { snack: 2 }; }
  count(id) { return this.items[id] || 0; }
  add(id, n = 1) { this.items[id] = (this.items[id] || 0) + n; }
  remove(id, n = 1) { this.items[id] = Math.max(0, (this.items[id] || 0) - n); if (!this.items[id]) delete this.items[id]; }
  canAfford(p) { return this.money >= p; }
  spend(p) { if (this.money < p) return false; this.money -= p; return true; }
  earn(p) { this.money += p; }
  list() { return Object.entries(this.items).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n, ...ITEMS[id] })); }
  serialize() { return { money: this.money, items: { ...this.items } }; }
  load(d) { this.money = d.money; this.items = { ...d.items }; }
}
