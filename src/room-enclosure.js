import * as THREE from 'three';

const THICKNESS = 0.16;
const WINDOW = { left: -3.8, right: 3.2, bottom: 1.95, top: 5.75 };

export function createRoomEnclosure(importedBounds, materials, furthestCamera) {
  const bounds = importedBounds.clone().expandByScalar(0.12);
  if (furthestCamera) {
    for (const axis of ['x', 'z']) {
      bounds.min[axis] = Math.min(bounds.min[axis], furthestCamera[axis] - 1);
      bounds.max[axis] = Math.max(bounds.max[axis], furthestCamera[axis] + 1);
    }
  }
  // The authored room ends in front of the responsive viewing positions.
  // Extend its outer walls behind the visitor, including narrow viewports.
  bounds.max.z = Math.max(bounds.max.z, 12);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const enclosure = new THREE.Group();
  enclosure.name = 'room-enclosure';
  enclosure.userData.bounds = bounds;

  function panel(name, dimensions, position, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    enclosure.add(mesh);
  }
  panel('room-floor', [size.x + THICKNESS * 2, THICKNESS, size.z + THICKNESS * 2],
    [center.x, bounds.min.y - THICKNESS / 2, center.z], materials.floor);
  panel('room-ceiling', [size.x + THICKNESS * 2, THICKNESS, size.z + THICKNESS * 2],
    [center.x, bounds.max.y + THICKNESS / 2, center.z], materials.wall);
  for (const [name, x] of [['left', bounds.min.x - THICKNESS / 2], ['right', bounds.max.x + THICKNESS / 2]]) {
    panel(`room-wall-${name}`, [THICKNESS, size.y + THICKNESS * 2, size.z + THICKNESS * 2],
      [x, center.y, center.z], materials.wall);
  }
  panel('room-wall-front', [size.x + THICKNESS * 2, size.y + THICKNESS * 2, THICKNESS],
    [center.x, center.y, bounds.max.z + THICKNESS / 2], materials.wall);

  const rear = new THREE.Shape();
  rear.moveTo(bounds.min.x - THICKNESS, bounds.min.y - THICKNESS);
  rear.lineTo(bounds.max.x + THICKNESS, bounds.min.y - THICKNESS);
  rear.lineTo(bounds.max.x + THICKNESS, bounds.max.y + THICKNESS);
  rear.lineTo(bounds.min.x - THICKNESS, bounds.max.y + THICKNESS);
  rear.closePath();
  const opening = new THREE.Path();
  opening.moveTo(WINDOW.left, WINDOW.bottom);
  opening.lineTo(WINDOW.left, WINDOW.top);
  opening.lineTo(WINDOW.right, WINDOW.top);
  opening.lineTo(WINDOW.right, WINDOW.bottom);
  opening.closePath();
  rear.holes.push(opening);
  const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(rear, { depth: THICKNESS, bevelEnabled: false }), materials.wall);
  wall.name = 'room-wall-rear';
  wall.position.z = bounds.min.z - THICKNESS;
  wall.castShadow = wall.receiveShadow = true;
  enclosure.add(wall);

  // Seal the window geometrically without covering the preserved skyline.
  // The pane also blocks shadow rays from any light placed outside the room.
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(WINDOW.right - WINDOW.left, WINDOW.top - WINDOW.bottom),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthWrite: false, side: THREE.DoubleSide }));
  glass.name = 'room-window-glass';
  glass.position.set((WINDOW.left + WINDOW.right) / 2, (WINDOW.bottom + WINDOW.top) / 2, bounds.min.z);
  glass.castShadow = true;
  enclosure.add(glass);
  return enclosure;
}
