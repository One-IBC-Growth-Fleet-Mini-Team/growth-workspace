// Lõi Command Center 3D (spec command-center-3d mục 1, 6; D-93): phòng lab beige, bệ đỡ xoay 360°, Mi1 bên trái
// (tối đa 1/3 màn hình desktop, phía trên khi điện thoại), đọc /command/data.json mỗi 5 giây. Các phần khác (vệ tinh,
// thuyền viên, màn hình tường, thanh động tác) gắn vào qua ctx. Không có số liệu nào ngoài payload của server.
import * as THREE from '../vendor/three/three.module.min.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from '../vendor/three/addons/environments/RoomEnvironment.js';

const $ = (s) => document.querySelector(s);
export const ctx = { THREE, data: null, ticks: [], onData: [], onLayout: [], narrow: false, mi1: null, quality: 1 };

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
$('#stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const LAB = new THREE.Color('#E4DBCD');
scene.background = LAB;
scene.fog = new THREE.Fog(LAB, 14, 32);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xfff7ec, 0xb9ab95, 0.9));
const key = new THREE.DirectionalLight(0xfff1df, 1.6); key.position.set(3, 6, 5); scene.add(key);
const rim = new THREE.DirectionalLight(0xdbeeff, 0.7); rim.position.set(-4, 3, -4); scene.add(rim);
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 90);
Object.assign(ctx, { scene, camera, renderer });

// Vật liệu: ceramic beige, carbon (vân dệt vẽ bằng canvas), đèn LED.
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const carbon = (rx, ry) => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#1b1c1e'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) { g.fillStyle = ((x + y) / 8) % 2 ? '#2a2c2f' : '#34363a'; g.fillRect(x + 0.5, y + 0.5, 7, 7); }
}, [rx, ry]);
export const M = {
  ceramic: new THREE.MeshPhysicalMaterial({ color: 0xf1ebe1, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.18 }),
  floor: new THREE.MeshStandardMaterial({ color: 0xdcd2c2, roughness: 0.62 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xe2d9ca, roughness: 0.95, side: THREE.BackSide }),
  carbon: new THREE.MeshPhysicalMaterial({ map: carbon(2, 6), roughness: 0.42, metalness: 0.25, clearcoat: 1 }),
  led: new THREE.MeshStandardMaterial({ color: 0x8fd3ff, emissive: 0x3fa9f5, emissiveIntensity: 2.2 }),
  slat: new THREE.MeshStandardMaterial({ color: 0xfffaf2, emissive: 0xfff3e2, emissiveIntensity: 1.1 }),
  ring: new THREE.MeshBasicMaterial({ color: 0x1d1e20, transparent: true, opacity: 0.14 }),
};
ctx.M = M;

// Phòng lab: sàn, tường cong, thanh đèn và cột carbon.
const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 96), M.floor); floor.rotation.x = -Math.PI / 2; scene.add(floor);
const wall = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 8, 96, 1, true, Math.PI * 0.58, Math.PI * 0.84), M.wall); wall.position.y = 4; scene.add(wall);
for (let i = 0; i < 13; i++) {
  const a = Math.PI * 0.5 + (i - 6) * 0.12, isCarbon = i % 4 === 2;
  const m = new THREE.Mesh(isCarbon ? new THREE.BoxGeometry(0.55, 5.2, 0.06) : new THREE.BoxGeometry(0.07, 5.6, 0.04), isCarbon ? M.carbon : M.slat);
  m.position.set(Math.cos(a) * 10.85, isCarbon ? 2.8 : 3, -Math.sin(a) * 10.85); m.lookAt(0, m.position.y, 0); scene.add(m);
}

// Bệ đỡ: ceramic, viền LED; kéo để xoay cả bệ và Mi1.
const base = new THREE.Group(); scene.add(base);
const turntable = new THREE.Group(); base.add(turntable);
[1.0, 1.9].forEach((r) => { const m = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.01, 140), M.ring); m.rotation.x = -Math.PI / 2; m.position.y = 0.003; base.add(m); });
const top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.1, 64), M.ceramic); top.position.y = 0.05; turntable.add(top);
const ledRing = new THREE.Mesh(new THREE.TorusGeometry(0.625, 0.005, 8, 100), M.led); ledRing.rotation.x = Math.PI / 2; ledRing.position.y = 0.102; turntable.add(ledRing);
const notch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.014, 0.03), M.led); notch.position.set(0, 0.104, 0.6); turntable.add(notch);
Object.assign(ctx, { base, turntable });

