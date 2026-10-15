import { Box3, Frustum, Matrix4, Vector2 } from 'three';

export function createPlantController({ plant, foliage, flower, reducedMotion, onPromise }) {
  const angle = new Vector2(), velocity = new Vector2();
  const frustum = new Frustum(), projection = new Matrix4();
  // Include both crowns, even the hidden one, so the new flower cannot pop
  // into the edge of a frame that has only just lost the old leaves.
  const bounds = new Box3().setFromObject(plant).expandByScalar(0.08);
  let touches = 0, lilyTouches = 0, used = false, disposed = false, elapsed = 2;
  function finish() {
    angle.set(0, 0); velocity.set(0, 0); elapsed = 2;
    foliage.rotation.set(0, 0, 0); flower.rotation.set(0, 0, 0);
  }
  return {
    get moving() { return elapsed < 2; },
    press() {
      if (disposed) return false;
      if (flower.visible) {
        lilyTouches = Math.min(lilyTouches + 1, 12);
        if (lilyTouches === 12 && !used) { used = true; onPromise(); }
      } else touches = Math.min(touches + 1, 5);
      if (!reducedMotion.matches) {
        elapsed = 0;
        velocity.x = Math.min(velocity.x + 0.85, 1.8);
        velocity.y = Math.max(-1.8, Math.min(velocity.y + (touches + lilyTouches) % 2 * 1.4 - 0.7, 1.8));
      }
      return true;
    },
    reveal(camera, target, state) {
      if (disposed || touches < 5 || flower.visible || target !== 'printer' || !['approaching', 'focused'].includes(state)) return false;
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      if (frustum.intersectsBox(bounds)) return false;
      finish(); foliage.visible = false; flower.visible = true;
      return true;
    },
    update(delta) {
      if (disposed || elapsed >= 2) return;
      if (reducedMotion.matches) { finish(); return; }
      elapsed += Math.max(0, Math.min(delta, 0.1));
      if (elapsed >= 2) { finish(); return; }
      let remaining = Math.max(0, Math.min(delta, 0.1));
      while (remaining > 0) {
        const step = Math.min(remaining, 1 / 120);
        velocity.addScaledVector(angle, -55 * step).multiplyScalar(Math.exp(-6 * step));
        angle.addScaledVector(velocity, step);
        remaining -= step;
      }
      const crown = flower.visible ? flower : foliage;
      crown.rotation.x = angle.x; crown.rotation.z = angle.y;
    },
    finish,
    dispose() { disposed = true; finish(); },
  };
}
