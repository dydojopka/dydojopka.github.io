import { DataTexture, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { WINDOW_CODE_PARTS } from './window-code.js';
import { DESKTOP_Y } from './placements.js';

const NUMERALS = ['I', 'II', 'III', 'IV'];
// Uneven pencil strokes, rather than a system font, keep the marks part of the props.
const STROKES = {
  I: [[[0.3, 0.04], [0.7, 0.04]], [[0.5, 0.04], [0.46, 0.96]], [[0.25, 0.96], [0.7, 0.96]]],
  V: [[[0.08, 0.04], [0.45, 0.96], [0.94, 0.03]]],
  0: [[[0.47, 0.03], [0.15, 0.15], [0.08, 0.71], [0.27, 0.96], [0.73, 0.96], [0.91, 0.73], [0.91, 0.22], [0.7, 0.03], [0.47, 0.03]]],
  1: [[[0.15, 0.25], [0.53, 0.03], [0.5, 0.96]], [[0.2, 0.96], [0.85, 0.96]]],
  2: [[[0.08, 0.18], [0.32, 0.03], [0.76, 0.06], [0.93, 0.27], [0.85, 0.44], [0.1, 0.94], [0.92, 0.96]]],
  3: [[[0.08, 0.06], [0.82, 0.03], [0.92, 0.24], [0.47, 0.48], [0.84, 0.53], [0.94, 0.76], [0.76, 0.96], [0.12, 0.91]]],
  4: [[[0.62, 0.03], [0.08, 0.63], [0.96, 0.63]], [[0.72, 0.22], [0.7, 0.96]]],
  5: [[[0.9, 0.04], [0.18, 0.04], [0.12, 0.47], [0.71, 0.43], [0.93, 0.63], [0.86, 0.87], [0.6, 0.97], [0.1, 0.9]]],
  6: [[[0.84, 0.05], [0.47, 0.07], [0.17, 0.37], [0.08, 0.74], [0.27, 0.96], [0.73, 0.94], [0.92, 0.73], [0.8, 0.51], [0.4, 0.47], [0.14, 0.64]]],
  7: [[[0.07, 0.06], [0.94, 0.03], [0.42, 0.96]], [[0.28, 0.49], [0.8, 0.49]]],
  8: [[[0.48, 0.03], [0.14, 0.13], [0.13, 0.35], [0.82, 0.64], [0.9, 0.83], [0.7, 0.97], [0.25, 0.95], [0.08, 0.77], [0.18, 0.58], [0.81, 0.32], [0.86, 0.13], [0.48, 0.03]]],
  9: [[[0.85, 0.4], [0.57, 0.5], [0.18, 0.43], [0.08, 0.23], [0.29, 0.04], [0.71, 0.04], [0.9, 0.25], [0.8, 0.72], [0.54, 0.96], [0.17, 0.93]]],
};

export function windowClueLabel(part) {
  return `${NUMERALS[part]}  ${WINDOW_CODE_PARTS[part]}`;
}

export function createScratchedClue(part, width, height, { color = '#a69b79', weight = 2.2, lit = false } = {}) {
  const line = windowClueLabel(part);
  const w = line.length * 40 + 16, h = 82;
  const pixels = new Uint8Array(w * h * 4);
  function dot(x, y) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const px = Math.round(x) + dx, py = Math.round(y) + dy;
      if (px < 0 || px >= w || py < 0 || py >= h) continue;
      const distance = Math.hypot(px - x, py - y);
      const alpha = Math.max(0, Math.min(1, weight - distance)) * (0.78 + 0.22 * Math.sin(px * 3 + py * 7) ** 2);
      const i = ((h - 1 - py) * w + px) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
      pixels[i + 3] = Math.max(pixels[i + 3], Math.round(alpha * 255));
    }
  }
  [...line].forEach((letter, column) => {
    for (const path of STROKES[letter] ?? []) for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1], [bx, by] = path[i];
      const steps = Math.ceil(Math.hypot((bx - ax) * 28, (by - ay) * 52) * 2);
      for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        dot(10 + column * 40 + (ax + (bx - ax) * t) * 28,
          9 + (ay + (by - ay) * t) * 52 + Math.sin(column * 2.7) * 1.3);
      }
    }
  });
  const map = new DataTexture(pixels, w, h);
  map.colorSpace = SRGBColorSpace;
  map.needsUpdate = true;
  const Material = lit ? MeshStandardMaterial : MeshBasicMaterial;
  const clue = new Mesh(new PlaneGeometry(width, height), new Material({
    map, color, transparent: true, depthWrite: false, toneMapped: lit,
    ...(lit ? { roughness: 1 } : {}),
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  clue.receiveShadow = lit;
  // Decorative ink must never intercept the existing prop interactions.
  clue.raycast = () => {};
  return clue;
}

export function addDeskWindowClues(workstation) {
  const radio = createScratchedClue(0, 0.7, 0.19, { color: '#756447' });
  radio.name = 'radio-window-clue';
  radio.position.set(-3.4, DESKTOP_Y + 0.002, 0.27);
  radio.rotation.set(-Math.PI / 2, 0, -0.2);
  radio.material.opacity = 0.52;
  const lamp = createScratchedClue(3, 0.64, 0.26, { color: '#8d9780', weight: 2.8 });
  lamp.name = 'lamp-window-clue';
  lamp.position.set(1.15, DESKTOP_Y + 0.002, -0.04);
  lamp.rotation.set(-Math.PI / 2, 0, 0.12);
  lamp.material.opacity = 0;
  workstation.add(radio, lamp);
  return lamp;
}
