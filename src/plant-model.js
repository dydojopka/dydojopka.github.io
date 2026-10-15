import { Box3, BufferAttribute, BufferGeometry, Group, Vector3 } from 'three';

function subset(geometry, indices) {
  const result = new BufferGeometry();
  const vertices = [...new Set(indices)];
  const remap = new Map(vertices.map((vertex, i) => [vertex, i]));
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const copy = new BufferAttribute(new Float32Array(vertices.length * attribute.itemSize), attribute.itemSize);
    vertices.forEach((vertex, i) => {
      for (let component = 0; component < attribute.itemSize; component++) {
        copy.setComponent(i, component, attribute.getComponent(vertex, component));
      }
    });
    result.setAttribute(name, copy);
  }
  result.setIndex(indices.map((vertex) => remap.get(vertex)));
  result.computeBoundingBox(); result.computeBoundingSphere();
  return result;
}

function foliageIndices(geometry) {
  const position = geometry.attributes.position, indices = geometry.index.array;
  const parents = Array.from({ length: position.count }, (_, i) => i);
  function root(i) {
    while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; }
    return i;
  }
  const corners = new Map();
  for (let i = 0; i < position.count; i++) {
    const key = [position.getX(i), position.getY(i), position.getZ(i)].map((n) => Math.round(n * 10000)).join(',');
    if (corners.has(key)) parents[i] = corners.get(key);
    else corners.set(key, i);
  }
  for (let i = 0; i < indices.length; i += 3) {
    const parent = root(indices[i]);
    parents[root(indices[i + 1])] = parent;
    parents[root(indices[i + 2])] = parent;
  }
  const tops = new Map();
  for (const index of indices) tops.set(root(index), Math.max(tops.get(root(index)) ?? 0, position.getY(index)));
  // In the authored Yuri_smol mesh the pot ends at Y=.759. Only the
  // disconnected stems/leaves extend past .9; glass has its own material.
  return new Set([...indices].filter((index) => tops.get(root(index)) > 0.9));
}

export function preparePlant(plant, lily) {
  const foliage = new Group();
  foliage.name = 'plant-foliage'; foliage.position.y = 0.57;
  const meshes = [];
  plant.traverse((mesh) => {
    if (mesh.isMesh && mesh.material.name === 'Yuri_smol 1') meshes.push(mesh);
  });
  plant.add(foliage);
  plant.updateWorldMatrix(true, true);
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const leaves = foliageIndices(geometry);
    const moving = [], fixed = [];
    for (let i = 0; i < geometry.index.count; i += 3) {
      const triangle = [...geometry.index.array.slice(i, i + 3)];
      (leaves.has(triangle[0]) ? moving : fixed).push(...triangle);
    }
    const crown = mesh.clone(false);
    crown.name = 'plant-leaves'; crown.geometry = subset(geometry, moving);
    crown.matrix.copy(foliage.matrixWorld).invert().multiply(mesh.matrixWorld);
    crown.matrix.decompose(crown.position, crown.quaternion, crown.scale);
    foliage.add(crown);
    mesh.geometry = subset(geometry, fixed);
    geometry.dispose();
  }
  // Turn the two open blooms toward the desk camera before fitting the crown.
  lily.rotation.y = -Math.PI / 2;
  const bounds = new Box3().setFromObject(lily), size = bounds.getSize(new Vector3());
  const scale = Math.min(1.08 / size.y, 0.82 / Math.max(size.x, size.z));
  lily.scale.setScalar(scale);
  lily.position.copy(bounds.getCenter(new Vector3())).multiplyScalar(-scale);
  lily.position.y = -bounds.min.y * scale;
  lily.traverse((mesh) => { if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
  const flower = new Group();
  flower.name = 'plant-lily'; flower.position.copy(foliage.position);
  flower.add(lily); flower.visible = false;
  plant.add(flower);
  return { foliage, flower };
}
