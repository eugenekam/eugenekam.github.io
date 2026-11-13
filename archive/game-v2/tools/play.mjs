// A bot plays Time Trial on the real GPU: frame timing while driving, plus screenshots of the HUD and debrief.
//   node tools/play.mjs <outDir> [sprint|lap] [width] [height]
import { Browser, sleep } from 'file:///C:/Users/bryan/.claude/skills/design-taste-frontend/scripts/lib/cdp.mjs';
const [dir, event = 'sprint', width = 1440, height = 900] = process.argv.slice(2);
const b = await Browser.launch({ width: Number(width), height: Number(height), extraArgs: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ width: Number(width), height: Number(height), mobile: Number(width) < 500 });
await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
await p.goto(`${process.env.BASE || 'http://localhost:5199/'}#/trial`, { timeoutMs: 60000, settleMs: 300 });
const t0 = Date.now();
while (Date.now() - t0 < 60000) { if (await p.eval('window.__ready === true')) break; await sleep(200); }
await sleep(1200);
await p.eval(`(() => { const t = __game.modes.trial; t.choice.level = 'pro'; t.choice.event = ${JSON.stringify(event)}; t.input.read = () => { const c = t.car; const l = c.target(1.05); return { steer: c.steerHelp(), throttle: c.v < l * 0.99 ? 1 : 0, brake: c.v > l * 1.02 ? 1 : 0 }; }; document.getElementById('go').click(); })()`);
await sleep(1800);
await p.screenshot({ path: `${dir}/run-lights.jpg`, format: 'jpeg', quality: 84 });
const frames = p.eval(`new Promise((done) => { const out = []; let last = performance.now(); const end = last + 12000; const tick = (now) => { out.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else done(out); }; requestAnimationFrame(tick); })`);
await sleep(6000);
await p.screenshot({ path: `${dir}/run-chase.jpg`, format: 'jpeg', quality: 84 });
await p.eval(`__game.modes.trial.key({ code: 'KeyC', key: 'c' })`);
await sleep(2500);
await p.screenshot({ path: `${dir}/run-onboard.jpg`, format: 'jpeg', quality: 84 });
const f = (await frames).slice(1).sort((a, c) => a - c);
const q = (x) => f[Math.floor(f.length * x)].toFixed(1);
console.log(`driving: frames ${f.length}  fps ${(1000 / (f.reduce((a, c) => a + c, 0) / f.length)).toFixed(0)}  p50 ${q(0.5)}ms  p95 ${q(0.95)}ms  p99 ${q(0.99)}ms  max ${f.at(-1).toFixed(0)}ms  janky(>25ms) ${f.filter((x) => x > 25).length}`);
console.log('quality:', await p.eval(`JSON.stringify({ dpr: __stage.dpr, calls: __stage.gl.info.render.calls, tris: __stage.gl.info.render.triangles })`));
const wait = Date.now();
while (Date.now() - wait < 130000) { if (await p.eval(`__game.modes.trial.state === 'debrief'`)) break; await sleep(500); }
await sleep(1600);
console.log('finish:', await p.eval(`JSON.stringify({ state: __game.modes.trial.state, time: __game.modes.trial.finalTime, hits: __game.modes.trial.hits })`));
await p.screenshot({ path: `${dir}/run-debrief.jpg`, format: 'jpeg', quality: 86 });
if (p.consoleErrors.length) console.log('errors', p.consoleErrors.slice(0, 4));
await b.close();
process.exit(0);
