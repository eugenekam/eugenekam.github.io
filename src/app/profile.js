// Profile: the driver-select screen. Who Eugene is, and every headline number links to its proof.
// The words are read from the CV in the page, so there's only one copy of them to keep right.
import { mountTabs, tabList, tabPanes } from './tabs.js';

const FACTS = [
  ['Code', 'KAM'],
  ['Car', '44'],
  ['Currently in', 'Singapore'],
  ['Willing to', 'Relocate'],
];

const PROOF = [
  ['10×', 'ticket surge, with SLA held at 98%+', '#/career/5ca'],
  ['1,000+', 'vessels in one clean database', '#/career/seaquest'],
  ['20', 'delivery loads a week, sequenced solo', '#/career/rectitude'],
  ['70%', 'of daily sales from a product he co-developed', '#/career/papayen'],
  ['0.054', 'a real pole lap taken apart', '#/pitwall'],
  ['4', 'languages on the radio', '#/garage/driver'],
];

// Each tab turns the camera to something new, so a click always moves the world.
const VIEWS = ['cockpit', 'side', 'close', 'behind'];

export class Profile {
  constructor(app) {
    this.app = app;
  }

  enter() {
    const { app } = this;
    const s = app.stage;
    const [hello, job, proof, next] = [...document.querySelectorAll('.cv__text > p:not(.sign)')].map((p) => p.textContent);

    s.showPair(false);
    s.place(s.heroIndex);
    s.setReflections(true);
    s.snap(VIEWS[0]);
    s.setOffset(app.phone ? 0 : 0.14, app.phone ? 0.3 : 0);

    this.el = document.createElement('section');
    this.el.className = 'profile';
    this.el.setAttribute('aria-label', 'Profile');
    this.el.innerHTML = `
      <aside class="card" data-ui>
        <p class="card__round">Driver profile</p>
        <h2 class="card__name">Eugene Kam</h2>
        <p class="card__role">Operations, support and data specialist, seeking for analytics-focused role</p>
        <dl class="facts">${FACTS.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        ${tabList(['Who', 'Proof', 'Track record', 'Next'], 'About Eugene')}
        ${tabPanes([
          `<p class="card__story">${hello}</p><p class="card__story">${job}</p>`,
          `<p class="card__story">${proof}</p>`,
          `<ul class="jumps">${PROOF.map(([n, label, href]) => `<li><a href="${href}"><strong>${n}</strong><span>${label}</span></a></li>`).join('')}</ul>`,
          `<p class="card__story">${next}</p><a class="button-link button-link--main" href="#/radio">Talk to Eugene</a>`,
        ])}
      </aside>`;
    app.root.append(this.el);
    const card = this.el.querySelector('.card');
    requestAnimationFrame(() => card.classList.add('is-in'));

    this.tabs = mountTabs(card, (i) => s.view(VIEWS[i], { time: 1.1 }));
    app.setPrompts([[['Q', 'E'], 'Tabs'], [['Esc'], 'Menu']]);
  }

  key(e) {
    return this.tabs.key(e);
  }

  leave() {}
}
