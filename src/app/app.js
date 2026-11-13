// The shell: a console-style main menu, a set of screens, and the wipe that carries you between them.
// The address bar is the state, so the back button, deep links and refreshing all just work.
import { sound } from './audio.js';
import { Career } from './career.js';
import { Garage } from './garage.js';
import { PitWall } from './pitwall.js';
import { Profile } from './profile.js';
import { Radio } from './radio.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class App {
  constructor({ stage, lap, phone, calm }) {
    this.stage = stage;
    this.lap = lap;
    this.phone = phone;
    this.calm = calm;
    this.root = document.getElementById('mode');
    this.board = document.getElementById('menu');
    this.bar = document.getElementById('bar');
    this.title = document.getElementById('bar-title');
    this.wipeEl = document.getElementById('wipe');
    this.cv = document.getElementById('cv');
    this.items = [...document.querySelectorAll('.menu__item')];
    this.mode = null;
    this.modeName = null;
    this.busy = false;
    this.promptsEl = document.getElementById('prompts');
    this.blinkEl = document.getElementById('blink');

    this.modes = {
      profile: new Profile(this),
      career: new Career(this),
      pitwall: new PitWall(this),
      garage: new Garage(this),
      radio: new Radio(this),
    };

    addEventListener('hashchange', () => this.route());
    addEventListener('keydown', (e) => this.key(e));

    this.items.forEach((item, i) => {
      item.addEventListener('pointerenter', () => this.focusItem(i));
      item.addEventListener('focus', () => this.focusItem(i));
    });

    const soundButton = document.getElementById('sound');
    soundButton.addEventListener('click', () => {
      sound.set(!sound.on);
      soundButton.setAttribute('aria-pressed', String(sound.on));
      soundButton.textContent = sound.on ? 'Sound on' : 'Sound off';
      sound.tick(1100);
    });

    addEventListener('pointermove', (e) => {
      stage.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    }, { passive: true });

    this.route(true);
  }

  // The console-style key prompts along the bottom of a screen.
  setPrompts(list) {
    const el = this.promptsEl;
    el.hidden = !list.length;
    el.innerHTML = list.map(([keys, label]) => `<span>${keys.map((k) => `<kbd>${k}</kbd>`).join('')} ${label}</span>`).join('');
  }

  // A quick dip to dark, for moving something somewhere it couldn't plausibly travel to.
  async blink(swap) {
    if (this.calm()) {
      swap();
      return;
    }
    this.blinkEl.classList.add('is-on');
    await wait(170);
    swap();
    await wait(60);
    this.blinkEl.classList.remove('is-on');
  }

  focusItem(i) {
    if (this.modeName !== null) return;
    if (this.focused === i) return;
    this.focused = i;
    this.items.forEach((el, k) => el.classList.toggle('is-on', k === i));
    const view = this.items[i].dataset.view;
    this.stage.setRival(view === 'behind');
    this.stage.setConsole(view === 'console');
    // Garage preview: the car taken apart, as it is on the Garage page.
    const a = this.stage.aspect;
    this.stage.setExplode(view === 'garage' ? 1 : 0);
    if (view === 'garage') this.stage.focusOrbit({ az: 0.95, el: 0.26, dist: 11 * (a < 0.9 ? Math.min(1.6, Math.max(1, 0.7 / a)) : 1), x: 0, y: 1.1, z: 0 });
    this.stage.view(view, { time: 1.15, arc: view === 'rise' ? 60 : 0 });
    sound.tick(620, 0.035, 0.06);
  }

  key(e) {
    if (document.activeElement?.tagName === 'INPUT') {
      if (e.key === 'Escape') document.activeElement.blur();
      return;
    }
    if (this.mode?.key?.(e)) return;
    if (e.key === 'Escape' && this.modeName !== null) {
      location.hash = '#/';
      return;
    }
    if (this.modeName !== null) return;
    if (e.key === 'Enter' && !document.activeElement?.closest('a, button')) {
      this.items[this.focused ?? 0].click();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = this.items.length;
      const at = this.focused ?? (e.key === 'ArrowDown' ? -1 : 0);
      this.items[(at + (e.key === 'ArrowDown' ? 1 : -1) + n) % n].focus();
    }
  }

  parse() {
    const [, name = '', param] = location.hash.replace(/^#/, '').split('/');
    return { name: this.modes[name] || name === 'cv' ? name : '', param };
  }

  async route(first) {
    const { name, param } = this.parse();
    const want = name || null;
    if (want === 'cv') {
      // The way out goes back to wherever you were.
      this.cv.querySelector('.cv__close').href = this.modeName ? `#/${this.modeName}` : '#/';
      this.openCv(true);
      if (first) this.enterMenu(true);
      return;
    }
    this.openCv(false);
    if (want === this.modeName && !first) {
      if (want) this.mode.param?.(param);
      return;
    }
    if (this.busy) return;
    this.busy = true;
    const label = want ? this.items.find((i) => i.hash === `#/${want}`)?.querySelector('.menu__name').textContent : 'Eugene Kam';
    try {
      await this.wipe(first ? null : label, () => {
      this.mode?.leave();
      this.root.replaceChildren();
      this.setPrompts([]);
      this.mode = null;
      this.modeName = want;
      this.stage.setExplode(0);
      this.stage.setFence(false);
      if (want) {
        this.board.classList.add('is-away');
        this.bar.hidden = false;
        this.title.textContent = label;
        this.mode = this.modes[want];
        this.mode.enter(param);
      } else {
        this.enterMenu();
      }
      });
    } finally {
      // Whatever a screen does, navigation must never stay locked.
      this.busy = false;
      this.wipeEl.classList.remove('is-in', 'is-out', 'is-quick');
    }
    const again = this.parse();
    if ((again.name || null) !== this.modeName) this.route();
  }

  enterMenu(firstLoad) {
    const s = this.stage;
    this.modeName = null;
    this.board.classList.remove('is-away');
    this.bar.hidden = true;
    this.focused = null;
    this.items.forEach((el, i) => el.classList.toggle('is-on', i === 0));
    s.showPair(false);
    s.place(s.heroIndex);
    s.snap('hero');
    s.setFence(true);
    s.setReflections(true);
    this.setMenuOffset();
    if (firstLoad) this.board.classList.remove('is-away');
  }

  setMenuOffset() {
    const s = this.stage;
    if (innerWidth <= 860) s.setOffset(0, 0.3);
    else s.setOffset(-this.board.offsetWidth / innerWidth / 2, 0);
  }

  openCv(open) {
    this.cv.classList.toggle('is-open', open);
    document.documentElement.classList.toggle('cv-open', open);
    if (open) this.cv.focus({ preventScroll: true });
  }

  // The pit board sweeps across the screen, and whatever changes happens behind it.
  async wipe(label, swap) {
    if (label === null || this.calm()) {
      this.wipeEl.classList.add('is-quick');
      if (label !== null) await wait(160);
      swap();
      await wait(label === null ? 0 : 120);
      this.wipeEl.classList.remove('is-quick');
      return;
    }
    this.wipeEl.firstElementChild.textContent = label;
    this.wipeEl.classList.add('is-in');
    sound.tick(240, 0.12, 0.1);
    await wait(460);
    swap();
    await wait(240);
    this.wipeEl.classList.add('is-out');
    await wait(520);
    this.wipeEl.classList.remove('is-in', 'is-out');
  }

  update(dt, time) {
    return this.mode?.update?.(dt, time);
  }
}