// Bố cục: desktop Mi1 ở 1/3 bên trái; điện thoại Mi1 ở trên, giữa.
const cam = { dist: 7.4, fov: 32, ty: 1.05 };
export function halfWidthAt(z) { return (cam.dist - z) * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * camera.aspect; }
function layout() {
  ctx.narrow = innerWidth <= 760;
  cam.fov = ctx.narrow ? 42 : 32; cam.dist = ctx.narrow ? 7.9 : 7.4; cam.ty = ctx.narrow ? 0.35 : 1.05;
  camera.fov = cam.fov; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  camera.position.set(0, cam.ty + 0.45, cam.dist); camera.lookAt(0, cam.ty, 0);
  renderer.setSize(innerWidth, innerHeight);
  // Điện thoại: Mi1 nửa trái, màn hình tiến trình nửa phải (spec mục 1).
  base.position.set((ctx.narrow ? -0.42 : -0.64) * halfWidthAt(0), ctx.narrow ? 0.2 : 0, 0);
  for (const f of ctx.onLayout) f();
}
addEventListener('resize', layout);
layout();

// Kéo chuột hoặc vuốt để xoay 360°, có quán tính.
const spin = { v: 0, down: false, x: 0, moved: 0 };
const el = renderer.domElement;
el.addEventListener('pointerdown', (e) => { spin.down = true; spin.x = e.clientX; spin.moved = 0; el.setPointerCapture(e.pointerId); });
el.addEventListener('pointermove', (e) => { if (!spin.down) return; const dx = e.clientX - spin.x; spin.x = e.clientX; spin.moved += Math.abs(dx); turntable.rotation.y += dx * 0.01; spin.v = dx * 0.01; });
el.addEventListener('pointerup', () => { spin.down = false; });
ctx.dragMoved = () => spin.moved > 6;

// Mi1: nạp file .glb của app; lỗi thì hiện ảnh tĩnh dự phòng, bản rút gọn vẫn đọc được.
export const mi1Ready = new Promise((resolve) => {
  new GLTFLoader().load('/static/command3d/mi1.glb', (gltf) => {
    const root = gltf.scene;
    // Đo theo xương (precise = true) như prototype; mesh có skin đo theo hình gốc sẽ ra sai tỉ lệ.
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root, true);
    root.scale.setScalar(1.75 / ((box.max.y - box.min.y) || 1));
    root.updateMatrixWorld(true);
    root.position.y = 0.1 - new THREE.Box3().setFromObject(root, true).min.y;
    root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    turntable.add(root);
    const mixer = new THREE.AnimationMixer(root);
    const actions = Object.fromEntries(gltf.animations.map((c) => [c.name, mixer.clipAction(c)]));
    const bones = {}; root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    ctx.mi1 = { root, mixer, actions, bones, gltf, current: null };
    play('Idle');
    $('#loading').hidden = true;
    resolve(ctx.mi1);
  }, undefined, () => { $('#loading').hidden = true; $('#fallback').hidden = false; resolve(null); });
});

// Phát animation; once = chạy một lần rồi về Idle.
export function play(name, { once = false, fade = 0.35 } = {}) {
  const m = ctx.mi1; if (!m || !m.actions[name]) return Promise.resolve();
  const next = m.actions[name];
  next.reset(); next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); next.clampWhenFinished = once;
  if (m.current && m.current !== next) m.current.crossFadeTo(next, fade, false);
  next.play(); m.current = next;
  if (!once) return Promise.resolve();
  return new Promise((res) => { const f = (e) => { if (e.action === next) { m.mixer.removeEventListener('finished', f); res(); } }; m.mixer.addEventListener('finished', f); });
}
ctx.play = play;

// Dữ liệu: cùng /command/data.json với bản phẳng.
async function poll() {
  try {
    const r = await fetch('/command/data.json', { credentials: 'same-origin', cache: 'no-store' });
    if (r.redirected || !r.ok) return;
    const d = await r.json(); const prev = ctx.data; ctx.data = d;
    for (const f of ctx.onData) f(d, prev);
  } catch { /* mạng chập chờn: giữ dữ liệu cũ */ }
}
poll(); setInterval(poll, 5000);

// Vòng vẽ; máy yếu (dưới 40 fps trong 3 giây đầu) thì giảm độ phân giải.
const clock = new THREE.Clock();
let frames = 0, t0 = performance.now();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!spin.down && Math.abs(spin.v) > 0.0001) { turntable.rotation.y += spin.v; spin.v *= 0.94; }
  if (ctx.mi1) ctx.mi1.mixer.update(dt);
  for (const f of ctx.ticks) f(dt);
  renderer.render(scene, camera);
  if (ctx.quality === 1 && ++frames === 180) { if (180 / ((performance.now() - t0) / 1000) < 40) { ctx.quality = 0.5; renderer.setPixelRatio(1); } }
});
