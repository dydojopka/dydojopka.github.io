export function nearestVisibleHit(hits) {
  return hits.find((hit) => {
    for (let object = hit.object; object; object = object.parent) if (!object.visible) return false;
    const materials = [hit.object.material].flat();
    const material = materials[hit.face?.materialIndex ?? 0];
    return !material?.clippingPlanes?.some((plane) => plane.distanceToPoint(hit.point) < 0);
  });
}

export function hitBelongsTo(hit, root) {
  if (!root) return false;
  for (let object = hit?.object; object; object = object.parent) if (object === root) return true;
  return false;
}
