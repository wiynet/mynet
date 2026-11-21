// World layout constants shared by city generation, traffic, pedestrians,
// minimap and missions. Coordinates are meters; +x east, +z south.
import { smoothstep, fbm, clamp } from '../core/utils.js';

export const LINES = [-270, -180, -90, 0, 90, 180, 270];
export const ROAD_HALF = 7;        // asphalt half width (2 lanes each way)
export const SIDEWALK = 3.5;
export const CURB = ROAD_HALF + SIDEWALK; // 10.5: block buildable edge from road center
export const LANE_OFFSETS = [1.9, 5.2];
export const STOP_DIST = 11;       // stop line distance from intersection center
export const CITY_MIN = -277, CITY_MAX = 277; // asphalt extent
export const WORLD = { minX: -480, maxX: 480, minZ: -690, maxZ: 470 };
export const SEA_LEVEL = -0.6;

// District map indexed [j][i] (rows north->south, columns west->east)
export const DISTRICTS = [
  ['lantern', 'lantern', 'downtown', 'downtown', 'apartments', 'apartments'],
  ['lantern', 'lantern', 'downtown', 'downtown', 'downtown', 'apartments'],
  ['apartments', 'shops', 'downtown', 'plaza', 'shops', 'apartments'],
  ['houses', 'shops', 'park', 'parking', 'shops', 'houses'],
  ['houses', 'houses', 'park', 'houses', 'houses', 'houses'],
  ['beach', 'beach', 'beach', 'beach', 'beach', 'beach'],
];
export const DISTRICT_NAMES = {
  lantern: 'Lantern Row', downtown: 'Downtown Meridian', apartments: 'Old Harbor Flats', shops: 'Bayview Avenue',
  plaza: 'Solara Plaza', park: 'Greenway Park', parking: 'Bayview Parking', houses: 'Palm Grove',
  beach: 'Ocean Drive', hills: 'Mirador Heights', outskirts: 'Sierra Flats', sea: 'Solara Bay',
};

export function blockAt(x, z) {
  let i = -1, j = -1;
  for (let k = 0; k < 6; k++) { if (x >= LINES[k] && x < LINES[k + 1]) i = k; if (z >= LINES[k] && z < LINES[k + 1]) j = k; }
  return { i, j };
}
export function districtAt(x, z) {
  if (z < -285) return 'hills';
  if (z > 292) return z > 340 ? 'sea' : 'beach';
  if (Math.abs(x) > 285) return 'outskirts';
  const { i, j } = blockAt(x, z);
  if (i < 0 || j < 0) return 'downtown';
  // Lantern Row is really the street: z=-180 between x -270..-90
  return DISTRICTS[j][i];
}

// ---- Hill road up to Mirador Heights (villa) ----
export const VILLA = { x: 0, z: -575, y: 34, hx: 42, hz: 36 };
export const HILL_ROAD = { z0: -277, z1: -540, width: 12 };
export function hillRoadX(z) {
  const t = clamp((HILL_ROAD.z0 - z) / (HILL_ROAD.z0 - HILL_ROAD.z1), 0, 1);
  return 22 * Math.sin(t * Math.PI);
}
export function hillRoadY(z) { return VILLA.y * smoothstep(-290, -530, z); }

/** Analytic ground height (meters). The terrain mesh is built from this. */
export function terrainHeight(x, z) {
  const ax = Math.abs(x);
  if (ax <= 288 && z >= -288 && z <= 290) return 0;
  let h = 0;
  // North: a valley climbs gently to the villa crest (clear view of the city),
  // hills rise on both sides and mountains behind.
  const north = smoothstep(-288, -400, z);
  const valley = smoothstep(-290, -545, z) * 30 + fbm(x * 0.02, z * 0.02, 2) * 5 * north;
  const flank = smoothstep(35, 230, ax);
  const hills = north * flank * (22 + fbm(x * 0.008 + 3, z * 0.008, 4) * 48);
  const back = smoothstep(-610, -700, z) * (35 + fbm(x * 0.006, z * 0.006 + 5, 3) * 40);
  h += z < -288 ? valley + hills + back : 0;
  // East / west rolling hills
  const side = smoothstep(290, 470, ax) * (z < 300 ? 1 : 0.2);
  h = Math.max(h, side * (8 + fbm(x * 0.01, z * 0.01 + 9, 4) * 26));
  h += (1 - north) * smoothstep(288, 320, ax) * fbm(x * 0.03, z * 0.03, 3) * 2.5 * (z < 290 ? 1 : 0);
  // Beach slopes into the sea
  if (z > 290) {
    const beach = 0.15 - smoothstep(290, 380, z) * 5.5;
    h = Math.min(h + 0.15, beach) + (ax > 300 ? smoothstep(300, 470, ax) * 12 * (1 - smoothstep(300, 420, z)) : 0);
  }
  // Flatten under the hill road and the villa pad
  if (z < -280 && z > -560) {
    const rx = hillRoadX(z), d = Math.abs(x - rx);
    const k = 1 - smoothstep(HILL_ROAD.width / 2 + 1, HILL_ROAD.width / 2 + 14, d);
    h = h * (1 - k) + hillRoadY(z) * k;
  }
  const dx = Math.max(0, Math.abs(x - VILLA.x) - VILLA.hx), dz = Math.max(0, Math.abs(z - VILLA.z) - VILLA.hz);
  const dv = Math.sqrt(dx * dx + dz * dz);
  if (dv < 22) { const k = 1 - smoothstep(0, 22, dv); h = h * (1 - k) + VILLA.y * k; }
  return h;
}

// ---- Points of interest (used by missions, map blips, spawns) ----
export const POI = {
  safehouse: { x: 132, z: 105, name: 'Safehouse' },
  spawn: { x: 132, z: 103 },
  noodle: { x: -150, z: -171, name: "Mara's Noodle House" },
  quikmart: { x: -140, z: 8.5, name: 'QuikMart 24/7' },
  clothing: { x: -120, z: -8.5, name: 'Thread & Co.' },
  tower: { x: -45, z: -98.5, name: 'Meridian Tower' },
  garage: { x: 64, z: 30, name: 'Fix & Go Garage' },
  parking: { x: 45, z: 45, name: 'Bayview Parking' },
  villa: { x: 8, z: -582, name: 'Vega Villa' },
  overlook: { x: 30, z: -548, name: 'Mirador Overlook' },
  hospital: { x: -225, z: -6, name: 'St. Clara Clinic' },
  police: { x: 225, z: -96, name: 'Police Station' },
  pier: { x: 120, z: 300, name: 'Solara Pier' },
};
