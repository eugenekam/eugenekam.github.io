// Tabs inside a card. Q and E step through them, the way shoulder buttons do on a console menu.
import { sound } from './audio.js';

export function mountTabs(root, onChange) {
  const tabs = [...root.querySelectorAll('[role=tab]')];
  const panes = [...root.querySelectorAll('[role=tabpanel]')];
  let current = 0;

  const choose = (i, silent) => {
    current = (i + tabs.length) % tabs.length;
    tabs.forEach((t, k) => t.setAttribute('aria-selected', String(k === current)));
    panes.forEach((p, k) => {
      p.hidden = k !== current;
      p.classList.toggle('is-new', k === current);
    });
    if (!silent) sound.tick(820, 0.03, 0.06);
    onChange?.(current, panes[current]);
  };

  tabs.forEach((t, i) => t.addEventListener('click', () => choose(i)));

  return {
    choose,
    key(e) {
      if (e.code === 'KeyE') {
        choose(current + 1);
        return true;
      }
      if (e.code === 'KeyQ') {
        choose(current - 1);
        return true;
      }
      return false;
    },
  };
}

export const tabList = (names, label) => `
  <div class="tabs" role="tablist" aria-label="${label}">
    ${names.map((n, i) => `<button type="button" role="tab" id="tab-${i}" aria-controls="pane-${i}" aria-selected="${i === 0}">${n}</button>`).join('')}
  </div>`;

export const tabPanes = (panes) =>
  panes.map((html, i) => `<div class="pane" role="tabpanel" id="pane-${i}" aria-labelledby="tab-${i}"${i ? ' hidden' : ''}>${html}</div>`).join('');
