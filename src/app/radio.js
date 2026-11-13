// Team Radio: the way to actually reach him.
export class Radio {
  constructor(app) {
    this.app = app;
  }

  enter() {
    const { app } = this;
    const s = app.stage;
    s.showPair(false);
    s.place(s.heroIndex);
    s.setReflections(true);
    s.snap('behind');
    s.setOffset(app.phone ? 0 : -0.25, app.phone ? 0.3 : 0);
    app.setPrompts([[['Esc'], 'Menu']]);

    const el = document.createElement('section');
    el.className = 'radio';
    el.setAttribute('aria-labelledby', 'radio-h');
    el.innerHTML = `
      <h2 class="radio__head" id="radio-h">Box, box</h2>
      <p class="radio__prompt"><span>Got a seat on the pit wall?</span> Tell me about the role.</p>
      <form class="field" id="ask">
        <label class="sr" for="role">The role, in a line</label>
        <input id="role" name="subject" type="text" autocomplete="off" placeholder="Junior strategy analyst, 2027 season">
        <button type="submit" aria-label="Send to Eugene"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11h12.2l-4.6-4.6L13 5l7 7-7 7-1.4-1.4 4.6-4.6H4z"/></svg></button>
      </form>
      <p class="radio__note">Opens an email to Eugene with that as the subject.</p>
      <dl class="radio__reach">
        <div><dt>Email</dt><dd><a href="mailto:eugenekkh@gmail.com">eugenekkh@gmail.com</a></dd></div>
        <div><dt>LinkedIn</dt><dd><a href="https://www.linkedin.com/in/justeugene" rel="noopener">linkedin.com/in/justeugene</a></dd></div>
        <div><dt>Currently in</dt><dd>Singapore</dd></div>
        <div><dt>On the radio in</dt><dd>English, Mandarin, Malay and Cantonese</dd></div>
      </dl>`;
    app.root.append(el);
    el.querySelector('#ask').addEventListener('submit', (e) => {
      e.preventDefault();
      const role = el.querySelector('#role').value.trim();
      location.href = `mailto:eugenekkh@gmail.com?subject=${encodeURIComponent(role || 'A seat on the pit wall')}`;
    });
  }

  leave() {}
}
