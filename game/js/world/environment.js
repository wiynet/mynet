// Sky, sun/moon, clouds, stars, fog, weather (rain/storm/fog), wet streets with
// planar reflections, the day-night cycle and a pooled set of dynamic lights.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp, lerp, smoothstep } from '../core/utils.js';
import { WetUniforms, Mats, nightMaterials } from './materials.js';
import { Tex } from './textures.js';

export const WEATHERS = {
  clear: { cloud: 0.12, rain: 0, fog: 0, overcast: 0, label: 'Clear', icon: '☀' },
  cloudy: { cloud: 0.55, rain: 0, fog: 0.1, overcast: 0.35, label: 'Cloudy', icon: '☁' },
  rain: { cloud: 0.85, rain: 0.75, fog: 0.35, overcast: 0.8, label: 'Rain', icon: '🌧' },
  storm: { cloud: 1.0, rain: 1.0, fog: 0.45, overcast: 1.0, label: 'Storm', icon: '⛈' },
  foggy: { cloud: 0.5, rain: 0, fog: 1.0, overcast: 0.6, label: 'Fog', icon: '🌫' },
};

const POOL = 8;

export class Environment {
  constructor(world, renderer, scene) {
    this.world = world; this.renderer = renderer; this.scene = scene;
    this.hour = 17.2; this.timeScale = 1; // game minutes per real second
    this.day = 1;
    this.weather = 'clear'; this.weatherLocked = false;
    this.cur = { ...WEATHERS.clear };
    this.wetness = 0; this.nextWeatherChange = 6 + Math.random() * 8; // game hours
    this.flash = 0; this.nextLightning = 5;
    this.viewDistance = 1;
    this.reflections = 'half';
    this.sunDir = new THREE.Vector3(); this.moonDir = new THREE.Vector3();
    this.nightF = 0; this.dayF = 1;
    this._envTimer = 0; this._envKey = '';

    // --- sky (patched with clouds, stars and moon)
    this.sky = new Sky(); this.sky.scale.setScalar(4500);
    this.patchSky(this.sky.material);
    scene.add(this.sky);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky(); this.envSky.scale.setScalar(100); this.envSky.material = this.sky.material; this.envScene.add(this.envSky);
    const groundEnv = new THREE.Mesh(new THREE.CircleGeometry(90, 16), new THREE.MeshBasicMaterial({ color: 0x404040 }));
    groundEnv.rotation.x = -Math.PI / 2; groundEnv.position.y = -2; this.envScene.add(groundEnv); this.groundEnv = groundEnv;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;

    // --- lights
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a4036, 1); scene.add(this.hemi);
    this.pool = [];
    for (let i = 0; i < POOL; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 2); l.castShadow = false; scene.add(l); this.pool.push({ light: l, anchor: null }); }
    this.poolTimer = 0;

    scene.fog = new THREE.Fog(0x9fb4c8, 150, 1400);

    // --- rain streaks around the camera
    this.rain = this.makeRain(); scene.add(this.rain);
    // reflections
    this.reflRT = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType });
    this.reflCam = new THREE.PerspectiveCamera();
    WetUniforms.tReflect.value = this.reflRT.texture;
    WetUniforms.tPuddle.value = Tex.puddles();
    this.wetMeshes = null;
  }

  patchSky(mtl) {
    mtl.uniforms.skyScale = { value: 1 };
    mtl.uniforms.cloudCover = { value: 0.2 };
    mtl.uniforms.cloudTime = { value: 0 };
    mtl.uniforms.cloudColor = { value: new THREE.Color(1, 1, 1) };
    mtl.uniforms.nightF = { value: 0 };
    mtl.uniforms.overcast = { value: 0 };
    mtl.uniforms.flash = { value: 0 };
    mtl.uniforms.moonDir = { value: new THREE.Vector3(0, 1, 0) };
    mtl.fragmentShader = mtl.fragmentShader
      .replace('uniform vec3 up;', `uniform vec3 up;
uniform float skyScale; uniform float cloudCover; uniform float cloudTime; uniform vec3 cloudColor; uniform float nightF; uniform float overcast; uniform float flash; uniform vec3 moonDir;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1.,0.)),u.x), mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),u.x), u.y); }
float fbm5(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.03; a*=.5;} return s; }`)
      .replace('gl_FragColor = vec4( retColor, 1.0 );', `
vec3 col = retColor * skyScale;
if (direction.y > 0.0) {
  vec3 d = direction * 380.0; vec3 cell = floor(d);
  float st = h21(cell.xy * 0.37 + cell.z * 7.13);
  float star = step(0.9975, st) * smoothstep(0.02, 0.25, direction.y) * (0.6 + 0.4 * sin(cloudTime * 3.0 + st * 100.0));
  col += vec3(0.9, 0.95, 1.0) * star * nightF * (1.0 - cloudCover) * 1.2;
}
float md = dot(direction, moonDir);
col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.99955, 0.99975, md) * 1.6 + pow(max(md, 0.0), 300.0) * 0.25) * nightF * (1.0 - cloudCover * 0.8);
if (direction.y > -0.02) {
  vec2 cuv = direction.xz / (direction.y + 0.1) * 0.55 + vec2(cloudTime * 0.012, cloudTime * 0.005);
  float n = fbm5(cuv * 1.4);
  float c = smoothstep(1.0 - cloudCover - 0.08, 1.0 - cloudCover + 0.32, n) * smoothstep(-0.02, 0.15, direction.y);
  float lit = 0.55 + 0.45 * fbm5(cuv * 1.4 + 3.7);
  vec3 cc = cloudColor * lit * (1.0 - overcast * 0.35);
  cc += cloudColor * pow(max(cosTheta, 0.0), 6.0) * 0.6 * (1.0 - overcast);
  col = mix(col, cc, c * 0.96);
}
col = mix(col, cloudColor * 0.8, overcast * 0.85 * smoothstep(0.6, -0.05, direction.y));
col += vec3(0.8, 0.85, 1.0) * flash;
gl_FragColor = vec4( col, 1.0 );`);
    mtl.needsUpdate = true;
  }

  makeRain() {
    const N = 7000, pos = new Float32Array(N * 2 * 3), end = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = Math.random() * 70 - 35, y = Math.random() * 30, z = Math.random() * 70 - 35;
      for (let e = 0; e < 2; e++) { const k = (i * 2 + e); pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; end[k] = e; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.rainU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uI: { value: 0 }, uWind: { value: new THREE.Vector2(2, 1) }, uColor: { value: new THREE.Color(0.7, 0.75, 0.85) } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.rainU, transparent: true, depthWrite: false,
      vertexShader: `uniform float uTime; uniform vec3 uCam; uniform float uI; uniform vec2 uWind; attribute float aEnd; varying float vA;
        void main(){
          vec3 p = position;
          float speed = 22.0;
          p.y = mod(p.y - uTime * speed, 30.0);
          p.x = mod(p.x + uWind.x * uTime - uCam.x + 35.0, 70.0) - 35.0;
          p.z = mod(p.z + uWind.y * uTime - uCam.z + 35.0, 70.0) - 35.0;
          vec3 w = vec3(p.x + uCam.x, p.y + uCam.y - 10.0, p.z + uCam.z);
          w += aEnd * vec3(uWind.x, -speed, uWind.y) * 0.045;
          float keep = step(fract(position.x * 13.7 + position.z * 7.1), uI);
          vA = keep * (0.15 + 0.25 * (1.0 - aEnd));
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(uColor, vA); }`,
    });
    const l = new THREE.LineSegments(g, m); l.frustumCulled = false; l.renderOrder = 5;
    return l;
  }

  setWeather(type, instant = false) {
    if (!WEATHERS[type]) return;
    this.weather = type;
    if (instant) { this.cur = { ...WEATHERS[type] }; if (type === 'rain' || type === 'storm') this.wetness = 0.85; }
  }
  setHour(h) { this.hour = ((h % 24) + 24) % 24; this._envKey = ''; }
  get clock() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  update(dt, focus, camera, indoorCam) {
    // --- time
    const prevHour = this.hour;
    this.hour += (dt * this.timeScale * (this.timeMul != null ? this.timeMul : 1)) / 60;
    if (this.hour >= 24) { this.hour -= 24; this.day++; }
    // --- weather transitions
    if (!this.weatherLocked) {
      this.nextWeatherChange -= (dt * this.timeScale) / 60;
      if (this.nextWeatherChange <= 0) {
        const r = Math.random();
        this.weather = r < 0.42 ? 'clear' : r < 0.66 ? 'cloudy' : r < 0.84 ? 'rain' : r < 0.93 ? 'storm' : 'foggy';
        this.nextWeatherChange = 5 + Math.random() * 10;
      }
    }
    const tgt = WEATHERS[this.weather], k = 1 - Math.exp(-dt / 12);
    for (const key of ['cloud', 'rain', 'fog', 'overcast']) this.cur[key] = lerp(this.cur[key], tgt[key], k);
    // wetness rises in rain, dries slowly
    if (this.cur.rain > 0.1) this.wetness = Math.min(1, this.wetness + dt * 0.05 * this.cur.rain);
    else this.wetness = Math.max(0, this.wetness - dt * 0.004 * (this.dayF + 0.2));
    WetUniforms.uWet.value = this.wetness;
    WetUniforms.uTime.value += dt;

    // --- sun & moon
    const t = ((this.hour - 6) / 12) * Math.PI;
    this.sunDir.set(Math.cos(t), Math.sin(t) * 0.86, 0.42).normalize();
    this.moonDir.set(-Math.cos(t) * 0.8, Math.max(0.25, -Math.sin(t) * 0.8), -0.3).normalize();
    const sy = this.sunDir.y;
    this.dayF = smoothstep(-0.06, 0.22, sy);
    this.nightF = 1 - smoothstep(-0.12, 0.06, sy);
    const golden = smoothstep(0.35, 0.02, sy) * smoothstep(-0.1, 0.03, sy);
    const cloud = this.cur.cloud, oc = this.cur.overcast;

    const su = this.sky.material.uniforms;
    su.sunPosition.value.copy(this.sunDir).multiplyScalar(4000);
    su.turbidity.value = lerp(lerp(2.4, 7, golden), 10, oc);
    su.rayleigh.value = lerp(0.9, 3.2, golden) * (1 - oc * 0.5);
    su.mieCoefficient.value = lerp(0.0025, 0.006, golden) + oc * 0.01;
    su.mieDirectionalG.value = 0.78;
    su.skyScale.value = lerp(0.6, 0.38, oc) * (1 - this.nightF * 0.4);
    su.cloudCover.value = cloud; su.cloudTime.value += dt * (1 + oc * 2);
    su.nightF.value = this.nightF; su.overcast.value = oc; su.moonDir.value.copy(this.moonDir);
    const cc = su.cloudColor.value;
    cc.setRGB(1, 1, 1).lerp(new THREE.Color(1.0, 0.62, 0.38), golden * (1 - oc * 0.6)).multiplyScalar(lerp(0.02, 0.95, this.dayF) * lerp(1, 0.55, oc));
    if (this.nightF > 0) cc.lerp(new THREE.Color(0.035, 0.04, 0.06), this.nightF * 0.85);

    // lightning
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.weather === 'storm' && this.cur.rain > 0.7) {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0) {
        this.flash = 1.2; this.nextLightning = 6 + Math.random() * 14;
        setTimeout(() => this.world.audio.thunder(), 600 + Math.random() * 1800);
      }
    }
    su.flash.value = this.flash * 0.25;

    // --- direct light
    const sunUp = sy > -0.02;
    const dir = sunUp ? this.sunDir : this.moonDir;
    const lightCol = new THREE.Color(1, 0.97, 0.92).lerp(new THREE.Color(1, 0.55, 0.3), golden);
    if (!sunUp) lightCol.setRGB(0.55, 0.65, 0.95);
    const sunI = sunUp ? 3.4 * smoothstep(-0.02, 0.12, sy) * (1 - oc * 0.82) : 0.6 * (1 - oc * 0.7);
    this.sun.color.copy(lightCol); this.sun.intensity = sunI + this.flash * 2;
    // follow focus, snap to shadow texel grid to avoid shimmering
    const texel = 150 / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + dir.x * 250, focus.y + dir.y * 250, fz + dir.z * 250);
    this.sun.target.updateMatrixWorld();
    // hemisphere ambient
    const skyAmb = new THREE.Color(0.62, 0.74, 0.95).lerp(new THREE.Color(0.9, 0.7, 0.6), golden).lerp(new THREE.Color(0.6, 0.63, 0.68), oc);
    skyAmb.lerp(new THREE.Color(0.32, 0.38, 0.6), this.nightF);
    this.hemi.color.copy(skyAmb);
    this.hemi.groundColor.setRGB(0.32, 0.28, 0.24).lerp(new THREE.Color(0.08, 0.07, 0.09), this.nightF);
    this.hemi.intensity = lerp(0.6, 1.25, this.dayF) * lerp(1, 0.85, oc) + this.flash * 1.5 + this.nightF * 0.5;

    // --- fog
    const fogCol = new THREE.Color(0.56, 0.68, 0.82).lerp(new THREE.Color(0.8, 0.55, 0.42), golden * (1 - oc)).lerp(new THREE.Color(0.48, 0.52, 0.56), oc * 0.9);
    fogCol.lerp(new THREE.Color(0.025, 0.03, 0.05), this.nightF * 0.92);
    if (indoorCam) fogCol.multiplyScalar(0.6);
    this.scene.fog.color.copy(fogCol);
    const fogAmt = Math.max(this.cur.fog, this.cur.rain * 0.4);
    const vd = this.viewDistance;
    this.scene.fog.near = lerp(280, 12, fogAmt) * vd;
    this.scene.fog.far = lerp(2300, 240, fogAmt) * vd;
    this.renderer.toneMappingExposure = lerp(0.78, 0.72, this.dayF) + this.nightF * 0.18;

    // --- rain particles
    const rainVisible = this.cur.rain > 0.02 && !indoorCam;
    this.rain.visible = rainVisible;
    this.rainU.uTime.value += dt; this.rainU.uCam.value.copy(camera.position); this.rainU.uI.value = this.cur.rain;
    this.rainU.uColor.value.setRGB(0.6, 0.65, 0.75).multiplyScalar(lerp(0.35, 1, this.dayF) + this.nightF * 0.3);

    // --- night emissives
    const nf = this.nightF;
    const dusk = Math.max(nf, oc * 0.5 * (1 - this.dayF * 0.5));
    for (const nm of nightMaterials) {
      let v = Math.max(nm.min || 0, nm.base * Math.max(nf, oc * 0.35));
      if (nm.flicker && Math.random() < 0.04) v *= 0.2;
      nm.mat.emissiveIntensity = v;
    }
    Mats.lamp().emissiveIntensity = 3.2 * smoothstep(0.1, 0.7, dusk);
    this.world.lanternMat.emissiveIntensity = 0.9 + 2.2 * dusk;
    this.world.glowDecalMat.opacity = 0.55 * smoothstep(0.2, 0.8, dusk);
    this.world.beaconMat.emissiveIntensity = (Math.sin(performance.now() * 0.004) > 0.3 ? 4 : 0.2) * (0.3 + nf);
    if (this.world.oceanTime) this.world.oceanTime.value += dt;

    // --- dynamic light pool
    this.poolTimer -= dt;
    if (this.poolTimer <= 0) { this.poolTimer = 0.3; this.assignLights(focus, dusk); }
    for (const p of this.pool) if (p.anchor && p.anchor.flicker) p.light.intensity = p.base * (0.85 + Math.random() * 0.3);

    // --- environment map (PMREM) refresh when the look changed
    this._envTimer -= dt;
    const key = Math.round(this.hour * 6) + '|' + Math.round(oc * 10) + '|' + Math.round(cloud * 10);
    if (this._envTimer <= 0 && key !== this._envKey) {
      this._envTimer = 1.5; this._envKey = key;
      this.groundEnv.material.color.copy(fogCol).multiplyScalar(0.6);
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 500);
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt; this.scene.environment = rt.texture;
      this.scene.environmentIntensity = lerp(0.12, 1.0, this.dayF) * lerp(1, 0.7, oc);
    }
  }

  assignLights(focus, dusk) {
    const anchors = this.world.lightAnchors;
    const cand = [];
    for (const a of anchors) {
      if (!a.indoor && dusk < 0.15) continue;
      const d = (a.pos.x - focus.x) ** 2 + (a.pos.z - focus.z) ** 2 + ((a.pos.y - focus.y) * 2) ** 2;
      if (d > 70 * 70) continue;
      cand.push([d - (a.indoor ? 200 : 0), a]);
    }
    cand.sort((x, y) => x[0] - y[0]);
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i], c = cand[i];
      if (!c) { p.light.intensity = 0; p.anchor = null; continue; }
      const a = c[1];
      p.anchor = a; p.light.position.copy(a.pos); p.light.color.setHex(a.color);
      p.light.distance = a.distance; p.base = a.intensity * (a.indoor ? 1 : smoothstep(0.15, 0.7, dusk));
      p.light.intensity = p.base;
    }
  }

  /** Render the mirrored scene for wet-ground reflections. */
  renderReflection(camera, enabledHint) {
    const on = this.reflections !== 'off' && enabledHint;
    WetUniforms.uReflectOn.value = on ? 1 : 0;
    if (!on) return;
    const r = this.renderer;
    const scale = this.reflections === 'full' ? 0.6 : 0.33;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(64, Math.floor(size.x * scale)), h = Math.max(64, Math.floor(size.y * scale));
    if (this.reflRT.width !== w || this.reflRT.height !== h) this.reflRT.setSize(w, h);
    if (!this.wetMeshes) this.wetMeshes = this.world.batcher.meshes.filter((m) => m.material.userData && m.material.userData.localWet);
    const vc = this.reflCam;
    // mirror across y = 0
    camera.updateMatrixWorld();
    vc.position.copy(camera.position); vc.position.y = -vc.position.y;
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).add(camera.position);
    look.y = -look.y;
    vc.up.set(0, -1, 0).applyQuaternion(new THREE.Quaternion()).set(0, 1, 0);
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion); camUp.y = -camUp.y;
    vc.up.copy(camUp);
    vc.lookAt(look);
    vc.fov = camera.fov; vc.aspect = camera.aspect; vc.near = camera.near; vc.far = camera.far * 0.6;
    vc.updateProjectionMatrix(); vc.updateMatrixWorld();
    const tm = WetUniforms.uReflectMatrix.value;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(vc.projectionMatrix); tm.multiply(vc.matrixWorldInverse);
    // oblique clip plane at y=0
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0).applyMatrix4(vc.matrixWorldInverse);
    const cp = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = vc.projectionMatrix, q = new THREE.Vector4();
    q.x = (Math.sign(cp.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(cp.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1; q.w = (1 + pm.elements[10]) / pm.elements[14];
    cp.multiplyScalar(2 / cp.dot(q));
    pm.elements[2] = cp.x; pm.elements[6] = cp.y; pm.elements[10] = cp.z + 1 - 0.003; pm.elements[14] = cp.w;
    for (const m of this.wetMeshes) m.visible = false;
    const rainVis = this.rain.visible; this.rain.visible = false;
    const shadowAuto = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.reflRT); r.clear(); r.render(this.scene, vc);
    r.setRenderTarget(prev);
    r.shadowMap.autoUpdate = shadowAuto;
    this.rain.visible = rainVis;
    for (const m of this.wetMeshes) m.visible = true;
  }
}
