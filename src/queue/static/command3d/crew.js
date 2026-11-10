// Đầu thuyền viên (spec command-center-3d mục 1, 6; D-93): dựng từ cùng rig của Mi1, thu thân về gần 0 và giữ đầu
// (cách prototype làm). Một hàng nhỏ dưới bệ đỡ, cùng trục với Mi1; không thẻ tên nổi ra ngoài khung. Chỉ hiện đầu
// thuyền viên được gọi trong lượt gần nhất (tối đa 4, như prototype) để giữ 60 fps; đang được gọi thì phát Thinking. Vai Amy, Team MKT:
// nhân vật chính hiện dạng đầu (agent của vai: Mi1-sa-01, Mi1-mkt-01).
import { ctx, mi1Ready } from './core.js';
import * as SkeletonUtils from '../vendor/three/addons/utils/SkeletonUtils.js';

const { THREE } = ctx;
const EPS = 0.02;
const row = new THREE.Group(); ctx.scene.add(row);
const heads = [];
let ids = '';

function headOnly(bones) { if (bones.pelvis && bones.neck) { bones.pelvis.scale.setScalar(EPS); bones.neck.scale.setScalar(1 / EPS); } }
function centre(wrapper, inner, bones) {
  inner.position.set(0, 0, 0); wrapper.updateMatrixWorld(true);
  const p = new THREE.Vector3(); bones.head.getWorldPosition(p); wrapper.worldToLocal(p);
  inner.position.set(-p.x, -p.y + 0.05, -p.z);
}

function build(crew) {
  const m = ctx.mi1; if (!m) return;
  for (const h of heads) row.remove(h.g);
  heads.length = 0;
  crew.forEach((c, i) => {
    const root = SkeletonUtils.clone(m.gltf.scene);
    root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    const bones = {}; root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    const mixer = new THREE.AnimationMixer(root);
    const acts = Object.fromEntries(m.gltf.animations.map((a) => [a.name, mixer.clipAction(a)]));
    acts.Idle?.play();
    const g = new THREE.Group(), inner = new THREE.Group(); inner.add(root); g.add(inner); row.add(g);
    root.scale.copy(m.root.scale);
    mixer.update(0); headOnly(bones); centre(g, inner, bones);
    heads.push({ id: c.id, g, bones, mixer, acts, active: false, i });
  });
  layout();
}

function layout() {
  const n = heads.length, gap = ctx.narrow ? 0.34 : 0.42;
  row.position.set(ctx.base.position.x, ctx.base.position.y + (ctx.narrow ? -0.05 : 0.12), 1.15);
  heads.forEach((h, i) => { h.g.position.set((i - (n - 1) / 2) * gap, 0, 0); h.g.scale.setScalar(ctx.narrow ? 0.28 : 0.32); });
}
ctx.onLayout.push(layout);

// Vai Amy, Team MKT: Mi1 hiện dạng đầu, lớn hơn, ở tâm quỹ đạo.
let mainHead = false;
function setMainHead(on) {
  const m = ctx.mi1; if (!m || !m.bones.pelvis) return;
  mainHead = on;
  if (!on) { m.bones.pelvis.scale.setScalar(1); m.bones.neck.scale.setScalar(1); }
}

ctx.ticks.push((dt) => {
  if (mainHead && ctx.mi1) headOnly(ctx.mi1.bones);
  const called = new Set((ctx.run?.session?.steps ?? []).slice(0, ctx.run?.reveal ?? 0).map((s) => s.crewId));
  const busy = ctx.run?.session && ctx.run.reveal < ctx.run.session.steps.length;
  for (const h of heads) {
    const want = busy && called.has(h.id);
    if (want !== h.active) { h.active = want; const a = want ? h.acts.Thinking : h.acts.Idle; const b = want ? h.acts.Idle : h.acts.Thinking; if (a && b) { a.reset().play(); b.crossFadeTo(a, 0.3, false); } }
    h.mixer.update(dt); headOnly(h.bones);
    h.g.lookAt(ctx.camera.position.x, h.g.getWorldPosition(new THREE.Vector3()).y, ctx.camera.position.z);
  }
});

mi1Ready.then((m) => {
  if (!m) return;
  const apply = (d) => {
    setMainHead(d.role !== 'viewer');
    const called = [...new Set((d.session?.steps ?? []).map((s) => s.crewId))].filter((id) => id !== 'mi1').slice(0, 4);
    const k = called.join(',');
    if (k !== ids) { ids = k; build(called.map((id) => ({ id }))); }
  };
  if (ctx.data) apply(ctx.data);
  ctx.onData.push(apply);
});
