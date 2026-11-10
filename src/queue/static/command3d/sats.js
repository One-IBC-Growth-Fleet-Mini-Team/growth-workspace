// Vệ tinh module (spec command-center-3d mục 2, 5; D-93): mỗi module của vai trò là một khối ceramic bay quanh Mi1,
// quỹ đạo không vẽ. Nhãn ẩn mặc định, hiện khi rê chuột, Tab tới hoặc đang chọn; nhãn ẩn không chiếm chỗ. Rê vào thì
// dừng quay; bấm hoặc Enter mở bảng frosted glass (nội dung rút gọn, link trang đầy đủ). Mi1 quay đầu nhìn vệ tinh đang
// chọn. Điện thoại: thêm lưới dock dưới Mi1. Nội dung lấy từ payload (modules), không có số nào khác.
import { ctx, mi1Ready } from './core.js';
import { RoundedBoxGeometry } from '../vendor/three/addons/geometries/RoundedBoxGeometry.js';

const { THREE, M, camera, renderer } = ctx;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const style = document.createElement('style');
style.textContent = `.mod{position:fixed;left:0;top:0;font:500 12px system-ui,sans-serif;padding:6px 10px;color:#1d1e20;cursor:pointer;opacity:0;transition:opacity .15s;white-space:nowrap}
.mod:focus-visible,.mod[aria-current]{outline:2px solid #3fa9f5}.mod small{display:block;font-weight:400;color:#5d564c}
#panel{position:fixed;right:16px;top:80px;width:min(360px,calc(100vw - 32px));max-height:calc(100vh - 160px);overflow:auto;padding:16px;z-index:500}
#panel h2{margin:0 0 8px;font-size:16px}#panel button{float:right}
#dock{position:fixed;left:16px;right:16px;bottom:16px;display:none;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;z-index:400}
#dock button{font:500 12px system-ui;padding:8px;text-align:left}
@media (max-width:760px){#dock{display:grid}.mod{display:none}}`;
document.head.appendChild(style);
const labels = document.createElement('div'); document.body.appendChild(labels);
const dock = document.createElement('nav'); dock.id = 'dock'; dock.setAttribute('aria-label', 'Module'); document.body.appendChild(dock);
const panel = document.createElement('section'); panel.id = 'panel'; panel.className = 'glass'; panel.hidden = true; panel.setAttribute('role', 'dialog'); document.body.appendChild(panel);

const root = new THREE.Group(); ctx.scene.add(root);
const sats = [];
let hover = null, selected = null, speed = 1, key = '';
const hit = new THREE.MeshBasicMaterial({ visible: false });

function orbit(i, n) {
  const narrow = ctx.narrow;
  return { r: (narrow ? 0.62 : 0.95) + (i % 3) * (narrow ? 0.08 : 0.14), inc: THREE.MathUtils.degToRad([16, -12, 26, -20, 10, -28, 20][i % 7]),
    psi: THREE.MathUtils.degToRad([24, -20, 34, -30, 16, -38, 28][i % 7]), node: (i / n) * Math.PI * 2, w: ((Math.PI * 2) / (60 + (i % 4) * 18)) * (i % 2 ? -1 : 1), theta: (i / n) * Math.PI * 2 + i * 0.7 };
}
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const center = () => new THREE.Vector3(ctx.base.position.x, ctx.base.position.y + 1.05, 0);
function place(s) {
  s.g.position.set(Math.cos(s.theta) * s.r, 0, Math.sin(s.theta) * s.r * 0.8)
    .applyAxisAngle(AX.x, s.inc).applyAxisAngle(AX.z, s.psi).applyAxisAngle(AX.y, s.node).add(center());
}

function build(mods) {
  for (const s of sats) { root.remove(s.g); s.label.remove(); }
  sats.length = 0; dock.innerHTML = '';
  const size = ctx.narrow ? 0.12 : 0.17;
  const geo = new RoundedBoxGeometry(size, size, size, 3, 0.04);
  mods.forEach((m, i) => {
    const g = new THREE.Group();
    const tile = new THREE.Mesh(geo, M.ceramic);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.6, size * 0.6), M.led); face.position.z = size / 2 + 0.001; tile.add(face);
    const area = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), hit); area.userData.id = m.id;
    g.add(tile, area); root.add(g);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mod glass';
    b.innerHTML = `${esc(m.label)}<small>${esc(m.summary)}</small>`;
    b.addEventListener('pointerenter', () => { hover = m.id; }); b.addEventListener('pointerleave', () => { if (hover === m.id) hover = null; });
    b.addEventListener('focus', () => { hover = m.id; }); b.addEventListener('blur', () => { if (hover === m.id) hover = null; });
    b.addEventListener('click', () => open(m.id));
    labels.appendChild(b);
    const d = document.createElement('button'); d.type = 'button'; d.className = 'glass'; d.innerHTML = `${esc(m.label)}<br><small>${esc(m.summary)}</small>`; d.addEventListener('click', () => open(m.id)); dock.appendChild(d);
    sats.push({ id: m.id, m, g, tile, label: b, ...orbit(i, mods.length) });
  });
}

