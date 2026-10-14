import { Box3, BufferAttribute, BufferGeometry, Vector3 } from 'three';

// Centers in the authored keyboard mesh; keep its key shapes, normals and atlas.
const KEYS = [
  ['letter-1', 'tap', [-0.6806, 0.1616, 0.021]],
  ['letter-2', 'tap', [-0.3077, 0.1616, -0.0424]],
  ['letter-3', 'tap', [0.0633, 0.1616, -0.1056]],
  ['letter-4', 'tap', [-0.5911, 0.1575, 0.1231]],
  ['letter-5', 'tap', [-0.2188, 0.1575, 0.0598]],
  ['letter-6', 'tap', [0.1023, 0.1534, 0.1237]],
  ['space', 'space', [-0.242, 0.1497, 0.2899]],
  ['enter', 'enter', [0.5151, 0.1555, -0.0043]],
];
const TRAVEL = 0.025;
const DURATION = 0.18;

function keyParts(geometry) {
  const position = geometry.getAttribute('position');
  const parents = Array.from({ length: position.count }, (_, i) => i);
  function root(i) {
    while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; }
    return i;
  }
  // UV seams and flat normals duplicate corners; join only coincident positions.
  const corners = new Map();
  for (let i = 0; i < position.count; i++) {
    const corner = [position.getX(i), position.getY(i), position.getZ(i)].map((n) => Math.round(n * 10000)).join(',');
    if (corners.has(corner)) parents[i] = corners.get(corner);
    else corners.set(corner, i);
  }
  const index = geometry.index;
  for (let i = 0; i < index.count; i += 3) {
    const a = root(index.getX(i));
    parents[root(index.getX(i + 1))] = a;
    parents[root(index.getX(i + 2))] = a;
  }
  const parts = new Map();
  const point = new Vector3();
  for (let i = 0; i < index.count; i++) {
    const vertex = index.getX(i), id = root(vertex);
    if (!parts.has(id)) parts.set(id, { indices: [], bounds: new Box3() });
    const part = parts.get(id);
    part.indices.push(vertex);
    part.bounds.expandByPoint(point.fromBufferAttribute(position, vertex));
  }
  return [...parts.values()];
}

function subset(geometry, indices) {
  const result = new BufferGeometry();
  const vertices = [...new Set(indices)];
  const remap = new Map(vertices.map((vertex, i) => [vertex, i]));
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const copy = new BufferAttribute(new Float32Array(vertices.length * attribute.itemSize), attribute.itemSize);
    for (let i = 0; i < vertices.length; i++) {
      for (let component = 0; component < attribute.itemSize; component++) copy.setComponent(i, component, attribute.getComponent(vertices[i], component));
    }
    result.setAttribute(name, copy);
  }
  result.setIndex(indices.map((vertex) => remap.get(vertex)));
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

export function createKeyboardController({ keyboard, reducedMotion, random = Math.random, onPress = () => {} }) {
  const keys = [];
  for (const mesh of [...keyboard.children]) {
    if (!mesh.isMesh || !mesh.geometry.index) continue;
    const geometry = mesh.geometry;
    const parts = keyParts(geometry);
    const selected = new Set();
    for (const [name, sound, center] of KEYS) {
      const point = new Vector3(...center);
      const part = parts.find((candidate) => candidate.bounds.getCenter(new Vector3()).distanceTo(point) < 0.001);
      if (!part) continue;
      const key = mesh.clone(false);
      key.name = `keyboard-key-${name}`;
      key.geometry = subset(geometry, part.indices);
      keyboard.add(key);
      keys.push({ mesh: key, sound, center: part.bounds.getCenter(new Vector3()), restY: key.position.y, elapsed: DURATION });
      selected.add(part);
    }
    if (selected.size) {
      mesh.geometry = subset(geometry, parts.filter((part) => !selected.has(part)).flatMap((part) => part.indices));
      geometry.dispose();
    }
  }
  let previous;
  let disposed = false;
  function finish() {
    for (const key of keys) { key.mesh.position.y = key.restY; key.elapsed = DURATION; }
  }
  return {
    get moving() { return keys.some((key) => key.elapsed < DURATION); },
    press() {
      if (disposed || !keys.length) return false;
      const available = keys.filter((key) => key !== previous);
      const key = available[Math.min(available.length - 1, Math.floor(random() * available.length))] ?? keys[0];
      previous = key;
      key.elapsed = reducedMotion.matches ? DURATION : 0;
      key.mesh.position.y = key.restY - (reducedMotion.matches ? 0 : TRAVEL);
      onPress(key.sound, key.mesh.localToWorld(key.center.clone()));
      return true;
    },
    update(delta) {
      if (disposed) return;
      if (reducedMotion.matches) { finish(); return; }
      for (const key of keys) {
        key.elapsed = Math.min(DURATION, key.elapsed + delta);
        const release = Math.max(0, (key.elapsed - 0.04) / (DURATION - 0.04));
        key.mesh.position.y = key.restY - TRAVEL * (1 - release) ** 2;
      }
    },
    finish,
    dispose() { disposed = true; finish(); },
  };
}
