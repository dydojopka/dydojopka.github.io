import * as THREE from 'three';

export const printerOpening = { left: -0.82, right: 0.82, bottom: 0.095, top: 0.195, front: 0.7108, back: 0.37 };
export const feederOpening = { min: [-0.73, 0.515, -0.32], max: [0.73, 0.58, -0.02] };
export const topVentOpening = { min: [-0.93, 0.48, 0.04], max: [-0.12, 0.57, 0.65] };

function splitPolygon(polygon, axis, value) {
  const inside = [], outside = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = a[axis] - value, db = b[axis] - value;
    (da >= 0 ? inside : outside).push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      const vertex = a.map((value, j) => value + (b[j] - value) * t);
      inside.push(vertex);
      outside.push(vertex);
    }
  }
  return [inside, outside];
}

function subtractBox(polygon, min, max) {
  const pieces = [];
  for (let axis = 0; axis < 3; axis++) {
    let outside;
    [polygon, outside] = splitPolygon(polygon, axis, min[axis]);
    if (outside.length > 2) pieces.push(outside);
    [outside, polygon] = splitPolygon(polygon, axis, max[axis]);
    if (outside.length > 2) pieces.push(outside);
  }
  return pieces;
}

// Reuse the original atlas's scratched, unlettered paint strip for new panels.
// UVs are authored in the glTF texture convention (the map has flipY = false).
export function paintPanel(geometry) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const size = bounds.getSize(new THREE.Vector3());
  const positions = geometry.attributes.position;
  const uvs = geometry.attributes.uv;
  for (let i = 0; i < positions.count; i++) {
    uvs.setXY(i, 0.04 + (positions.getX(i) - bounds.min.x) / Math.max(size.x, 0.001) * 0.9,
      0.008 + (positions.getY(i) - bounds.min.y) / Math.max(size.y, 0.001) * 0.045);
  }
  return geometry;
}

function rectangle(path, x0, y0, x1, y1) {
  path.moveTo(x0, y0); path.lineTo(x0, y1); path.lineTo(x1, y1); path.lineTo(x1, y0); path.closePath();
  return path;
}

export function convertCardReader(body) {
  const meshes = [];
  body.traverse((object) => { if (object.isMesh) meshes.push(object); });
  // Recover the front's baked Unity rotation from the largest vertical face.
  let largest = 0, yaw = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const mesh of meshes) {
    const { position } = mesh.geometry.attributes, indices = mesh.geometry.index.array;
    for (let i = 0; i < indices.length; i += 3) {
      a.fromBufferAttribute(position, indices[i]); b.fromBufferAttribute(position, indices[i + 1]); c.fromBufferAttribute(position, indices[i + 2]);
      const face = b.sub(a).cross(c.sub(a)), area = face.length();
      face.normalize();
      if (face.z > 0.8 && Math.abs(face.y) < 0.001 && area > largest) {
        largest = area; yaw = Math.atan2(face.x, face.z);
      }
    }
  }
  const casing = meshes[0].material.clone();
  casing.name = 'Retrofitted CardReader paint';
  for (const [part, mesh] of meshes.entries()) {
    const source = mesh.geometry.clone().rotateY(-yaw);
    const positions = source.attributes.position, normals = source.attributes.normal, uvs = source.attributes.uv;
    const output = [];
    const indices = source.index.array;
    for (let i = 0; i < indices.length; i += 3) {
      const vertices = Array.from(indices.slice(i, i + 3), (index) => [
        positions.getX(index), positions.getY(index), positions.getZ(index),
        normals.getX(index), normals.getY(index), normals.getZ(index), uvs.getX(index), uvs.getY(index),
      ]);
      // Remove the old front sheet and key-card tunnel, retaining the original
      // switches, corner bevels, rear connectors, lid and side ventilation.
      // Replace the tiny imported top louvers, including their sloping undersides.
      const front = vertices.every((v) => v[2] > 0.7107);
      const cardTunnel = vertices.every((v) => v[0] > 0.149 && v[0] < 0.714 && v[1] > 0.223 && v[1] < 0.324 && v[2] > 0.35);
      if (front || cardTunnel) continue;
      const polygons = subtractBox(vertices, feederOpening.min, feederOpening.max)
        .flatMap((polygon) => subtractBox(polygon, topVentOpening.min, topVentOpening.max));
      for (const polygon of polygons) {
        for (let j = 1; j < polygon.length - 1; j++) output.push(polygon[0], polygon[j], polygon[j + 1]);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(output.flatMap((v) => v.slice(0, 3)), 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(output.flatMap((v) => v.slice(3, 6)), 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(output.flatMap((v) => v.slice(6)), 2));
    geometry.normalizeNormals();
    mesh.geometry = geometry;
    mesh.name = `reader-original-${part}`;
    source.dispose();
  }
  const front = rectangle(new THREE.Shape(), -0.939, 0.0212, 0.939, 0.526);
  const slot = printerOpening;
  front.holes.push(rectangle(new THREE.Path(), slot.left, slot.bottom, slot.right, slot.top));
  const fascia = new THREE.Mesh(paintPanel(new THREE.ExtrudeGeometry(front, { depth: 0.018, bevelEnabled: false, curveSegments: 1 })), casing);
  fascia.position.z = slot.front - 0.018;
  fascia.name = 'printer-fascia';
  fascia.castShadow = fascia.receiveShadow = true;
  body.add(fascia);
  return casing;
}
