import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { surfaceTexture } from './textures.js';
import { createSnow } from './snow.js';
import { prepareScreen, screenCenter, screenNormal } from './screen.js';
import { DESKTOP_Y as desktop, placements } from './placements.js';
import { buildPrinter } from './printer.js';
import { addContactShadows } from './contact-shadows.js';
import { createExterior } from './exterior.js';
import { createRoomEnclosure } from './room-enclosure.js';
import { createRoomLighting } from './room-lighting.js';
import { cameraView } from './layout.js';
import { settleShelfDecor } from './upper-shelf.js';
import { disposeScene } from './dispose-scene.js';

// Authored meshes and atlases from MyScene and MED_Medical. The converter bakes
// Unity transforms and clips the larger building to the workstation room.
export async function createRoom({ screenTexture }) {
  const loader = new GLTFLoader();
  const models = await Promise.allSettled([
    loader.loadAsync(`${import.meta.env.BASE_URL}models/workstation.glb`),
    loader.loadAsync(`${import.meta.env.BASE_URL}models/exterior.glb`),
  ]);
  const failure = models.find((model) => model.status === 'rejected');
  if (failure) {
    for (const model of models) if (model.status === 'fulfilled') disposeScene(model.value.scene);
    throw failure.reason;
  }
  const [{ scene: kit }, { scene: exterior }] = models.map((model) => model.value);
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
  prepareScreen(screen, screenTexture);
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
  settleShelfDecor(staticRoot.getObjectByName('upper-shelf'), staticRoot.getObjectByName('room-furniture'));
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
  // Close the cropped room with a finite enclosure. Its original walls,
  // sill, floor and built-in cupboards retain the authored Unity meshes.
  const roomBounds = new THREE.Box3().setFromObject(staticRoot.getObjectByName('room'));
  const focus = screenCenter(screen);
  const normal = screenNormal(screen);
  const deskBounds = new THREE.Box3().setFromObject(staticRoot.getObjectByName('desk'));
  const furthestCamera = new THREE.Vector3(...cameraView(0.1, deskBounds, focus, normal).position);
  staticRoot.add(createRoomEnclosure(roomBounds, { wall: material(0x26382e), floor: material(0x202821) }, furthestCamera));
  scene.add(createExterior(exterior));
  box([6.4, 0.032, 0.18], [0, 2.12, -2.77], paper);
  box([0.85, 0.075, 0.86], [4.18, 2.7475, -2.15], metal);
  cable([[-0.15, desktop + 0.14, -1.2], [0.4, desktop + 0.01, -1.42], [0.68, 1.7, -1.49], [0.7, 0.12, -1.49], [2.9, 0.08, -2.1]]);
  cable([[2.92, desktop + 0.09, -0.7], [3.35, desktop, -1.28], [3.55, 1.8, -1.5], [3.55, 0.1, -1.75], [4.2, 0.1, -2.6]]);
  const radioBounds = new THREE.Box3().setFromObject(staticRoot.getObjectByName('radio-stack'));
  scene.add(createRoomLighting(focus, normal, radioBounds));
  const snow = createSnow();
  scene.add(snow.mesh);
  return { scene, snow, screens: { primary: screen }, printer };
}
