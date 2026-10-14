import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { screenCenter, screenNormal } from './screen.js';

export function monitorView(screen, aspect, fill = 0.9) {
  const center = screenCenter(screen);
  const normal = screenNormal(screen);
  const horizontal = new Vector3(0, 1, 0).cross(normal).normalize();
  const vertical = normal.clone().cross(horizontal).normalize();
  const bounds = new Box3();
  const point = new Vector3();
  for (const index of new Set(screen.geometry.index.array)) {
    point.fromBufferAttribute(screen.geometry.attributes.position, index).applyMatrix4(screen.matrixWorld).sub(center);
    bounds.expandByPoint(new Vector3(point.dot(horizontal), point.dot(vertical), point.dot(normal)));
  }
  const size = bounds.getSize(new Vector3());
  const fov = 38;
  const tangent = Math.tan(fov * Math.PI / 360);
  const distance = Math.max(size.y, size.x / aspect) / (2 * tangent * fill) + bounds.max.z;
  const position = center.clone().addScaledVector(normal, distance);
  const quaternion = new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(position, center, vertical));
  return { position, quaternion, fov, aspect };
}
