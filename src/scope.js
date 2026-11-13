// The one live thing on the page: drag along the real lap and read what each car was doing.
// Speeds are real samples. The gap between the timing lines is a trend, so it shows fewer decimals
// there and the exact official figure only at the lines themselves.
const SVG = 'http://www.w3.org/2000/svg';
const LINE_WINDOW = 1; // points either side of a timing line where the official figure is shown

const svg = (tag, attrs = {}) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

const path = (ys, map) => ys.map((y, i) => `${i ? 'L' : 'M'}${i} ${map(y).toFixed(2)}`).join('');

// Where Leclerc is at the moment Verstappen reaches this point, from the same trend the readout uses.
export function lecIndexAt(lap, value) {
  const last = lap.delta.length - 1;
  const i = Math.max(0, Math.min(last - 1, Math.round(value)));
  const perPoint = lap.ver.t[i + 1] - lap.ver.t[i];
  return Math.max(0, value - lap.delta[i] / perPoint);
}

export function mountScope(lap, onChange) {
  const plot = document.getElementById('plot');
  const scrub = document.getElementById('scrub');
  const last = lap.delta.length - 1;
  scrub.max = last;

  const out = {
    where: document.getElementById('r-where'),
    metres: document.getElementById('r-metres'),
    gap: document.getElementById('r-gap'),
    who: document.getElementById('r-who'),
    ver: document.getElementById('r-ver'),
    lec: document.getElementById('r-lec'),
    apex: document.getElementById('r-apex'),
  };

  const speedTop = 26;
  const speedShare = 0.6;

  const speed = svg('svg', { preserveAspectRatio: 'none' });
  const gap = svg('svg', { preserveAspectRatio: 'none' });
  speed.style.cssText = `top:${speedTop}px;height:calc(${speedShare * 100}% - ${speedTop}px)`;
  gap.style.cssText = `bottom:0;height:calc(${(1 - speedShare) * 100}% - 6px)`;

  const H = 100;
  const speedY = (v) => H - (v / 330) * H;
  const stroke = { fill: 'none', 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' };
  speed.append(
    svg('path', { d: path(lap.ver.v, speedY), stroke: '#2b5fb8', 'stroke-width': 2, ...stroke }),
    svg('path', { d: path(lap.lec.v, speedY), stroke: '#d3102a', 'stroke-width': 2, ...stroke }),
  );

  const span = Math.max(...lap.delta.map(Math.abs)) * 1.25;
  const gapY = (d) => H / 2 - (d / span) * (H / 2); // above the line: Verstappen ahead
  gap.append(
    svg('path', { d: `M0 ${H / 2}L${last} ${H / 2}`, stroke: '#0b0c0e', 'stroke-width': 1, 'stroke-dasharray': '3 4', ...stroke }),
    svg('path', { d: path(lap.delta, gapY), stroke: '#0b0c0e', 'stroke-width': 2.5, ...stroke }),
  );

  const labelA = Object.assign(document.createElement('span'), { className: 'label', textContent: 'Speed, km/h' });
  labelA.style.top = `${speedTop}px`;
  const labelB = Object.assign(document.createElement('span'), { className: 'label', textContent: 'Verstappen ahead' });
  labelB.style.bottom = `calc(${(1 - speedShare) * 100}% - 26px)`;
  const labelC = Object.assign(document.createElement('span'), { className: 'label', textContent: 'Leclerc ahead' });
  labelC.style.bottom = '0';

  const corners = lap.corners.map((c) => {
    const el = Object.assign(document.createElement('span'), { className: 'corner', textContent: c.n });
    el.style.top = '0';
    plot.append(el);
    return { el, i: c.i, n: c.n };
  });

  // Official timing lines, marked where the numbers are exact.
  const marks = [0, ...lap.lines, last].map((i) => {
    const el = document.createElement('i');
    el.style.cssText = 'position:absolute;width:9px;height:9px;background:#0b0c0e;transform:translate(-50%,-50%) rotate(45deg)';
    plot.append(el);
    return { el, i };
  });

  const cursor = Object.assign(document.createElement('div'), { className: 'cursor' });
  plot.append(speed, gap, labelA, labelB, labelC, cursor);

  const view = { a: 0, b: last };
  let anim = 0;

  function frame() {
    const w = view.b - view.a;
    speed.setAttribute('viewBox', `${view.a} 0 ${w} ${H}`);
    gap.setAttribute('viewBox', `${view.a} 0 ${w} ${H}`);
    const width = plot.clientWidth;
    const height = plot.clientHeight;
    const gapTop = height * speedShare + 6;
    const gapH = height - gapTop;
    let previous = -Infinity;
    for (const c of corners) {
      const x = ((c.i - view.a) / w) * 100;
      const px = (x / 100) * width;
      const keep = c.n === 7 || c.n === 16; // the two the story turns on always get their number
      const show = x >= 0 && x <= 100 && (keep || px - previous >= 22);
      c.el.style.display = show ? '' : 'none';
      c.el.style.left = `${x}%`;
      if (show) previous = px;
    }
    for (const m of marks) {
      const x = ((m.i - view.a) / w) * 100;
      m.el.style.display = x >= -1 && x <= 101 ? '' : 'none';
      m.el.style.left = `${x}%`;
      m.el.style.top = `${gapTop + (gapY(lap.delta[m.i]) / H) * gapH}px`;
    }
    const x = ((Number(scrub.value) - view.a) / w) * 100;
    cursor.style.left = `${Math.min(100, Math.max(0, x))}%`;
    cursor.style.display = x < 0 || x > 100 ? 'none' : '';
  }

  function zoom(a, b) {
    cancelAnimationFrame(anim);
    const from = { ...view };
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 620);
      const k = 1 - (1 - t) ** 4;
      view.a = from.a + (a - from.a) * k;
      view.b = from.b + (b - from.b) * k;
      frame();
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  const timeAt = (times, t) => {
    let lo = 0;
    let hi = times.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) lo = mid;
      else hi = mid;
    }
    return lo + (t - times[lo]) / (times[hi] - times[lo] || 1);
  };

  function nearestCorner(i) {
    let best = null;
    for (const c of lap.corners) if (!best || Math.abs(c.i - i) < Math.abs(best.i - i)) best = c;
    return Math.abs(best.i - i) <= 7 ? best : null;
  }

  function update(value, silent) {
    const i = Math.round(value);
    scrub.value = i;
    const c = nearestCorner(i);
    const sector = i < lap.lines[0] ? 'one' : i < lap.lines[1] ? 'two' : 'three';
    out.where.textContent = i >= last ? 'The finish line' : c ? `Turn ${c.n}` : `Sector ${sector}`;
    out.metres.textContent = `${lap.m[i].toLocaleString('en-GB')} m`;
    const d = lap.delta[i];
    const exact = [0, ...lap.lines, last].some((l) => Math.abs(l - i) <= LINE_WINDOW);
    out.gap.textContent = i === 0 ? '0.000' : `${exact ? '' : '≈ '}${Math.abs(d).toFixed(exact ? 3 : 2)}`;
    out.who.textContent = i === 0 ? 'level' : d > 0 ? 'Leclerc behind' : 'Leclerc ahead';
    out.ver.textContent = lap.ver.v[i];
    out.lec.textContent = lap.lec.v[i];
    // Raw samples for the corner: what the written findings quote, so a reader can check them here.
    out.apex.textContent = c
      ? `Apex VER ${c.ver}, LEC ${c.lec} km/h. Lowest gear VER ${c.verGear}, LEC ${c.lecGear}.`
      : 'Between corners.';
    frame();
    if (!silent) onChange?.(value, lecIndexAt(lap, value));
  }

  const press = (active) => {
    document.querySelectorAll('[data-jump]').forEach((b) => b.setAttribute('aria-pressed', String(b === active)));
  };

  document.querySelectorAll('[data-jump]').forEach((b) => {
    b.addEventListener('click', () => {
      stop();
      press(b);
      const key = b.dataset.jump;
      if (key === 'all') {
        zoom(0, last);
        return;
      }
      const c = lap.corners.find((x) => x.n === Number(key));
      zoom(Math.max(0, c.i - 26), Math.min(last, c.i + 16));
      let low = c.i;
      for (let i = c.i - 8; i <= c.i + 8; i++) if (lap.ver.v[i] < lap.ver.v[low]) low = i;
      update(low);
    });
  });

  scrub.addEventListener('input', () => {
    stop();
    update(Number(scrub.value));
  });

  let dragging = false;
  const fromPointer = (e) => {
    const r = plot.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    return view.a + k * (view.b - view.a);
  };
  plot.addEventListener('pointerdown', (e) => {
    dragging = true;
    plot.setPointerCapture(e.pointerId);
    stop();
    update(fromPointer(e));
  });
  plot.addEventListener('pointermove', (e) => {
    if (dragging) update(fromPointer(e));
  });
  plot.addEventListener('pointerup', () => {
    dragging = false;
  });

  // Run the lap in real time, the 91 seconds it really took.
  const play = document.getElementById('play');
  let raf = 0;
  let began = 0;
  let offset = 0;
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    play.setAttribute('aria-pressed', 'false');
    play.textContent = 'Run the lap';
  }
  play.addEventListener('click', () => {
    if (raf) {
      stop();
      return;
    }
    press(null);
    zoom(0, last);
    const i = Number(scrub.value) >= last ? 0 : Number(scrub.value);
    offset = lap.ver.t[i];
    began = performance.now();
    play.setAttribute('aria-pressed', 'true');
    play.textContent = 'Pause';
    const step = (now) => {
      const t = offset + (now - began) / 1000;
      const end = lap.ver.t[last];
      if (t >= end) {
        update(last);
        stop();
        return;
      }
      update(timeAt(lap.ver.t, t));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });

  new ResizeObserver(frame).observe(plot);
  update(0, true);
  return { update, stop, current: () => Number(scrub.value) };
}
