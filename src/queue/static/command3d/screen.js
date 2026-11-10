// Màn hình tiến trình treo tường (spec command-center-3d mục 3; D-93): sau lưng Mi1, treo bằng dây, mặt cong theo tường,
// viền ceramic beige, nền frosted glass ánh beige. Hiện lượt chạy đang chạy hoặc gần nhất từ payload: từng bước, thuyền
// viên, tool, trạng thái, cổng đã qua, chi phí; tổng thuyền viên được gọi và tiến trình tổng. Lượt mới: hiện dần từng
// bước (ctx.run.reveal), trong lúc đó Mi1 nhìn thẳng người dùng (ctx.lookAhead). Chỉ mã và số, không PII.
import { ctx, halfWidthAt } from './core.js';

const { THREE } = ctx;
const W = 1600, H = 1000;
const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
const g2 = canvas.getContext('2d');
const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
const bezelM = new THREE.MeshPhysicalMaterial({ color: 0xe8decf, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.16, side: THREE.DoubleSide });
const group = new THREE.Group(); ctx.scene.add(group);
const bezel = new THREE.Mesh(undefined, bezelM), face = new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true }));
const cables = [0, 1].map(() => new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6), ctx.M.carbon));
group.add(bezel, face, ...cables);

function curved(w, h, bend) {
  const geo = new THREE.PlaneGeometry(w, h, 48, 1), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const u = p.getX(i) / (w / 2); p.setZ(i, bend * u * u); }
  p.needsUpdate = true; geo.computeVertexNormals(); return geo;
}
function layout() {
  const z = ctx.narrow ? -1.0 : -2.2;
  const hw = halfWidthAt(z);
  const w = ctx.narrow ? 1.16 * hw : 0.62 * hw, h = w * 0.625;
  const x = ctx.narrow ? 0 : ctx.base.position.x + 0.1 * hw;
  const y = ctx.narrow ? 2.35 : 2.35;
  group.position.set(x, y, z);
  const bend = w * 0.07;
  bezel.geometry?.dispose(); bezel.geometry = curved(w + 0.14, h + 0.14, bend); bezel.position.z = -0.012;
  face.geometry?.dispose(); face.geometry = curved(w, h, bend);
  cables.forEach((c, i) => { c.scale.set(1, 6, 1); c.position.set((i ? 1 : -1) * w * 0.35, h / 2 + 0.07 + 3, bend * 0.49 - 0.01); });
}
ctx.onLayout.push(layout); layout();

const STATUS = { succeeded: ['xong', '#2e7d4f'], failed: ['lỗi', '#b3261e'], blocked: ['bị chặn', '#9a5b00'], running: ['đang chạy', '#1f6fb2'], waiting: ['chờ', '#8a8178'] };
function fit(text, max) { let t = String(text); while (t.length > 1 && g2.measureText(t).width > max) t = t.slice(0, -2) + '…'; return t; }
function draw() {
  const run = ctx.run, s = run?.session;
  g2.clearRect(0, 0, W, H);
  g2.fillStyle = 'rgba(246,240,230,.86)'; g2.fillRect(0, 0, W, H);
  g2.fillStyle = '#5d564c'; g2.font = '500 36px ui-monospace,monospace'; g2.fillText('MI1 · TIẾN TRÌNH XỬ LÝ', 56, 76);
  if (!s) { g2.fillStyle = '#1d1e20'; g2.font = '600 84px system-ui'; g2.fillText('Sẵn sàng', 56, 190); g2.font = '44px system-ui'; g2.fillStyle = '#5d564c'; g2.fillText('Chưa có lượt chạy. Hỏi Mi1 hoặc chờ lịch chạy.', 56, 260); tex.needsUpdate = true; return; }
  const shown = Math.min(run.reveal, s.steps.length);
  const live = shown < s.steps.length || s.status === 'running';
  const crew = new Set(s.steps.slice(0, shown).map((x) => x.crewId));
  g2.fillStyle = '#1d1e20'; g2.font = '600 76px system-ui';
  g2.fillText(fit(`${s.trigger === 'ask' ? 'Hỏi Mi1' : s.trigger.toUpperCase()} · ${live ? 'đang chạy' : (STATUS[s.status]?.[0] ?? s.status)}`, W - 112), 56, 170);
  g2.font = '40px system-ui'; g2.fillStyle = '#5d564c';
  g2.fillText(`${shown}/${s.steps.length} bước · ${crew.size} thuyền viên được gọi · ${run.costUsd.toFixed(4)} USD`, 56, 230);
  g2.fillStyle = 'rgba(29,30,32,.1)'; g2.fillRect(56, 256, W - 112, 12);
  g2.fillStyle = '#3fa9f5'; g2.fillRect(56, 256, (W - 112) * (s.steps.length ? shown / s.steps.length : 1), 10);
  let y = 350;
  s.steps.forEach((st, i) => {
    if (y > H - 40) return;
    const state = i < shown ? st.status : i === shown && live ? 'running' : 'waiting';
    const [label, color] = STATUS[state] ?? [state, '#8a8178'];
    g2.fillStyle = color; g2.beginPath(); g2.arc(74, y - 16, 16, 0, Math.PI * 2); g2.fill();
    g2.fillStyle = '#1d1e20'; g2.font = '600 46px system-ui'; g2.fillText(fit(`${st.crewId} · ${st.tool}`, W - 460), 106, y);
    g2.fillStyle = color; g2.font = '500 40px system-ui'; g2.fillText(label, W - 320, y);
    g2.fillStyle = '#5d564c'; g2.font = '36px system-ui';
    g2.fillText(fit(i < shown ? `${st.resultSummary} · cổng: ${st.gates.join(', ') || 'không'} · ${st.costUsd.toFixed(4)} USD` : '…', W - 170), 106, y + 52);
    y += 130;
  });
  tex.needsUpdate = true;
}
ctx.drawScreen = draw;

// Lượt mới (khác id) thì hiện dần từng bước; cùng lượt thì vẽ lại theo dữ liệu mới.
ctx.run = { id: null, session: null, reveal: 0, costUsd: 0 };
ctx.onData.push((d) => {
  const s = d.session;
  if (s && s.id !== ctx.run.id) {
    const first = ctx.run.id === null;
    ctx.run = { id: s.id, session: s, reveal: first ? s.steps.length : 0, costUsd: d.sessionCostUsd, fresh: !first };
    if (!first) document.dispatchEvent(new CustomEvent('gw:run-start', { detail: s }));
  } else if (s) { ctx.run.session = s; ctx.run.costUsd = d.sessionCostUsd; }
  draw();
});
let acc = 0;
ctx.ticks.push((dt) => {
  const r = ctx.run;
  const busy = r.session && r.reveal < r.session.steps.length;
  ctx.lookAhead = Boolean(busy || r.session?.status === 'running');
  if (!busy) return;
  acc += dt;
  if (acc > 0.7) {
    acc = 0; r.reveal += 1; draw();
    if (r.reveal >= r.session.steps.length) document.dispatchEvent(new CustomEvent('gw:run-done', { detail: r.session }));
  }
});
draw();
