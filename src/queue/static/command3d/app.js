// Điểm vào Command Center 3D (spec command-center-3d mục 0, 6; D-93). Không WebGL, prefers-reduced-motion hoặc người dùng
// đã chọn bản phẳng thì chuyển về /command trước khi nạp Three.js. Lựa chọn nhớ trong trình duyệt (localStorage).
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* chế độ riêng tư */ } },
};
if (new URLSearchParams(location.search).get('on') === '1') store.set('gw3d', 'on');
function hasWebGL() {
  try { const c = document.createElement('canvas'); return Boolean(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.getElementById('to-flat').addEventListener('click', () => store.set('gw3d', 'off'));
if (store.get('gw3d') === 'off' || reduce || !hasWebGL()) {
  location.replace('/command');
} else {
  window.gwStore = store;
  // Phần (b), (c), (d) thêm module vào danh sách này.
  const features = ['./sats.js'];
  import('./core.js').then(() => Promise.allSettled(features.map((f) => import(f)))).catch(() => {
    document.getElementById('loading').hidden = true;
    document.getElementById('fallback').hidden = false;
  });
}
