import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { surfaceTexture, landscapeTexture } from './textures.js';
import { createSnow } from './snow.js';
import { prepareScreen } from './screen.js';
import { DESKTOP_Y as desktop, placements, SHOW_PRINTER } from './placements.js';
import { buildPrinter } from './printer.js';
import { addContactShadows } from './contact-shadows.js';

// Authored meshes and atlases from MyScene and MED_Medical. The converter bakes
// Unity transforms and clips the larger building to the workstation room.
export async function createRoom() {
  const { scene: kit } = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/workstation.glb`);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080e12);
  scene.fog = new THREE.FogExp2(0x080e12, 0.032);
  const staticRoot = new THREE.Group();
  staticRoot.name = 'workstation';
  scene.add(staticRoot);
  let screen;
  kit.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (object.material.name === 'Yuri_smol 2') {
      object.material.opacity = 0.35;
      object.material.depthWrite = false;
      object.castShadow = false;
    }
    if (object.material.name === 'PC') {
      screen = object;
    }
  });
  prepareScreen(screen);
  function place(name, position, scale = 1, yaw = 0) {
    const object = kit.getObjectByName(name);
    if (!object) throw new Error(`Missing workstation model: ${name}`);
    object.position.set(...position);
    object.scale.setScalar(scale);
    object.rotation.y = yaw;
    staticRoot.add(object);
    return object;
  }
  for (const [name, { position, scale, yaw }] of Object.entries(placements)) {
    place(name, position, scale, yaw);
  }
  // This atlas is shared with other props: darken only the radiator's paint.
  staticRoot.getObjectByName('radiator').traverse((object) => {
    if (!object.isMesh) return;
    object.material = object.material.clone();
    object.material.color.multiplyScalar(0.32);
    object.material.roughness = 1;
  });
  const grain = surfaceTexture();
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, map: grain, roughness: 0.9, ...extra });
  const metal = material(0x394b42, { metalness: 0.3 });
  const dark = material(0x111b16);
  const paper = material(0xbec4ac, { map: null });
  const printer = buildPrinter(staticRoot.getObjectByName('card-reader'), { paper });
  printer.visible = SHOW_PRINTER;
  addContactShadows(staticRoot, ['monitor', 'keyboard', 'radio-stack', 'plant', 'desk-lamp', 'printer', 'book'], desktop + 0.001);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  function box(size, position, mat, parent = staticRoot) {
    const object = new THREE.Mesh(cube, mat);
    object.position.set(...position);
    object.scale.set(...size);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function cable(points, radius = 0.023) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const object = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 5, false), dark);
    object.castShadow = true;
    staticRoot.add(object);
  }
  // Extend the cropped room into darkness on tall viewports. The visible walls,
  // sill, floor and built-in cupboards retain the original Unity meshes.
  box([200, 0.16, 200], [0, -0.13, 0], material(0x202821));
  box([100, 100, 0.1], [0, 57.3, -2.98], material(0x26382e));
  box([100, 100, 0.1], [54.75, 0, -2.98], material(0x26382e));
  box([0.1, 100, 100], [-7.8, 0, 0], material(0x26382e));
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.2), new THREE.MeshBasicMaterial({ map: landscapeTexture(), fog: false }));
  outside.position.set(0, 3.84, -5.2);
  scene.add(outside);
  box([0.055, 3.32, 0.08], [0.55, 3.86, -2.74], metal);
  box([6.4, 0.032, 0.18], [0, 2.12, -2.77], paper);
  box([0.85, 0.075, 0.86], [4.18, 2.7475, -2.15], metal);
  const bulb = box([0.2, 0.015, 0.22], [1.23, desktop + 0.88, 0.26], new THREE.MeshBasicMaterial({ color: 0xc79d60 }));
  bulb.castShadow = false;
  cable([[-0.15, desktop + 0.14, -1.2], [0.4, desktop + 0.01, -1.42], [0.68, 1.7, -1.49], [0.7, 0.12, -1.49], [2.9, 0.08, -2.1]]);
  if (SHOW_PRINTER) cable([[2.92, desktop + 0.09, -0.7], [3.35, desktop, -1.28], [3.55, 1.8, -1.5], [3.55, 0.1, -1.75], [4.2, 0.1, -2.6]]);
  scene.add(new THREE.HemisphereLight(0x9aadb9, 0x25342a, 0.52));
  const cold = new THREE.DirectionalLight(0xa7bdcf, 1.35);
  cold.position.set(-3, 6, -1.8);
  cold.target.position.set(0, desktop, 0);
  cold.castShadow = true;
  cold.shadow.mapSize.set(2048, 2048);
  Object.assign(cold.shadow.camera, { left: -5.5, right: 5.5, top: 5.5, bottom: -5.5, near: 0.3, far: 16 });
  cold.shadow.bias = -0.00015;
  cold.shadow.normalBias = 0.007;
  cold.shadow.radius = 2.25;
  scene.add(cold, cold.target);
  const fill = new THREE.DirectionalLight(0xa1b9ab, 1.05);
  fill.position.set(-1, 4, 7);
  scene.add(fill);
  const amber = new THREE.SpotLight(0xffcb88, 22, 5, 1.15, 0.85, 2);
  amber.position.set(1.23, desktop + 0.9, 0.28);
  amber.target.position.set(1.65, desktop, 0.65);
  amber.castShadow = true;
  amber.shadow.mapSize.set(1024, 1024);
  amber.shadow.bias = -0.0002;
  amber.shadow.normalBias = 0.004;
  amber.shadow.radius = 2;
  scene.add(amber, amber.target);
  const phosphor = new THREE.PointLight(0x88c394, 1.5, 3, 2);
  phosphor.position.set(-0.4, 3.5, 0.9);
  phosphor.castShadow = true;
  phosphor.shadow.mapSize.set(512, 512);
  phosphor.shadow.bias = -0.0001;
  phosphor.shadow.normalBias = 0.008;
  phosphor.shadow.radius = 2;
  scene.add(phosphor);
  const snow = createSnow();
  scene.add(snow.mesh);
  return { scene, snow, printer, screens: { primary: screen } };
}