function open(id) {
  const s = sats.find((x) => x.id === id); if (!s) return;
  selected = s;
  for (const x of sats) x.label.toggleAttribute('aria-current', x === s);
  panel.innerHTML = `<button type="button" class="glass" aria-label="Đóng">Đóng</button><h2>${esc(s.m.label)}</h2><p>${esc(s.m.summary)}</p>${s.m.href ? `<p><a href="${esc(s.m.href)}">Mở trang đầy đủ</a></p>` : '<p><small>Trang chi tiết dành cho vai trò khác.</small></p>'}`;
  panel.querySelector('button').addEventListener('click', close);
  panel.hidden = false; panel.querySelector('a, button').focus();
}
function close() { panel.hidden = true; if (selected) selected.label.removeAttribute('aria-current'); selected = null; }
addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

// Bấm vệ tinh trên canvas (không tính khi đang kéo xoay bệ); rê chuột để dừng quỹ đạo.
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
function pick(e) {
  ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ptr, camera);
  return ray.intersectObjects(root.children, true).find((h) => h.object.userData.id)?.object.userData.id ?? null;
}
renderer.domElement.addEventListener('pointermove', (e) => { const id = pick(e); hover = id; renderer.domElement.style.cursor = id ? 'pointer' : 'grab'; });
renderer.domElement.addEventListener('click', (e) => { if (ctx.dragMoved()) return; const id = pick(e); if (id) open(id); });

// Mi1 nhìn vệ tinh đang chọn: đích đổi về hệ toạ độ của bệ xoay (Mi1 quay mặt +z), quay xương đầu sau animation, có
// giới hạn góc. Trong lúc lượt chạy đang hiện (ctx.lookAhead) thì nhìn thẳng người dùng (spec mục 3).
const tp = new THREE.Vector3(), hp = new THREE.Vector3(), qT = new THREE.Quaternion(), qL = new THREE.Quaternion(), qP = new THREE.Quaternion(), qW = new THREE.Quaternion(), e3 = new THREE.Euler();
let yaw = 0, pitch = 0;
function look(dt) {
  const head = ctx.mi1?.bones.head; if (!head) return;
  let wy = 0, wp = 0;
  if (selected && !ctx.lookAhead) {
    selected.g.getWorldPosition(tp); head.getWorldPosition(hp);
    ctx.turntable.worldToLocal(tp); ctx.turntable.worldToLocal(hp);
    const dx = tp.x - hp.x, dy = tp.y - hp.y, dz = tp.z - hp.z;
    wy = THREE.MathUtils.clamp(Math.atan2(dx, dz), -1.1, 1.1);
    wp = THREE.MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.45, 0.5);
  }
  const k = Math.min(1, dt * 5); yaw += (wy - yaw) * k; pitch += (wp - pitch) * k;
  if (Math.abs(yaw) < 1e-4 && Math.abs(pitch) < 1e-4) return;
  ctx.turntable.getWorldQuaternion(qT);
  qL.setFromEuler(e3.set(-pitch, yaw, 0, 'YXZ'));
  qW.copy(qT).multiply(qL).multiply(qT.clone().invert());
  head.parent.getWorldQuaternion(qP);
  head.quaternion.premultiply(qP).premultiply(qW).premultiply(qP.invert());
}

const v = new THREE.Vector3();
ctx.ticks.push((dt) => {
  speed += ((hover || selected ? 0 : 1) - speed) * Math.min(1, dt * 4);
  for (const s of sats) {
    s.theta += s.w * dt * speed; place(s); s.tile.rotation.y += dt * 0.4; s.tile.rotation.x = 0.3;
    s.g.getWorldPosition(v); v.y -= 0.13; v.project(camera);
    const show = hover === s.id || selected === s || document.activeElement === s.label;
    s.label.style.opacity = show ? '1' : '0';
    s.label.style.pointerEvents = show ? 'auto' : 'none';
    s.label.style.transform = `translate(${Math.min(innerWidth - 200, Math.max(8, (v.x * 0.5 + 0.5) * innerWidth))}px, ${Math.max(70, (-v.y * 0.5 + 0.5) * innerHeight)}px)`;
  }
  look(dt);
});
function sync(d) {
  const k = `${d.role}|${d.modules.map((m) => m.id).join(',')}|${ctx.narrow}`;
  if (k !== key) { key = k; build(d.modules); return; }
  for (const s of sats) { const m = d.modules.find((x) => x.id === s.id); if (m) { s.m = m; s.label.innerHTML = `${esc(m.label)}<small>${esc(m.summary)}</small>`; } }
}
ctx.onData.push(sync);
ctx.onLayout.push(() => { if (ctx.data) sync(ctx.data); });
if (ctx.data) sync(ctx.data);
mi1Ready.then(() => { const f = $('#flat'); if (f && sats.length) f.hidden = true; });
