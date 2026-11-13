// Clicks through the whole portfolio in a real browser on the real GPU, the way a visitor would.
//   node tools/check.mjs [url]
import { Browser, sleep } from 'file:///C:/Users/bryan/.claude/skills/design-taste-frontend/scripts/lib/cdp.mjs';

const url = process.argv[2] || 'http://localhost:5199/';
const b = await Browser.launch({ width: 1440, height: 900, extraArgs: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
let failures = 0;
const pass = (name, ok, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
};

const open = async (calm, hash = '') => {
  const p = await b.newPage({ width: 1440, height: 900 });
  await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: calm ? 'reduce' : 'no-preference' }] });
  await p.goto(url + hash, { timeoutMs: 60000, settleMs: 300 });
  const t = Date.now();
  while (Date.now() - t < 60000) {
    if (await p.eval('window.__ready === true')) break;
    await sleep(200);
  }
  await sleep(700);
  return p;
};
const go = async (p, hash, ms = 2300) => {
  await p.eval(`location.hash = ${JSON.stringify(hash)}`);
  await sleep(ms);
};
const q = (p, js) => p.eval(js);
const key = async (p, k, code, vk) => {
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk });
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
};

const p = await open(false);

/* Menu */
pass('main menu shows on load', await q(p, `__app.modeName === null && !document.getElementById('menu').classList.contains('is-away')`));
pass('the first screen says who this is', (await q(p, `document.querySelector('h1').textContent`)).includes('Eugene Kam'));
pass('nothing playable is left on the menu', await q(p, `![...document.querySelectorAll('.menu__name')].some((e) => /time trial/i.test(e.textContent)) && !document.body.textContent.includes('Scouted')`));
pass('one menu item is always selected', await q(p, `document.querySelectorAll('.menu__item.is-on').length === 1`));
await key(p, 'ArrowDown', 'ArrowDown', 40);
await sleep(300);
await key(p, 'ArrowDown', 'ArrowDown', 40);
await sleep(300);
pass('arrow keys move through the menu and the camera follows', await q(p, `document.activeElement.textContent.includes('Career') && __stage.viewName === 'rise'`));
pass('no motion button for normal visitors', await q(p, `[...document.querySelectorAll('[data-motion]')].every((b) => b.hidden)`));
await key(p, 'Enter', 'Enter', 13);
await sleep(1900);
pass('Enter opens the selected section', (await q(p, `location.hash`)) === '#/career');
await go(p, '#/', 2200);

/* Profile */
await go(p, '#/profile', 2600);
pass('profile opens with the driver card', (await q(p, `document.querySelector('.card__name').textContent`)) === 'Eugene Kam');
const before = await q(p, `__stage.viewName`);
await key(p, 'e', 'KeyE', 69);
await sleep(400);
pass('E moves to the next tab and the camera turns', await q(p, `!document.getElementById('pane-1').hidden`) && (await q(p, `__stage.viewName`)) !== before);
await q(p, `document.getElementById('tab-2').click()`);
await sleep(300);
pass('track record links to the proof', (await q(p, `document.querySelectorAll('.jumps a').length`)) === 6);
await q(p, `document.querySelector('.jumps a[href="#/career/5ca"]').click()`);
await sleep(6400);
pass('a track record link lands on that job', (await q(p, `document.querySelector('.card__name').textContent`)) === '5CA');
await go(p, '#/profile', 2600);
await q(p, `document.getElementById('tab-2').click()`);
await q(p, `document.querySelector('.jumps a[href="#/garage/driver"]').click()`);
await sleep(3200);
pass('a link can open a part in the garage', (await q(p, `document.querySelector('.card__name').textContent`)) === 'Four languages on the radio');

/* Career */
await go(p, '#/career', 2800);
pass('career opens on the map', await q(p, `__app.modeName === 'career' && document.querySelector('.career').classList.contains('is-map') && __stage.viewName === 'map'`));
pass('eight pins on the map', (await q(p, `document.querySelectorAll('.pin').length`)) === 8);
pass('every pin is on screen', await q(p, `[...document.querySelectorAll('.pin')].every((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 120 && r.top >= 0 && r.bottom <= innerHeight; })`));
await q(p, `document.querySelectorAll('.pin')[3].click()`);
await sleep(500);
const speeds = await q(p, `new Promise((done) => { const s = __stage; let last = s.index; let was = performance.now(); const out = []; const end = was + 3000; const tick = (now) => { let d = s.index - last; if (d < -200) d += s.f.N; if (now > was) out.push((Math.abs(d) * 10) / ((now - was) / 1000)); last = s.index; was = now; if (now < end) requestAnimationFrame(tick); else done(out); }; requestAnimationFrame(tick); })`);
pass('the car never moves faster than a sped-up lap', Math.max(...speeds) < 640, `top ${(Math.max(...speeds) / 83).toFixed(1)} x real top speed`);
await sleep(1600);
pass('round card opens with the right job', (await q(p, `document.querySelector('.card__name').textContent`)) === '5CA');
const angle = await q(p, `__stage.roundAngle`);
await q(p, `document.getElementById('tab-1').click()`);
await sleep(200);
pass('a tab swings the camera', (await q(p, `__stage.roundAngle`)) !== angle && (await q(p, `!document.getElementById('pane-1').hidden`)));
await q(p, `document.getElementById('tab-2').click()`);
const closed = await q(p, `(() => { document.querySelectorAll('.case button').forEach((b) => b.click()); return document.querySelector('.case__result').textContent; })()`);
pass('the case file walkthrough works', closed.includes('USD 250k'), closed);
await key(p, 'ArrowRight', 'ArrowRight', 39);
await sleep(500);
pass('the arrow key moves to the next round', (await q(p, `location.hash`)) === '#/career/tester');
await sleep(2800);
await key(p, 'm', 'KeyM', 77);
await sleep(700);
pass('M goes back to the map', await q(p, `location.hash === '#/career' && document.querySelector('.card').hidden`));

