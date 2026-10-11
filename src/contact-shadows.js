import * as THREE from 'three';

export function addContactShadows(root, names, height) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  // A rounded footprint with a soft penumbra reinforces contact under small
  // props where shadow-map bias would otherwise leave a bright gap.
  for (let inset = 0; inset < 28; inset++) {
    context.fillStyle = `rgba(0,0,0,${0.008 + inset * 0.00065})`;
    context.beginPath();
    context.roundRect(inset, inset, 128 - inset * 2, 128 - inset * 2, 25);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  for (const name of names) {
    const object = root.getObjectByName(name);
    if (!object.visible) continue;
    object.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 1.12, size.z * 1.08),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    shadow.name = `${name}-contact-shadow`;
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(center.x, height, center.z);
    root.add(shadow);
  }
}
