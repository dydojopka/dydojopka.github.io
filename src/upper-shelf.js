import { Box3, Raycaster, Vector3 } from 'three';

export function settleShelfDecor(decor, furniture) {
  decor.updateWorldMatrix(true, true);
  furniture.updateWorldMatrix(true, true);
  const ray = new Raycaster();
  for (const object of decor.children) {
    if (!object.name.startsWith('Coderoom_Book') && !object.name.startsWith('Painting')) continue;
    const bounds = new Box3().setFromObject(object);
    const origin = bounds.getCenter(new Vector3());
    origin.y = bounds.max.y + 0.1;
    ray.set(origin, new Vector3(0, -1, 0));
    const [support] = ray.intersectObject(furniture);
    if (!support) throw new Error(`Missing upper shelf beneath ${object.name}`);
    // Seat the authored arrangement on the preserved shelf without changing
    // its spacing, lean or orientation. Pipes retain their wall-mounted pose.
    object.position.y += (support.point.y + 0.001 - bounds.min.y) / decor.scale.y;
    object.updateWorldMatrix(false, true);
  }
}
