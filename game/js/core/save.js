// Save slots (localStorage) and persistent settings.
const KEY = 'solara_save_';
const SETTINGS_KEY = 'solara_settings_v1';

function store() { try { const s = window.localStorage; s.getItem('x'); return s; } catch (_) { return null; } }
const mem = {};

export const SaveSystem = {
  slots: ['auto', '1', '2', '3'],
  write(slot, data) {
    const s = store(), txt = JSON.stringify({ ...data, savedAt: Date.now(), version: 1 });
    try { if (s) s.setItem(KEY + slot, txt); else mem[slot] = txt; return true; } catch (_) { mem[slot] = txt; return false; }
  },
  read(slot) {
    const s = store();
    let txt = null;
    try { txt = s ? s.getItem(KEY + slot) : mem[slot]; } catch (_) { txt = mem[slot]; }
    if (!txt) return null;
    try { return JSON.parse(txt); } catch (_) { return null; }
  },
  remove(slot) { const s = store(); try { if (s) s.removeItem(KEY + slot); } catch (_) { /* ignore */ } delete mem[slot]; },
  latest() {
    let best = null;
    for (const sl of this.slots) { const d = this.read(sl); if (d && (!best || d.savedAt > best.data.savedAt)) best = { slot: sl, data: d }; }
    return best;
  },
};

export const DEFAULT_SETTINGS = {
  preset: 'high', resScale: 1, shadows: 'high', reflections: 'half', bloom: true, aa: true, viewDistance: 1,
  traffic: 26, peds: 34, sens: 1, invertY: false, fov: 62, shake: true,
  master: 0.8, sfx: 0.9, music: 0.5, ambient: 0.7, timeScale: 1, hud: true, subtitles: true, weather: 'dynamic', fps: false,
};
export const PRESETS = {
  low: { resScale: 0.6, shadows: 'off', reflections: 'off', bloom: false, aa: false, viewDistance: 0.6, traffic: 14, peds: 18 },
  medium: { resScale: 0.8, shadows: 'low', reflections: 'off', bloom: true, aa: false, viewDistance: 0.8, traffic: 20, peds: 26 },
  high: { resScale: 1, shadows: 'high', reflections: 'half', bloom: true, aa: true, viewDistance: 1, traffic: 26, peds: 34 },
  ultra: { resScale: 1, shadows: 'ultra', reflections: 'full', bloom: true, aa: true, viewDistance: 1.4, traffic: 32, peds: 44 },
};
export function loadSettings() {
  const s = store();
  try { const t = s && s.getItem(SETTINGS_KEY); if (t) return { ...DEFAULT_SETTINGS, ...JSON.parse(t) }; } catch (_) { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}
export function saveSettings(v) { const s = store(); try { if (s) s.setItem(SETTINGS_KEY, JSON.stringify(v)); } catch (_) { /* ignore */ } }
