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
  const bookCanvas = document.createElement('canvas');
  bookCanvas.width = bookCanvas.height = 128;
  const bookContext = bookCanvas.getContext('2d');
  // A flat book needs full contact up to its cover, not the broad rounded
  // falloff suitable for elevated props. Feather only the outer few texels.
  for (let inset = 0; inset < 8; inset++) {
    bookContext.fillStyle = 'rgba(0,0,0,0.22)';
    bookContext.fillRect(inset, inset, 128 - inset * 2, 128 - inset * 2);
  }
  const bookTexture = new THREE.CanvasTexture(bookCanvas);
  const keyboardCanvas = document.createElement('canvas');
  keyboardCanvas.width = keyboardCanvas.height = 128;
  const keyboardContext = keyboardCanvas.getContext('2d');
  // Reinforce only the narrow contact at the keyboard's base. The lights
  // already cast its directional shadow; this must not add a dark rectangle.
  for (let inset = 0; inset < 6; inset++) {
    keyboardContext.fillStyle = 'rgba(0,0,0,0.32)';
    keyboardContext.beginPath();
    keyboardContext.roundRect(inset, inset, 128 - inset * 2, 128 - inset * 2, 4);
    keyboardContext.fill();
  }
  const keyboardTexture = new THREE.CanvasTexture(keyboardCanvas);
  for (const name of names) {
    const object = root.getObjectByName(name);
    if (!object.visible) continue;
    object.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(object);
    if (name === 'book') {
      bounds.makeEmpty();
      const inverse = object.matrixWorld.clone().invert();
      const point = new THREE.Vector3();
      object.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const matrix = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
        const vertices = mesh.geometry.attributes.position;
        for (let i = 0; i < vertices.count; i++) bounds.expandByPoint(point.fromBufferAttribute(vertices, i).applyMatrix4(matrix));
      });
    }
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    if (name === 'book') {
      size.multiply(object.scale);
      center.applyMatrix4(object.matrixWorld);
    }
    const shadowTexture = name === 'keyboard' ? keyboardTexture : name === 'book' ? bookTexture : texture;
    const opacity = name === 'keyboard' ? 0.35 : name === 'book' ? 0.86 : 0.7;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(size.x * (name === 'keyboard' ? 1.015 : 1.12), size.z * (name === 'keyboard' ? 1.025 : 1.08)),
      new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    shadow.name = `${name}-contact-shadow`;
    shadow.rotation.x = -Math.PI / 2;
    if (name === 'book') shadow.rotation.set(-Math.PI / 2, object.rotation.y, 0, 'YXZ');
    shadow.position.set(center.x, height, center.z);
    root.add(shadow);
  }
}
