import '@fontsource-variable/albert-sans';
import '@fontsource-variable/imbue/opsz.css';
import './styles.css';
import './app.css';

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const remember = {
  get() {
    try {
      return localStorage.getItem('kam-motion');
    } catch {
      return null;
    }
  },
  set(value) {
    try {
      localStorage.setItem('kam-motion', value);
    } catch {
      /* Private windows can refuse storage. The choice then lasts for this visit. */
    }
  },
};
let stillMode = calm.matches && remember.get() !== 'on';

async function boot() {
  const test = document.createElement('canvas');
  // Without WebGL the page stays as it arrives: the title, the menu and the full CV.
  if (!test.getContext('webgl2')) return;

  const lap = await fetch(`${import.meta.env.BASE_URL}data/lap.json`).then((r) => r.json());
  const phone = matchMedia('(max-width: 860px)').matches;

  const [{ Stage, HERO_INDEX }, { App }] = await Promise.all([
    import('./stage/stage.js'),
    import('./app/app.js'),
    document.fonts.load('400 100px "Imbue Variable"'),
    document.fonts.load('600 60px "Albert Sans Variable"'),
  ]);

  const stage = new Stage(document.getElementById('scene'), lap, { phone });
  stage.heroIndex = HERO_INDEX;
  stage.setStill(stillMode);
  await stage.loadCity(`${import.meta.env.BASE_URL}data/city.bin`);

  const app = new App({ stage, lap, phone, calm: () => stillMode });
  stage.start((dt, time) => app.update(dt, time));
  document.documentElement.classList.add('is-live');
  window.__app = app;
  window.__stage = stage;

  new ResizeObserver(() => {
    stage.resize();
    if (app.modeName === null) app.setMenuOffset();
  }).observe(stage.canvas);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stage.stop();
    else if (!stage.running) {
      stage.clock.getDelta();
      stage.start(stage.update);
    }
  });

  // Windows and phones can ask sites to hold still. Respect that, and keep the full version one press away.
  if (calm.matches) {
    const buttons = document.querySelectorAll('[data-motion]');
    const show = () => {
      buttons.forEach((b) => {
        b.hidden = false;
        b.setAttribute('aria-pressed', String(!stillMode));
        b.textContent = stillMode ? 'Turn on full motion' : 'Calm version';
      });
    };
    show();
    buttons.forEach((b) => {
      b.addEventListener('click', () => {
        stillMode = !stillMode;
        remember.set(stillMode ? 'off' : 'on');
        stage.setStill(stillMode);
        show();
      });
    });
  }
}

boot()
  .catch(() => document.documentElement.classList.remove('js'))
  .finally(() => {
    window.__ready = true;
  });
