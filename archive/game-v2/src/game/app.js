// The game itself: a main menu, a set of modes, and the wipe that carries you between them.
// The address bar is the state, so the back button, deep links and refreshing all just work.
import { sound } from './audio.js';
import { Career } from './career.js';
import { Garage } from './garage.js';
import { PitWall } from './pitwall.js';
import { Radio } from './radio.js';
import { Trial } from './trial.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const store = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Private windows can refuse storage. Progress then lasts for this visit. */
    }
  },
};

export class App {
  constructor({ stage, lap, phone, calm }) {
    this.stage = stage;
    this.lap = lap;
    this.phone = phone;
    this.calm = calm;
    this.store = store;
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
    this.progress = store.get('kam-progress', {});

    this.modes = {
      trial: new Trial(this),
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

    this.showScouted();
    this.route(true);
  }

  // Marks something as seen, for the scouting total on the menu.
  scout(key) {
    if (this.progress[key]) return;
    this.progress[key] = true;
    store.set('kam-progress', this.progress);
    this.showScouted();
  }

  showScouted() {
    const total = 8 + 8 + 2; // career rounds, garage parts, pit wall solved, trial finished
    const done = Object.keys(this.progress).length;
    const el = document.getElementById('scouted');
    el.textContent = done ? `Scouted ${Math.round((done / total) * 100)}%` : '';
  }

  focusItem(i) {
    if (this.modeName !== null) return;
    if (this.focused === i) return;
    this.focused = i;
    this.items.forEach((el, k) => el.classList.toggle('is-on', k === i));
    this.stage.view(this.items[i].dataset.view, { time: 1.15, arc: this.items[i].dataset.view === 'rise' ? 60 : 0 });
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
    await this.wipe(first ? null : label, () => {
      this.mode?.leave();
      this.root.replaceChildren();
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
    this.busy = false;
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
    s.showGhost(false);
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
