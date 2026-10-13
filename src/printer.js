import * as THREE from 'three';
import { convertCardReader, paintPanel, printerOpening, topVentOpening } from './printer-body.js';
import { createPrinterIndicators } from './printer-indicators.js';
import { createPrinterDisplay } from './printer-display.js';
import { PAPER_WIDTH, PAPER_HEIGHT, PAPER_THICKNESS } from './printer-paper.js';

export function buildPrinter(body, materials) {
  body.name = 'printer';
  const casing = convertCardReader(body);
  const dark = new THREE.MeshStandardMaterial({ color: 0x101512, roughness: 1 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x222923, roughness: 0.95 });
  const paper = materials.paper;
  function box(name, size, position, material = casing, parent = body) {
    const geometry = new THREE.BoxGeometry(...size);
    if (material === casing) paintPanel(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  // The imported vents are real openings in a thin shell. Recessed inner
  // panels keep their depth without exposing the room through the chassis.
  for (const sign of [-1, 1]) {
    box(`vent-liner-side-${sign}`, [0.025, 0.46, 1.30], [sign * 0.895, 0.285, 0], dark);
  }
  box('vent-liner-rear', [1.79, 0.46, 0.025], [0, 0.285, -0.65], dark);
  box('vent-liner-top-front', [1.79, 0.025, 0.65], [0, 0.4775, 0.325], dark);
  box('vent-liner-top-rear', [1.79, 0.025, 0.31], [0, 0.4975, -0.495], dark);
  for (const sign of [-1, 1]) {
    box(`vent-liner-top-side-${sign}`, [0.145, 0.025, 0.34], [sign * 0.8225, 0.4975, -0.17], dark);
  }
  // A closed well blocks shallow camera rays at the edges as well as overhead
  // rays. Broad, untextured louvers keep a clean rhythm at the pixelated scale.
  const grille = new THREE.Group();
  grille.name = 'cooling-grille';
  body.add(grille);
  const { min, max } = topVentOpening;
  const width = max[0] - min[0], length = max[2] - min[2];
  const centerX = (min[0] + max[0]) / 2, centerZ = (min[2] + max[2]) / 2;
  const ventMetal = new THREE.MeshStandardMaterial({ color: 0x62665b, roughness: 0.85, metalness: 0.15 });
  const ventInterior = new THREE.MeshBasicMaterial({ color: 0x090d0b });
  box('grille-well-floor', [width, 0.015, length], [centerX, 0.5075, centerZ], ventInterior, grille);
  for (const x of [min[0] + 0.009, max[0] - 0.009]) {
    box(`grille-wall-x-${x}`, [0.018, 0.043, length], [x, 0.5365, centerZ], ventMetal, grille);
  }
  for (const z of [min[2] + 0.009, max[2] - 0.009]) {
    box(`grille-wall-z-${z}`, [width, 0.043, 0.018], [centerX, 0.5365, z], ventMetal, grille);
  }
  for (let i = 0; i < 7; i++) {
    const louver = box(`grille-louver-${i}`, [0.055, 0.018, length - 0.028],
      [min[0] + 0.075 + i * 0.11, 0.549, centerZ], ventMetal, grille);
    louver.rotation.z = -0.18;
  }
  const slot = printerOpening, depth = slot.front - slot.back;
  // The opening is cut in the original fascia. A recessed channel reaches
  // inside the housing; the sheet actually emerges through that channel.
  box('output-channel-floor', [1.64, 0.018, depth], [0, slot.bottom - 0.009, (slot.front + slot.back) / 2], dark);
  box('output-channel-ceiling', [1.64, 0.018, depth], [0, slot.top + 0.009, (slot.front + slot.back) / 2], dark);
  box('output-channel-back', [1.64, slot.top - slot.bottom, 0.018], [0, 0.145, slot.back - 0.009], dark);
  for (const sign of [-1, 1]) {
    box(`output-channel-side-${sign}`, [0.018, 0.1, depth], [sign * 0.829, 0.145, (slot.front + slot.back) / 2], dark);
  }
  box('output-tray', [1.68, 0.035, 0.85], [0, 0.105, 1.14]);
  box('output-lip', [1.68, 0.06, 0.035], [0, 0.135, 1.5825]);
  for (const sign of [-1, 1]) {
    box(`output-guide-${sign}`, [0.045, 0.065, 0.85], [sign * 0.8175, 0.145, 1.14]);
    box(`output-support-${sign}`, [0.09, 0.0875, 0.86], [sign * 0.65, 0.04375, 1.135], rubber);
  }
  // The top-mounted hopper shares the original paint atlas and chassis axes.
  box('feed-throat-interior', [1.46, 0.015, 0.30], [0, 0.43, -0.17], dark);
  box('feeder-front-foot', [1.56, 0.035, 0.05], [0, 0.5647, 0.005]);
  box('feeder-rear-foot', [1.56, 0.035, 0.05], [0, 0.5647, -0.345]);
  for (const sign of [-1, 1]) box(`feeder-side-foot-${sign}`, [0.05, 0.035, 0.40], [sign * 0.755, 0.5647, -0.17]);
  const hopper = new THREE.Group();
  hopper.name = 'paper-hopper';
  hopper.position.set(0, 0.5822, -0.17);
  hopper.rotation.x = -0.60;
  body.add(hopper);
  // Continue the inclined paper path below the lid, rather than terminating
  // it on a shelf. The lower pocket and guides sit around the open feed throat.
  box('hopper-back', [1.58, 2.12, 0.035], [0, 0.94, -0.075], casing, hopper);
  box('hopper-front-pocket', [1.58, 0.33, 0.035], [0, 0.045, 0.09], casing, hopper);
  for (const sign of [-1, 1]) {
    box(`hopper-side-${sign}`, [0.035, 2.12, 0.055], [sign * 0.7725, 0.94, -0.0475], casing, hopper);
    box(`paper-width-guide-${sign}`, [0.045, 0.56, 0.15], [sign * 0.7225, 0.2, 0.025], casing, hopper);
    box(`paper-guide-tab-${sign}`, [0.13, 0.045, 0.095], [sign * 0.745, 0.50, 0.075], casing, hopper);
  }
  for (const [name, z] of [['front', 0.05], ['rear', -0.07]]) {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.34, 12), rubber);
    roller.name = `feed-roller-${name}`;
    roller.rotation.z = Math.PI / 2;
    roller.position.set(0, -0.105, z);
    roller.castShadow = roller.receiveShadow = true;
    hopper.add(roller);
  }
  // A4 proportions; the lower sheet edges enter the intake between the rollers.
  for (let i = 0; i < 4; i++) {
    box(`input-sheet-${i}`, [PAPER_WIDTH, PAPER_HEIGHT, PAPER_THICKNESS], [(i % 2) * 0.003, 0.855 + i * 0.002, -0.025 + i * 0.009], paper, hopper);
  }
  // Retain the manufacturer's original blue lettering and caution emblem.
  function decal(name, size, position, uv) {
    const geometry = new THREE.PlaneGeometry(...size);
    const coords = geometry.attributes.uv;
    for (let i = 0; i < coords.count; i++) coords.setXY(i, uv[0] + coords.getX(i) * (uv[2] - uv[0]), uv[3] - coords.getY(i) * (uv[3] - uv[1]));
    const mesh = new THREE.Mesh(geometry, casing);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.receiveShadow = true;
    body.add(mesh);
  }
  decal('maker-badge', [0.99, 0.10], [-0.35, 0.447, 0.7113], [0.02, 0.285, 0.52, 0.343]);
  decal('caution-badge', [0.13, 0.13], [0.76, 0.399, 0.7113], [0.876, 0.185, 0.95, 0.265]);
  body.add(createPrinterIndicators());
  body.add(createPrinterDisplay());
  return body;
}
