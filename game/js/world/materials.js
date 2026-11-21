// Shared materials. Ground surfaces get a shader patch for rain: darkening,
// lower roughness, puddles and planar reflections (see environment.js).
import * as THREE from 'three';
import { Tex } from './textures.js';

export const WetUniforms = {
  uWet: { value: 0 },
  uReflectOn: { value: 0 },
  tReflect: { value: null },
  uReflectMatrix: { value: new THREE.Matrix4() },
  tPuddle: { value: null },
  uTime: { value: 0 },
};

/** Patch a MeshStandardMaterial with wetness + reflections. */
export function makeWet(material, { puddleScale = 0.045, localWet = 0, reflect = 1 } = {}) {
  material.userData.localWet = { value: localWet };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, WetUniforms);
    shader.uniforms.uLocalWet = material.userData.localWet;
    shader.uniforms.uPuddleScale = { value: puddleScale };
    shader.uniforms.uReflectAmt = { value: reflect };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uReflectMatrix;\nvarying vec4 vReflCoord;\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n{ vec4 wp = modelMatrix * vec4(transformed, 1.0); vWPos = wp.xyz; vReflCoord = uReflectMatrix * wp; }');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uWet; uniform float uLocalWet; uniform float uReflectOn; uniform float uPuddleScale; uniform float uReflectAmt; uniform float uTime;
