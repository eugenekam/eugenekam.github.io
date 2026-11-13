// Opens a route on the real GPU, optionally runs a script in the page, and photographs it.
//   node tools/see.mjs <out.jpg> <hash> [width] [height] [waitMs] [js]
import { Browser, sleep } from 'file:///C:/Users/bryan/.claude/skills/design-taste-frontend/scripts/lib/cdp.mjs';
const [out, hash = '', width = 1440, height = 900, wait = 2500, js = ''] = process.argv.slice(2);
const b = await Browser.launch({ width: Number(width), height: Number(height), extraArgs: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ width: Number(width), height: Number(height), mobile: Number(width) < 500 });
await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
await p.send('Runtime.enable');
const logs = [];
b.on(p.sessionId, 'Runtime.consoleAPICalled', (e) => { if (['error', 'warning'].includes(e.type)) logs.push(e.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 260)); });
await p.goto(`${process.env.BASE || 'http://localhost:5199/'}${hash}`, { timeoutMs: 60000, settleMs: 300 });
const t0 = Date.now();
while (Date.now() - t0 < 60000) { if (await p.eval('window.__ready === true')) break; await sleep(200); }
await sleep(1500);
if (js) await p.eval(js);
await sleep(Number(wait));
await p.screenshot({ path: out, format: 'jpeg', quality: 86 });
if (p.consoleErrors.length) console.log('errors:', p.consoleErrors.slice(0, 5));
if (logs.length) console.log('console:', [...new Set(logs)].slice(0, 6));
await b.close();
process.exit(0);
