import * as THREE from 'three';

const STATES = {
  off: [false, false, false],
  ready: [true, false, false],
  printing: [true, true, false],
  error: [true, false, true],
};

const INDICATORS = [
  { letter: 'P', meaning: 'Power', color: 0x70d58b, glyph: ['110', '101', '110', '100', '100'] },
  { letter: 'D', meaning: 'Data / printing', color: 0xefb852, glyph: ['110', '101', '101', '101', '110'] },
  { letter: 'E', meaning: 'Error / paper required', color: 0xec6355, glyph: ['111', '100', '110', '100', '111'] },
];

function letterGeometry(rows) {
  const vertices = [];
  const pixel = 0.013;
  for (let row = 0; row < rows.length; row++) for (let column = 0; column < rows[row].length; column++) {
    if (rows[row][column] !== '1') continue;
    const x = (column - 1.5) * pixel, y = (2.5 - row) * pixel;
    vertices.push(x, y, 0, x, y - pixel, 0, x + pixel, y, 0,
      x + pixel, y, 0, x, y - pixel, 0, x + pixel, y - pixel, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createPrinterIndicators() {
  const group = new THREE.Group();
  group.name = 'printer-indicators';
  // Compact left-hand strip, with the CardReader's narrow rectangular sockets.
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.187, 0.018),
    new THREE.MeshStandardMaterial({ color: 0x222c26, roughness: 0.9 }));
  panel.name = 'indicator-panel';
  panel.position.set(-0.60, 0.3005, 0.72);
  panel.castShadow = panel.receiveShadow = true;
  group.add(panel);
  const socket = new THREE.Shape();
  socket.moveTo(-0.030, -0.046); socket.lineTo(0.030, -0.046);
  socket.lineTo(0.030, 0.046); socket.lineTo(-0.030, 0.046); socket.closePath();
  const aperture = new THREE.Path();
  aperture.moveTo(-0.022, -0.036); aperture.lineTo(-0.022, 0.036);
  aperture.lineTo(0.022, 0.036); aperture.lineTo(0.022, -0.036); aperture.closePath();
  socket.holes.push(aperture);
  const bezelGeometry = new THREE.ExtrudeGeometry(socket, { depth: 0.012, bevelEnabled: false });
  const bezelMaterial = new THREE.MeshStandardMaterial({ color: 0x111813, roughness: 0.9 });
  const backingGeometry = new THREE.BoxGeometry(0.044, 0.072, 0.004);
  const shelfGeometry = new THREE.BoxGeometry(0.043, 0.027, 0.006).rotateX(0.2);
  const shelfMaterial = new THREE.MeshStandardMaterial({ color: 0x889386, roughness: 0.85 });
  const lensGeometry = new THREE.BoxGeometry(0.038, 0.039, 0.004);
  const lettering = new THREE.MeshStandardMaterial({ color: 0xc5c8b1, roughness: 1 });
  for (const [index, { letter, meaning, color, glyph }] of INDICATORS.entries()) {
    const x = -0.76 + index * 0.16;
    const bezel = new THREE.Mesh(bezelGeometry, bezelMaterial);
    bezel.name = `indicator-bezel-${letter}`;
    bezel.position.set(x, 0.337, 0.730);
    bezel.castShadow = bezel.receiveShadow = true;
    const backing = new THREE.Mesh(backingGeometry, bezelMaterial);
    backing.name = `indicator-backing-${letter}`;
    backing.position.set(x, 0.337, 0.731);
    const shelf = new THREE.Mesh(shelfGeometry, shelfMaterial);
    shelf.name = `indicator-shelf-${letter}`;
    shelf.position.set(x, 0.316, 0.735);
    shelf.receiveShadow = true;
    const lens = new THREE.Mesh(lensGeometry, new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0, roughness: 0.35,
    }));
    lens.name = `indicator-${letter}`;
    lens.userData.meaning = meaning;
    lens.position.set(x, 0.351, 0.736);
    const label = new THREE.Mesh(letterGeometry(glyph), lettering);
    label.name = `indicator-label-${letter}`;
    label.position.set(x, 0.247, 0.7305);
    group.add(bezel, backing, shelf, lens, label);
  }
  setPrinterState(group, 'ready');
  return group;
}

// Call after a real printer event, then redraw the scene. No timers or demo
// activity: a powered idle printer shows P alone, including reduced motion.
export function setPrinterState(printer, state) {
  if (!Object.hasOwn(STATES, state)) throw new RangeError(`Unknown printer state: ${state}`);
  const group = printer.getObjectByName('printer-indicators');
  if (!group) throw new Error('Printer indicators are missing');
  for (const [index, { letter, color }] of INDICATORS.entries()) {
    const lens = group.getObjectByName(`indicator-${letter}`);
    const active = STATES[state][index];
    lens.material.color.setHex(color).multiplyScalar(active ? 0.65 : 0.055);
    lens.material.emissiveIntensity = active ? 1.6 : 0;
    lens.userData.active = active;
  }
  group.userData.state = state;
}
