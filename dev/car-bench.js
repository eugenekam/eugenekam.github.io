// A one-frame bench for looking at the car alone: /dev/car.html?az=35&el=8&dist=7&fov=26&ty=0.45&tx=0
import * as THREE from 'three';
import '@fontsource-variable/imbue';
import { buildCar } from '../src/stage/car.js';
import { nightEnvironment } from '../src/stage/env.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);

await document.fonts.load('400 100px "Imbue Variable"');

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = num('exp', 1.05);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d14);
scene.environment = nightEnvironment(renderer);

const car = buildCar();
scene.add(car);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.5 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(3, 8, 4);
scene.add(key);

const az = (num('az', 35) * Math.PI) / 180;
const el = (num('el', 8) * Math.PI) / 180;
const dist = num('dist', 7.5);
const camera = new THREE.PerspectiveCamera(num('fov', 26), innerWidth / innerHeight, 0.1, 200);
const target = new THREE.Vector3(num('tx', 0), num('ty', 0.45), 0);
camera.position.set(target.x + Math.cos(az) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, target.z + Math.sin(az) * Math.cos(el) * dist);
camera.lookAt(target);

renderer.render(scene, camera);
window.__ready = true;
