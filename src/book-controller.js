import { Box3, Quaternion, Vector3 } from 'three';

const VARIANTS = [
  { duration: 0.36, turns: 2, yaw: 0.022, slide: 0.003, rock: 0 },
  { duration: 0.34, turns: 3, yaw: 0.011, slide: 0.014, rock: 0 },
  { duration: 0.42, turns: 2.5, yaw: 0.025, slide: 0.005, rock: 0.018 },
];

export function createBookController({ book, shadow, reducedMotion, onRead = () => false }) {
  const position = book.position.clone(), rotation = book.quaternion.clone();
  const shadowPosition = shadow?.position.clone(), shadowRotation = shadow?.quaternion.clone();
  const restBottom = new Box3().setFromObject(book).min.y;
  const bounds = new Box3(), offset = new Quaternion();
  const up = new Vector3(0, 1, 0), side = new Vector3(0, 0, 1);
  let variant = 0, elapsed = 0, moving = false, presses = 0, shown = false, disposed = false;

  function restore() {
    book.position.copy(position); book.quaternion.copy(rotation);
    if (shadow) { shadow.position.copy(shadowPosition); shadow.quaternion.copy(shadowRotation); }
    book.updateWorldMatrix(true, true);
  }
  function finish() {
    const completed = moving;
    moving = false;
    restore();
    if (completed && presses >= 3 && !shown) shown = onRead() === true;
  }
  return {
    get moving() { return moving; },
    press() {
      if (disposed || moving) return false;
      presses++;
      variant = (presses - 1) % VARIANTS.length;
      elapsed = 0; moving = true;
      if (reducedMotion.matches) finish();
      return true;
    },
    update(delta) {
      if (!moving || disposed) return;
      if (reducedMotion.matches) { finish(); return; }
      const profile = VARIANTS[variant];
      elapsed = Math.min(profile.duration, elapsed + delta);
      if (elapsed >= profile.duration) { finish(); return; }
      const t = elapsed / profile.duration;
      const wave = Math.sin(t * Math.PI * 2 * profile.turns) * (1 - t) ** 2;
      book.position.copy(position);
      book.position.x += wave * profile.slide;
      book.quaternion.copy(rotation).multiply(offset.setFromAxisAngle(up, wave * profile.yaw));
      book.quaternion.multiply(offset.setFromAxisAngle(side, wave * profile.rock));
      // Tilt around the base, then lift just enough to keep the cover off the desk.
      const penetration = restBottom - bounds.setFromObject(book).min.y;
      if (penetration > 0) {
        const world = book.getWorldPosition(new Vector3());
        world.y += penetration;
        book.position.copy(book.parent ? book.parent.worldToLocal(world) : world);
      }
      if (shadow) {
        shadow.position.copy(shadowPosition); shadow.position.x += wave * profile.slide;
        shadow.quaternion.copy(shadowRotation).premultiply(offset.setFromAxisAngle(up, wave * profile.yaw));
      }
    },
    finish,
    cancel() { moving = false; restore(); },
    dispose() { disposed = true; moving = false; restore(); },
  };
}
