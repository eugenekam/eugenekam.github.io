// Keyboard, touch and gamepad, all reduced to the same three numbers.
const KEYS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

export class Input {
  constructor() {
    this.held = new Set();
    this.touch = { up: false, down: false, left: false, right: false };
    this.onKey = (e) => {
      const name = KEYS[e.code];
      if (!name) return;
      e.preventDefault();
      if (e.type === 'keydown') this.held.add(name);
      else this.held.delete(name);
    };
    this.onBlur = () => this.held.clear();
  }

  attach() {
    addEventListener('keydown', this.onKey);
    addEventListener('keyup', this.onKey);
    addEventListener('blur', this.onBlur);
  }

  detach() {
    removeEventListener('keydown', this.onKey);
    removeEventListener('keyup', this.onKey);
    removeEventListener('blur', this.onBlur);
    this.held.clear();
    Object.keys(this.touch).forEach((k) => (this.touch[k] = false));
  }

  read() {
    const on = (name) => this.held.has(name) || this.touch[name];
    let throttle = on('up') ? 1 : 0;
    let brake = on('down') ? 1 : 0;
    let steer = (on('right') ? 1 : 0) - (on('left') ? 1 : 0);

    const pad = navigator.getGamepads?.().find(Boolean);
    if (pad) {
      const stick = pad.axes[0] ?? 0;
      if (Math.abs(stick) > 0.08) steer = stick;
      throttle = Math.max(throttle, pad.buttons[7]?.value ?? 0);
      brake = Math.max(brake, pad.buttons[6]?.value ?? 0);
    }
    return { throttle, brake, steer };
  }
}