/* Pit wall */
await go(p, '#/pitwall', 2800);
pass('pit wall shows both cars', await q(p, `__stage.pair.a.visible && __stage.pair.b.visible`));
pass('there is no quiz left', await q(p, `!document.querySelector('.answers') && !document.querySelector('[data-a]')`));
await q(p, `document.getElementById('tab-1').click()`);
await sleep(700);
pass('The lead moves the cars back to the sector line', Math.abs((await q(p, `__stage.pair.ta`)) - (await q(p, `__app.lap.lines[1]`))) < 1);
await q(p, `document.getElementById('tab-3').click()`);
await sleep(2600);
await q(p, `document.querySelector('[data-corner="7"]').click()`);
await sleep(700);
pass('the corner buttons move the cars', Math.abs((await q(p, `__stage.pair.ta`)) - (await q(p, `__app.lap.corners[6].i`))) < 4, await q(p, `document.getElementById('corner-note').textContent`));
await q(p, `document.getElementById('tab-4').click()`);
await sleep(900);
await q(p, `document.querySelector('[data-jump="16"]').click()`);
await sleep(900);
const apex = await q(p, `document.getElementById('r-apex').textContent`);
pass('the instrument shows the real apex and gears', apex.includes('109') && apex.includes('103') && apex.includes('VER 3, LEC 2'), apex);
await q(p, `(() => { const s = document.getElementById('scrub'); s.value = s.max; s.dispatchEvent(new Event('input')); })()`);
await sleep(200);
pass('the finish shows the official gap', (await q(p, `document.getElementById('r-gap').textContent`)) === '0.054');

/* Garage */
await go(p, '#/garage', 2800);
pass('eight parts to click', (await q(p, `document.querySelectorAll('.marker').length`)) === 8);
await q(p, `document.querySelectorAll('.marker')[3].click()`);
await sleep(700);
pass('clicking a part opens its card', (await q(p, `document.querySelector('.card__name').textContent`)) === 'Cooling under load');
await q(p, `document.getElementById('apart').click()`);
await sleep(1500);
pass('the car comes apart', await q(p, `__stage.explodeAmount > 0.9`));
await q(p, `document.getElementById('apart').click()`);
await sleep(1500);
pass('and goes back together', await q(p, `__stage.explodeAmount < 0.1`));

/* Radio and the CV */
await go(p, '#/radio', 2600);
pass('team radio opens', await q(p, `!!document.getElementById('role')`));
await go(p, '#/cv', 800);
pass('the CV opens over everything', await q(p, `document.getElementById('cv').classList.contains('is-open')`));
pass('its way out returns to where you were', (await q(p, `document.querySelector('.cv__close').getAttribute('href')`)) === '#/radio');
await go(p, '#/radio', 800);
await key(p, 'Escape', 'Escape', 27);
await sleep(2200);
pass('Esc goes back to the menu', await q(p, `__app.modeName === null && __stage.viewName === 'hero'`));
pass('no page errors', p.consoleErrors.length === 0, JSON.stringify(p.consoleErrors.slice(0, 3)));
await p.close();

/* A visitor with animations off, like this machine */
const c = await open(true);
let s = await q(c, `({ still: __stage.still, hidden: document.querySelector('.board [data-motion]').hidden, label: document.querySelector('.board [data-motion]').textContent })`);
pass('calm visitor gets everything, and sees the motion button on the menu', s.still === true && s.hidden === false, JSON.stringify(s));
await go(c, '#/career/seaquest', 1400);
pass('calm mode still reaches a round', (await q(c, `document.querySelector('.card__name')?.textContent`)) === 'SeaQuest Intermediaries');
await q(c, `document.querySelector('.bar [data-motion]').click()`);
await sleep(300);
s = await q(c, `({ still: __stage.still, saved: localStorage.getItem('kam-motion') })`);
pass('the button turns full motion on', s.still === false && s.saved === 'on', JSON.stringify(s));
await c.eval(`location.reload()`);
await sleep(800);
const t1 = Date.now();
while (Date.now() - t1 < 60000) {
  if (await q(c, `window.__ready === true`)) break;
  await sleep(200);
}
await sleep(500);
pass('the choice survives a reload', await q(c, `__stage.still === false`));
pass('no page errors in calm mode', c.consoleErrors.length === 0, JSON.stringify(c.consoleErrors.slice(0, 3)));
await c.close();

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
await b.close();
process.exit(0);
