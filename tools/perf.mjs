// Frame timing for each part of the site on a real graphics card, at a laptop's usual resolution.
//   node tools/perf.mjs [url]          the fast GPU
//   LOW=1 node tools/perf.mjs [url]    the integrated GPU, closer to an ordinary laptop
import { Browser, sleep } from 'file:///C:/Users/bryan/.claude/skills/design-taste-frontend/scripts/lib/cdp.mjs';

const url = process.argv[2] || 'http://localhost:5199/';
const gpu = process.env.LOW ? '--force_low_power_gpu' : '--force_high_performance_gpu';
const b = await Browser.launch({ width: 1440, height: 900, extraArgs: ['--use-angle=d3d11', '--ignore-gpu-blocklist', gpu] });
const p = await b.newPage({ width: 1440, height: 900, dsf: 1.5 });
await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
await p.goto(url, { timeoutMs: 60000, settleMs: 300 });
const t0 = Date.now();
while (Date.now() - t0 < 60000) {
  if (await p.eval('window.__ready === true')) break;
  await sleep(200);
}
await sleep(1200);
console.log('gpu:', await p.eval(`(() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()`));

const sample = (ms) => p.eval(`new Promise((done) => { const out = []; let last = performance.now(); const end = last + ${ms}; const tick = (now) => { out.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else done(out); }; requestAnimationFrame(tick); })`);
const report = (name, frames) => {
  const s = [...frames].slice(2).sort((a, c) => a - c);
  const q = (x) => s[Math.floor(s.length * x)].toFixed(1);
  console.log(`${name.padEnd(24)} fps ${(1000 / (s.reduce((a, c) => a + c, 0) / s.length)).toFixed(0).padStart(3)}  p50 ${q(0.5).padStart(5)}ms  p95 ${q(0.95).padStart(5)}ms  p99 ${q(0.99).padStart(5)}ms  max ${s.at(-1).toFixed(0).padStart(4)}ms  slow frames(>25ms) ${s.filter((x) => x > 25).length} of ${s.length}`);
};
const go = async (hash, ms = 1600) => {
  await p.eval(`location.hash = ${JSON.stringify(hash)}`);
  await sleep(ms);
};

report('menu, idle', await sample(3000));

const hover = sample(4800);
for (let i = 0; i < 5; i++) {
  await p.eval(`document.querySelectorAll('.menu__item')[${i}].dispatchEvent(new Event('pointerenter'))`);
  await sleep(950);
}
report('menu, camera flights', await hover);

await go('#/career', 3000);
report('career map', await sample(2000));
await go('#/career/seaquest', 800);
const drive = sample(9000);
await sleep(3000);
await go('#/career/5ca', 0);
await sleep(3000);
await go('#/career/seaquest', 0);
report('career, driving rounds', await drive);

await go('#/garage', 2400);
report('garage', await sample(2500));

await go('#/pitwall', 2600);
const steps = sample(6000);
for (const i of [1, 2, 3]) {
  await p.eval(`document.getElementById('tab-${i}').click()`);
  await sleep(1900);
}
report('pit wall, stepping', await steps);

await go('#/profile', 2400);
const turns = sample(4000);
for (const i of [1, 2, 3]) {
  await p.eval(`document.getElementById('tab-${i}').click()`);
  await sleep(1200);
}
report('profile, tab camera moves', await turns);

console.log('settled on:', await p.eval(`JSON.stringify({ resolution: +__stage.dpr.toFixed(2), reflections: __stage.reflection?.visible, triangles: __stage.gl.info.render.triangles, drawCalls: __stage.gl.info.render.calls })`));
if (p.consoleErrors.length) console.log('errors', p.consoleErrors.slice(0, 3));
await b.close();
process.exit(0);
