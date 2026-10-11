import * as THREE from 'three';
import { screenTexture } from './textures.js';

export function createScreenBacking(geometry) {
  const positions = geometry.attributes.position;
  const indices = geometry.index.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let i = 0; i < indices.length; i += 3) {
    a.fromBufferAttribute(positions, indices[i]);
    b.fromBufferAttribute(positions, indices[i + 1]);
    c.fromBufferAttribute(positions, indices[i + 2]);
    normal.add(b.sub(a).cross(c.sub(a)));
  }
  normal.normalize();
  // The Unity mesh has its tilt baked into its vertices. A world-XY plane
  // leaves a parallax gap at the glass corners, even when its AABB is wider.
  const horizontal = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
  const vertical = normal.clone().cross(horizontal);
  const basis = new THREE.Matrix4().makeBasis(horizontal, vertical, normal);
  const inverse = basis.clone().invert();
  const bounds = new THREE.Box3();
  for (const index of new Set(indices)) {
    bounds.expandByPoint(a.fromBufferAttribute(positions, index).applyMatrix4(inverse));
  }
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const backing = new THREE.Mesh(
    new THREE.BoxGeometry(size.x + 0.12, size.y + 0.12, 0.03),
    new THREE.MeshBasicMaterial({ color: 0x030906 }),
  );
  backing.name = 'screen-backing';
  // Keep the entire opaque seal just behind the rearmost glass vertex.
  center.z = bounds.min.z - 0.025;
  backing.position.copy(center.applyMatrix4(basis));
  backing.quaternion.setFromRotationMatrix(basis);
  return backing;
}

export function prepareScreen(screen) {
  // glTF submeshes can share vertex buffers with the bezel. Clone before
  // assigning a full-screen UV rectangle to the glass alone.
  screen.geometry = screen.geometry.clone();
  const geometry = screen.geometry;
  const positions = geometry.attributes.position;
  const indices = geometry.index.array;
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const index of indices) bounds.expandByPoint(point.fromBufferAttribute(positions, index));
  const size = bounds.getSize(new THREE.Vector3());
  for (const index of new Set(indices)) {
    geometry.attributes.uv.setXY(index,
      (positions.getX(index) - bounds.min.x) / size.x,
      (positions.getY(index) - bounds.min.y) / size.y);
  }
  geometry.attributes.uv.needsUpdate = true;
  const texture = screenTexture();
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  screen.material = new THREE.MeshBasicMaterial({ map: texture, color: 0xa8cbb0 });
  screen.material.name = 'Phosphor screen';
  screen.name = 'primary-screen';
  screen.castShadow = false;

  // Seal the opening behind the curved glass. Bright exterior pixels must not
  // leak through the seam where the imported screen meets the bezel.
  screen.add(createScreenBacking(geometry));
  return screen;
}
