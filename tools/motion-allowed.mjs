// Preload for the skill's inspectors on a machine with Windows animation effects off: every page
// starts as a visitor with motion allowed. Pages that ask for reduced motion still get it.
import { Page } from 'file:///C:/Users/bryan/.claude/skills/design-taste-frontend/scripts/lib/cdp.mjs';
const original = Page.prototype.setViewport;
Page.prototype.setViewport = async function patched(options) {
  await this.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  return original.call(this, options);
};
