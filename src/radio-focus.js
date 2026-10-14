import { Box3, Matrix4, Quaternion, Vector2, Vector3 } from 'three';

// The large UV triangles enclosing the frequency display define the front
// panels. Their vertices already include Unity's small baked-in rotations.
export function radioPanels(radio) {
  radio.updateWorldMatrix(true, true);
  const panels = [];
  const display = new Vector2(287 / 1024, 48 / 1024);
  radio.traverse((object) => {
    if (!object.isMesh || !object.name.startsWith('RES_Work_Radio')) return;
    const { position, uv } = object.geometry.attributes;
    const indices = object.geometry.index.array;
    let largest;
    for (let i = 0; i < indices.length; i += 3) {
      const ids = [indices[i], indices[i + 1], indices[i + 2]];
      const tex = ids.map((id) => new Vector2().fromBufferAttribute(uv, id));
      const ab = tex[1].clone().sub(tex[0]), ac = tex[2].clone().sub(tex[0]);
      const area = ab.cross(ac);
      if (Math.abs(area) < 0.01) continue;
      // A display can straddle the diagonal of the same rectangular face.
      const min = tex.reduce((a, b) => a.min(b), new Vector2(Infinity, Infinity));
      const max = tex.reduce((a, b) => a.max(b), new Vector2(-Infinity, -Infinity));
      if (display.x < min.x || display.x > max.x || display.y < min.y || display.y > max.y) continue;
      const points = ids.map((id) => new Vector3().fromBufferAttribute(position, id).applyMatrix4(object.matrixWorld));
      const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
      if (!largest || Math.abs(area) > largest.area) largest = { points, normal, area: Math.abs(area) };
    }
    if (largest) {
      const bounds = new Box3().setFromPoints(largest.points);
      panels.push({ object, bounds, normal: largest.normal, center: bounds.getCenter(new Vector3()) });
    }
  });
  if (!panels.length) throw new Error('Не найдены передние панели радиоприёмника.');
  return panels;
}

export function radioEmitter(radio) {
  const panels = radioPanels(radio);
  const position = panels.reduce((sum, panel) => sum.add(panel.center), new Vector3()).divideScalar(panels.length);
  const direction = panels.reduce((sum, panel) => sum.add(panel.normal), new Vector3()).normalize();
  return { position: position.addScaledVector(direction, 0.035), direction };
}

export function radioFrontHit(radio, hit) {
  if (!hit?.face) return false;
  const { direction } = radioEmitter(radio);
  return hit.face.normal.clone().transformDirection(hit.object.matrixWorld).dot(direction) > 0.5;
}

export function radioView(radio, aspect, fill = 0.90) {
  const panels = radioPanels(radio);
  const bounds = panels.reduce((result, panel) => result.union(panel.bounds), new Box3()).expandByScalar(0.035);
  const center = bounds.getCenter(new Vector3());
  const direction = panels.reduce((sum, panel) => sum.add(panel.normal), new Vector3()).normalize();
  direction.add(new Vector3(0, 0.10, 0)).normalize();
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
