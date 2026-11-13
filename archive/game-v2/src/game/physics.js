// How the car behaves. The acceleration and braking curves are read off the real pole laps: the 80th
// and 90th percentile of what the two cars did at each speed. Grip is tuned so the corners that needed
// about 2 g on the real lap feel right, and a car that's going too fast simply runs wide.
const table = (points) => (x) => {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
};

const ACCEL = table([[0, 13], [35, 14.7], [45, 14.5], [55, 12], [65, 8.5], [75, 5.1], [85, 2.2], [91, 0]]);
const BRAKE = table([[0, 12], [25, 16], [35, 22], [45, 28], [55, 34], [75, 34], [90, 32]]);
const GRIP = table([[0, 18], [25, 24], [35, 29], [55, 37], [75, 44], [90, 50]]);
const GEAR_TOPS = [24, 33, 42, 51, 60, 69, 78, 92];
const R_MIN = 9; // the tightest the car can turn, in metres
const WALL = 8; // how far the car's centre can get from the road's centre

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export class CarPhysics {
  constructor(track, lap) {
    this.track = track;
    this.lap = lap;
    this.q = {};
    this.reset(0, lap.ver.v[0] / 3.6);
  }

  // Puts the car on the racing line at a lap index.
  reset(index, speed = 0) {
    const p = this.track.pose(index, {});
    this.x = p.x;
    this.z = p.z;
    this.yaw = p.yaw;
    this.v = speed;
    this.steer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.pitch = 0;
    this.roll = 0;
    this.hit = 0;
    this.hint = Math.round(index * 3);
    this.track.project(this.x, this.z, this.hint, this.q);
    this.hint = this.q.i;
    this.progress = this.q.progress;
    this.wrongWay = false;
  }

  // What speed the pole lap was doing a little way up the road, for the assists.
  target(factor) {
    const { v } = this.lap.ver;
    const N = this.track.N;
    const i = Math.floor(this.progress);
    const reach = Math.ceil(1 + (this.v * 0.5) / 10);
    let low = Infinity;
    for (let k = 0; k <= reach; k++) low = Math.min(low, v[(i + k) % N]);
    return (low / 3.6) * factor;
  }

  // Which way to steer to stay on the racing line, from -1 to 1.
  steerHelp() {
    const look = 0.9 + Math.max(0.6, this.v * 0.055);
    const p = this.track.pose(this.progress + look, {});
    const want = Math.atan2(-(p.z - this.z), p.x - this.x);
    return clamp(-wrap(want - this.yaw) * 3.2, -1, 1);
  }

  step(dt, input, assist) {
    let { throttle, brake, steer } = input;

    if (assist) {
      const limit = this.target(assist.speed);
      if (assist.pedals) {
        throttle = this.v < limit * 0.985 ? 1 : 0;
        brake = this.v > limit * 1.03 ? Math.min(1, (this.v - limit) / 8) : 0;
        if (input.brake > 0.5) {
          brake = 1;
          throttle = 0;
        }
      }
      steer = clamp(steer + this.steerHelp() * assist.steer, -1, 1);
    }

    this.throttle = throttle;
    this.brake = brake;

    // Steering eases in and snaps back, which makes a keyboard feel like a wheel.
    const rate = Math.abs(steer) < 0.05 || Math.sign(steer) !== Math.sign(this.steer) ? 9 : 5.5;
    this.steer += clamp(steer - this.steer, -rate * dt, rate * dt);

    const v = this.v;
    const grip = GRIP(v);
    const yawMax = Math.min(v / R_MIN, grip / Math.max(v, 4));
    const yawRate = this.steer * yawMax;
    this.yaw = wrap(this.yaw - yawRate * dt);

    // Tyres can only do so much: hard cornering eats into the drive and scrubs a little speed.
    const load = Math.abs(yawRate * v) / grip;
    const drive = ACCEL(v) * throttle * (1 - 0.55 * load * load);
    const stop = BRAKE(v) * brake;
    const scrub = 5 * load * load * (v > 12 ? 1 : 0);
    const coast = throttle < 0.1 ? 0.8 + 0.0017 * v * v : 0;
    this.v = Math.max(0, v + (drive - stop - scrub - coast) * dt);

    this.x += Math.cos(this.yaw) * this.v * dt;
    this.z -= Math.sin(this.yaw) * this.v * dt;

    const q = this.track.project(this.x, this.z, this.hint, this.q);
    this.hint = q.i;

    // The walls: slide along them, losing speed by how square the hit was.
    this.hit = 0;
    if (Math.abs(q.e) > WALL) {
      const over = Math.abs(q.e) - WALL;
      const s = Math.sign(q.e);
      this.x -= q.sx * over * s;
      this.z -= q.sz * over * s;
      const along = Math.atan2(-q.tz, q.tx);
      const angle = wrap(along - this.yaw);
      const square = Math.abs(Math.sin(angle));
      this.hit = square;
      this.v *= 1 - clamp(square * 1.1 + 0.01, 0, 0.7);
      if (Math.abs(angle) < 1.4) this.yaw = wrap(this.yaw + angle * 0.35);
    }

    this.progress = q.progress;
    this.wrongWay = this.v > 5 && Math.cos(this.yaw) * q.tx - Math.sin(this.yaw) * q.tz < -0.25;

    const k = 1 - Math.exp(-8 * dt);
    this.pitch += (clamp((stop - drive) * 0.00042, -0.012, 0.018) - this.pitch) * k;
    this.roll += (clamp(yawRate * v * 0.00028, -0.016, 0.016) - this.roll) * k;
  }

  get gear() {
    return GEAR_TOPS.findIndex((top) => this.v <= top) + 1 || 8;
  }

  // How far through its rev range the current gear is, from 0 to 1.
  get revs() {
    const g = this.gear - 1;
    const low = g ? GEAR_TOPS[g - 1] * 0.74 : 0;
    return clamp((this.v - low) / (GEAR_TOPS[g] - low), 0, 1);
  }

  get lock() {
    return -this.steer * 0.38;
  }
}
