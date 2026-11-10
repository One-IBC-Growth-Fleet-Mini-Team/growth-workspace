// Thanh động tác và âm thanh (spec command-center-3d mục 4; D-93). Join = Jump rồi Excited; Working = Scenario_Study;
// Done task = Scenario_Celebrate; sau đó về Idle. Âm thanh kiểu studio tổng hợp bằng WebAudio (không tải file); tắt thì
// dừng ngay âm đang phát; trình duyệt nhớ lựa chọn. Gắn sự kiện thật: mở trang (sau đăng nhập) thì Join; lượt chạy mới
// bắt đầu thì Working; hiện xong các bước thì Done task. Nút bấm tay giữ để demo.
import { ctx, mi1Ready } from './core.js';

const store = window.gwStore;
const style = document.createElement('style');
style.textContent = `#acts{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:6px;align-items:center;padding:6px;z-index:450}
#acts button{font:500 12px system-ui;padding:7px 12px;border:0;border-radius:10px;background:rgba(255,255,255,.55);cursor:pointer;white-space:nowrap}
#acts button[aria-pressed=true]{background:#1d1e20;color:#fff}#acts i{width:1px;height:20px;background:rgba(29,30,32,.2)}
@media (min-width:761px){#hint{bottom:72px}}
@media (max-width:760px){#acts{bottom:auto;top:84px;gap:4px;padding:4px}#acts button{font-size:11px;padding:6px 8px}#hint{top:132px}}`;
document.head.appendChild(style);
const bar = document.createElement('div'); bar.id = 'acts'; bar.className = 'glass'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Động tác Mi1');
bar.innerHTML = '<button type="button" data-k="join">Join</button><button type="button" data-k="work">Working</button><button type="button" data-k="done">Done task</button><i aria-hidden="true"></i><button type="button" id="snd" aria-pressed="false"></button>';
document.body.appendChild(bar);

// Âm thanh: mỗi động tác một chuỗi nốt ngắn; giữ danh sách nguồn để tắt ngay được.
let on = store.get('gw3d-sound') === 'on';
let audio = null;
const live = new Set();
const snd = document.getElementById('snd');
function paint() { snd.setAttribute('aria-pressed', String(on)); snd.textContent = on ? 'Âm thanh: Bật' : 'Âm thanh: Tắt'; }
function stopAll() { for (const o of live) { try { o.stop(); } catch { /* đã dừng */ } } live.clear(); }
function tone(seq) {
  if (!on) return;
  audio ??= new AudioContext();
  const t0 = audio.currentTime + 0.02;
  for (const [f, at, dur] of seq) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t0 + at); g.gain.linearRampToValueAtTime(0.12, t0 + at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    o.connect(g).connect(audio.destination); o.start(t0 + at); o.stop(t0 + at + dur + 0.05);
    live.add(o); o.onended = () => live.delete(o);
  }
}
snd.addEventListener('click', () => { on = !on; store.set('gw3d-sound', on ? 'on' : 'off'); if (!on) stopAll(); paint(); });
paint();

const SOUND = { join: [[523, 0, 0.18], [784, 0.12, 0.25]], work: [[440, 0, 0.12], [494, 0.14, 0.12]], done: [[523, 0, 0.15], [659, 0.12, 0.15], [784, 0.24, 0.3]] };
const press = (k) => { for (const b of bar.querySelectorAll('button[data-k]')) b.setAttribute('aria-pressed', String(b.dataset.k === k)); };
let token = 0;
async function perform(k) {
  const my = ++token; press(k); tone(SOUND[k]);
  if (k === 'join') { await ctx.play('Jump', { once: true }); if (my === token) await ctx.play('Excited', { once: true }); }
  else if (k === 'work') { ctx.play('Scenario_Study'); return; }
  else if (k === 'done') await ctx.play('Scenario_Celebrate', { once: true });
  if (my === token) { ctx.play('Idle'); press(null); }
}
ctx.perform = perform;
bar.addEventListener('click', (e) => { const k = e.target.closest('button[data-k]')?.dataset.k; if (k) perform(k); });

// Sự kiện thật: Join khi mở trang; Working khi lượt mới bắt đầu (màn hình tường hiện dần các bước); Done khi xong.
mi1Ready.then((m) => { if (m) perform('join'); });
document.addEventListener('gw:run-start', () => perform('work'));
document.addEventListener('gw:run-done', () => perform('done'));