uniform sampler2D tReflect; uniform sampler2D tPuddle;
varying vec4 vReflCoord; varying vec3 vWPos;
float gWet; float gPuddle;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
gWet = clamp(max(uWet, uLocalWet), 0.0, 1.0);
float pud = texture2D(tPuddle, vWPos.xz * uPuddleScale).r * 0.75 + texture2D(tPuddle, vWPos.xz * uPuddleScale * 0.31 + 0.37).r * 0.25;
gPuddle = smoothstep(1.05 - gWet * 0.75, 1.2 - gWet * 0.75, pud + 0.2) * gWet;
roughnessFactor = mix(roughnessFactor, 0.32, gWet * 0.75);
roughnessFactor = mix(roughnessFactor, 0.03, gPuddle);`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{ float w = clamp(max(uWet, uLocalWet), 0.0, 1.0); diffuseColor.rgb *= mix(1.0, 0.5, w * 0.85); }`)
      .replace('#include <opaque_fragment>', `
{
  vec3 V = normalize(vViewPosition);
  float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(normal, V), 0.0, 1.0), 5.0);
  float amt = (gPuddle * (0.35 + 0.65 * fres) + gWet * 0.45 * fres) * uReflectAmt;
  if (uReflectOn > 0.5 && amt > 0.001) {
    vec2 ruv = vReflCoord.xy / vReflCoord.w;
    float rip = sin(vWPos.x * 7.0 + uTime * 9.0) * cos(vWPos.z * 6.0 - uTime * 7.0);
    ruv += vec2(rip * 0.0025 * gWet, (1.0 - gPuddle) * 0.006 * rip);
    vec3 refl = texture2D(tReflect, ruv).rgb;
    outgoingLight = mix(outgoingLight, refl, clamp(amt, 0.0, 0.92));
  } else {
    outgoingLight *= 1.0 - amt * 0.3;
  }
}
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'wet' + puddleScale + reflect;
  return material;
}

const cache = {};
function m(key, f) { return cache[key] || (cache[key] = f()); }
const std = (p) => new THREE.MeshStandardMaterial(p);

export const Mats = {
  asphalt: () => m('asphalt', () => { const t = Tex.asphalt(); t.repeat.set(1, 1); return makeWet(std({ map: t, roughness: 0.92, metalness: 0, vertexColors: true })); }),
  asphaltLantern: () => m('asphaltL', () => makeWet(std({ map: Tex.asphalt(), roughness: 0.9, vertexColors: true }), { localWet: 0.75 })),
  sidewalk: () => m('sidewalk', () => makeWet(std({ map: Tex.sidewalk(), roughness: 0.85, vertexColors: true }), { puddleScale: 0.07, reflect: 0.6 })),
  sidewalkLantern: () => m('sidewalkL', () => makeWet(std({ map: Tex.paving(), roughness: 0.8, vertexColors: true }), { puddleScale: 0.07, localWet: 0.6, reflect: 0.7 })),
  paving: () => m('paving', () => makeWet(std({ map: Tex.paving(), roughness: 0.8, vertexColors: true }), { puddleScale: 0.06, reflect: 0.6 })),
  lane: () => m('lane', () => makeWet(std({ color: 0xffffff, roughness: 0.6, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { reflect: 0.5 })),
  grass: () => m('grass', () => std({ map: Tex.grass(), roughness: 1, vertexColors: true })),
  sand: () => m('sand', () => std({ map: Tex.sand(), roughness: 1, vertexColors: true })),
  terrain: () => m('terrain', () => std({ map: Tex.terrain(), roughness: 1, vertexColors: true })),
  concrete: () => m('concrete', () => std({ map: Tex.sidewalk(), roughness: 0.9, vertexColors: true })),
  paint: () => m('paint', () => std({ roughness: 0.8, vertexColors: true })),
  plastic: () => m('plastic', () => std({ roughness: 0.4, vertexColors: true })),
  fabric: () => m('fabric', () => std({ roughness: 1, vertexColors: true })),
  metal: () => m('metal', () => std({ roughness: 0.35, metalness: 0.8, vertexColors: true })),
  chrome: () => m('chrome', () => std({ roughness: 0.12, metalness: 1, vertexColors: true })),
  wood: () => m('wood', () => std({ map: Tex.wood(), roughness: 0.6, vertexColors: true })),
  woodFloor: () => m('woodFloor', () => { const t = Tex.wood(); return std({ map: t, roughness: 0.45, vertexColors: true }); }),
  marble: () => m('marble', () => std({ map: Tex.marble(), roughness: 0.15, vertexColors: true })),
  tiles: () => m('tiles', () => std({ map: Tex.tiles(), roughness: 0.25, vertexColors: true })),
  carpet: () => m('carpet', () => std({ map: Tex.carpet(), roughness: 1, vertexColors: true })),
  rug: () => m('rug', () => std({ map: Tex.rug(), roughness: 1, vertexColors: true })),
  brick: () => m('brick', () => std({ map: Tex.brick(), roughness: 0.9, vertexColors: true })),
  leaves: () => m('leaves', () => std({ roughness: 1, vertexColors: true, flatShading: true, envMapIntensity: 0.35 })),
  bark: () => m('bark', () => std({ roughness: 1, vertexColors: true })),
  glass: () => m('glass', () => new THREE.MeshPhysicalMaterial({ color: 0x9fb8c8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.28, vertexColors: true, depthWrite: false, side: THREE.DoubleSide })),
  darkGlass: () => m('darkGlass', () => std({ color: 0x223040, roughness: 0.06, metalness: 0.9, vertexColors: true })),
  water: () => m('water', () => std({ color: 0x1d4a5a, roughness: 0.05, metalness: 0.3, normalMap: Tex.oceanNormal(), normalScale: new THREE.Vector2(0.4, 0.4), vertexColors: true })),
  pool: () => m('pool', () => std({ color: 0x3fb7d8, roughness: 0.04, metalness: 0.1, normalMap: Tex.oceanNormal(), normalScale: new THREE.Vector2(0.25, 0.25), vertexColors: true, emissive: 0x0a3a48, emissiveIntensity: 0.6 })),
  // Self-lit surfaces (lamp bulbs, screens, neon). Brightness animated at night.
  glow: () => m('glow', () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })),
  lamp: () => m('lamp', () => new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 0, vertexColors: true, roughness: 0.4 })),
  neon: () => m('neon', () => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 2.5, vertexColors: true, roughness: 0.4 })),
  roof: () => m('roof', () => std({ map: Tex.sidewalk(), roughness: 0.95, vertexColors: true })),
  tileRoof: () => m('tileRoof', () => std({ roughness: 0.8, vertexColors: true, flatShading: true })),
};

/** Facade materials keyed by kind+seed, with night windows on the emissive map. */
const facadeCache = {};
export const nightMaterials = []; // {mat, base} emissiveIntensity scaled by night factor
export function facadeMat(kind, seed = 1) {
  const k = kind + seed;
  if (facadeCache[k]) return facadeCache[k];
  const t = Tex.facade(kind, seed);
  const glass = kind === 'glass';
  const mt = new THREE.MeshStandardMaterial({
    map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0,
    roughness: glass ? 0.08 : 0.85, metalness: glass ? 0.85 : 0.05, vertexColors: true,
  });
  nightMaterials.push({ mat: mt, base: glass ? 1.6 : 1.4 });
  return (facadeCache[k] = mt);
}
export function storefrontMat(seed = 1) {
  const k = 'store' + seed;
  if (facadeCache[k]) return facadeCache[k];
  const t = Tex.storefront(seed);
  const mt = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.2, metalness: 0.4, vertexColors: true });
  nightMaterials.push({ mat: mt, base: 1.4, min: 0.25 });
  return (facadeCache[k] = mt);
}
const signCache = {};
export function signMat(text, opts = {}) {
  const k = text + JSON.stringify(opts);
  if (signCache[k]) return signCache[k];
  const t = Tex.sign(text, opts);
  const mt = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: opts.neon ? 1.2 : 0.3, roughness: 0.5 });
  nightMaterials.push({ mat: mt, base: opts.neon ? 2.6 : 1.0, min: opts.neon ? 0.9 : 0.25, flicker: opts.neon && Math.random() < 0.15 });
  return (signCache[k] = mt);
}
