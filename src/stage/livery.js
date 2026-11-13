// Eugene's livery, painted on canvases so the lettering is crisp and no real team's branding appears.
// Timing-screen yellow over black: yellow is the colour F1 gives to lost time, which is what he hunts.
import * as THREE from 'three';

export const YELLOW = 0xffd60a;
export const INK = 0x0b0c0e;
const Y = '#ffd60a';
const K = '#0b0c0e';
const NUMBER = '44';
const FACE = '"Imbue Variable", "Times New Roman", serif';

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// On a loft, x is along the car (nose or front at the left) and y is round the section:
// the top of the canvas is v = 1 (underneath), the middle is the crown, the bottom is v = 0.
function band(ctx, w, h, upper, lower, colour) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  upper.forEach(([u, v], i) => (i ? ctx.lineTo(u * w, (1 - v) * h) : ctx.moveTo(u * w, (1 - v) * h)));
  [...lower].reverse().forEach(([u, v]) => ctx.lineTo(u * w, (1 - v) * h));
  ctx.closePath();
  ctx.fill();
}

function tub(colours) {
  const main = colours?.body ?? Y;
  const trim = colours?.trim ?? K;
  return canvas(2048, 1024, (ctx, w, h) => {
    ctx.fillStyle = trim;
    ctx.fillRect(0, 0, w, h);
    // Body colour over the upper surfaces, with a waterline that climbs towards the cockpit.
    band(ctx, w, h, [[0, 0.96], [0.3, 0.72], [0.62, 0.68], [0.76, 0.64], [1, 0.64]], [[0, 0.04], [0.3, 0.28], [0.62, 0.32], [0.76, 0.36], [1, 0.36]], main);
    // A black chevron on the crown of the nose, pointing forward.
    band(ctx, w, h, [[0.16, 0.5], [0.62, 0.585], [0.72, 0.6]], [[0.16, 0.5], [0.62, 0.415], [0.72, 0.4]], trim);
    // The car's cheek: black lower wedge rising behind the front axle.
    band(ctx, w, h, [[0.52, 0.64], [0.78, 0.6], [1, 0.57]], [[0.52, 0.68], [0.76, 0.64], [1, 0.64]], trim);
    band(ctx, w, h, [[0.52, 0.36], [0.76, 0.36], [1, 0.36]], [[0.52, 0.32], [0.78, 0.4], [1, 0.43]], trim);
  });
}

function cover(colours) {
  const main = colours?.body ?? Y;
  const trim = colours?.trim ?? K;
  return canvas(2048, 1024, (ctx, w, h) => {
    ctx.fillStyle = trim;
    ctx.fillRect(0, 0, w, h);
    band(ctx, w, h, [[0, 0.7], [0.3, 0.68], [0.7, 0.62], [1, 0.56]], [[0, 0.3], [0.3, 0.32], [0.7, 0.38], [1, 0.44]], main);
    band(ctx, w, h, [[0.04, 0.53], [0.5, 0.525], [1, 0.51]], [[0.04, 0.47], [0.5, 0.475], [1, 0.49]], trim);
  });
}

function pod(colours) {
  const main = colours?.body ?? Y;
  const trim = colours?.trim ?? K;
  return canvas(2048, 1024, (ctx, w, h) => {
    ctx.fillStyle = trim;
    ctx.fillRect(0, 0, w, h);
    band(ctx, w, h, [[0, 0.68], [0.3, 0.66], [0.7, 0.62], [1, 0.58]], [[0, 0.1], [0.3, 0.1], [0.62, 0.2], [1, 0.36]], main);
  });
}

// Black letters, spread to fit the patch on the sidepod's flank.
function kam() {
  return canvas(1024, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = K;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `400 ${h * 0.92}px ${FACE}`;
    ctx.fillText('KAM', w / 2, h * 0.53);
  });
}

function number() {
  return canvas(512, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = Y;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `400 ${h * 0.9}px ${FACE}`;
    ctx.fillText(NUMBER, w / 2, h * 0.54);
  });
}

function fin(colours) {
  const main = colours?.body ?? Y;
  const trim = colours?.trim ?? K;
  const lettered = !colours;
  return canvas(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = main;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = trim;
    ctx.fillRect(0, 0, w * 0.2, h);
    if (lettered) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `400 ${h * 0.5}px ${FACE}`;
      ctx.fillText(NUMBER, w * 0.62, h * 0.42);
    }
  });
}

function endplate(colours) {
  const main = colours?.body ?? Y;
  const trim = colours?.trim ?? K;
  const lettered = !colours;
  return canvas(512, 620, (ctx, w, h) => {
    ctx.fillStyle = main;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = trim;
    ctx.fillRect(0, h * 0.72, w, h * 0.28);
    if (lettered) {
      ctx.fillStyle = K;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `400 ${h * 0.46}px ${FACE}`;
      ctx.fillText('KAM', w / 2, h * 0.38);
    }
  });
}

function carbon() {
  const t = canvas(256, 256, (ctx, w, h) => {
    const cell = 16;
    for (let y = 0; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        const odd = (x / cell + y / cell) % 2;
        ctx.fillStyle = odd ? '#3a3c42' : '#23252a';
        ctx.fillRect(x, y, cell, cell);
        ctx.fillStyle = odd ? '#44464d' : '#1b1d21';
        if (odd) ctx.fillRect(x + 2, y, cell - 4, cell);
        else ctx.fillRect(x, y + 2, cell, cell - 4);
      }
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 8);
  return t;
}

function wheel() {
  return canvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.strokeStyle = Y;
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#1b1c20';
    for (let i = 0; i < 5; i++) {
      ctx.rotate((Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.moveTo(-14, 30);
      ctx.lineTo(14, 30);
      ctx.lineTo(30, w * 0.43);
      ctx.lineTo(-30, w * 0.43);
      ctx.closePath();
      ctx.fill();
    }
  });
}

export function paintTextures(colours) {
  return {
    tub: tub(colours),
    cover: cover(colours),
    pod: pod(colours),
    kam: kam(),
    number: number(),
    fin: fin(colours),
    endplate: endplate(colours),
    carbon: carbon(),
    wheel: wheel(),
  };
}
