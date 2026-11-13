// The reflections on the car: a dark sky with long floodlight strips, built as a small scene and
// baked into an environment map. Marina Bay is lit by rows of projectors along the track, and long
// bright bars sliding over the bodywork are what make a car look like it is under them.
import * as THREE from 'three';

export function nightEnvironment(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03050b);

  const lamp = (w, h, d, x, y, z, power, tint = [1, 0.98, 0.94]) => {
    const m = new THREE.MeshBasicMaterial();
    m.color.setRGB(tint[0] * power, tint[1] * power, tint[2] * power);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    scene.add(b);
    return b;
  };

  // Two rows of projectors running the length of the road, high on each side.
  for (let i = -5; i <= 5; i++) {
    lamp(0.6, 0.28, 2.6, 8, 9, i * 6, 42);
    lamp(0.6, 0.28, 2.6, -8, 9, i * 6, 42);
  }
  // A long soft bar overhead draws the highlight down the spine of the car.
  lamp(1.5, 0.1, 44, 0, 12, 0, 8);
  lamp(44, 0.1, 0.9, 0, 12.5, -7, 3.4);
  lamp(44, 0.1, 0.9, 0, 12.5, 7, 3.4);

  // The city at street level: a low warm band, cooler above.
  const city = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 7, 48, 1, true), new THREE.MeshBasicMaterial({ side: THREE.BackSide }));
  city.material.color.setRGB(0.13, 0.15, 0.24);
  city.position.y = 4;
  scene.add(city);
  const street = new THREE.Mesh(new THREE.CylinderGeometry(39.5, 39.5, 1.8, 48, 1, true), new THREE.MeshBasicMaterial({ side: THREE.BackSide }));
  street.material.color.setRGB(0.55, 0.42, 0.26);
  street.position.y = 1;
  scene.add(street);

  // The road bounces a little light back up into the undertray.
  const road = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial());
  road.material.color.setRGB(0.05, 0.05, 0.055);
  road.rotation.x = -Math.PI / 2;
  road.position.y = -0.4;
  scene.add(road);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.015);
  pmrem.dispose();
  scene.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  return target.texture;
}
