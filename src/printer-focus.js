import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

export function printerView(printer, aspect, fill = 0.90) {
  printer.updateWorldMatrix(true, true);
  const bounds = new Box3();
  for (const name of ['output-tray', 'printer-display', 'printer-indicators', 'printer-fascia']) {
    bounds.union(new Box3().setFromObject(printer.getObjectByName(name)));
  }
  // Frame the controls and output, letting the tall input stack extend above.
  bounds.expandByPoint(new Vector3(0, 1.35, 0).applyMatrix4(printer.matrixWorld));
  const center = bounds.getCenter(new Vector3());
  const direction = new Vector3(0, 0.42, 1).normalize().transformDirection(printer.matrixWorld);
  const up = new Vector3(0, 1, 0);
  const right = up.clone().cross(direction).normalize();
  const vertical = direction.clone().cross(right).normalize();
  const fov = 38;
  const tangent = Math.tan(fov * Math.PI / 360);
  let distance = 0;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const offset = new Vector3(x, y, z).sub(center);
    distance = Math.max(distance, offset.dot(direction) + Math.max(Math.abs(offset.dot(vertical)), Math.abs(offset.dot(right)) / aspect) / (tangent * fill));
  }
  const position = center.clone().addScaledVector(direction, distance);
  const quaternion = new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(position, center, up));
  return { position, quaternion, fov, aspect };
}
