import { Quaternion, Vector3 } from 'three';

const DURATION = 0.55;
const smooth = (value) => value * value * (3 - 2 * value);

export function createPaintingController({ painting, scene, camera, reducedMotion, onChange = () => {} }) {
  const { root, size, setArtwork, setPhoto } = painting;
  const parent = root.parent;
  const rest = { position: root.position.clone(), quaternion: root.quaternion.clone(), scale: root.scale.clone() };
  const scale = root.getWorldScale(new Vector3());
  const radius = size.clone().multiply(scale).length() / 2;
  const orientation = new Quaternion();
  const axis = new Vector3(), turn = new Quaternion(), eye = new Vector3();
  let state = 'shelf', transition, stage = 0, disposed = false;

  function changed() { onChange(state); }
  function heldPosition() {
    const halfFov = Math.atan(Math.tan(camera.fov * Math.PI / 360) * Math.min(1, camera.aspect));
    const distance = radius / (Math.sin(halfFov) * 0.84) + camera.near;
    return camera.localToWorld(new Vector3(0, 0, -distance));
  }
  function restore() {
    parent.add(root);
    root.position.copy(rest.position); root.quaternion.copy(rest.quaternion); root.scale.copy(rest.scale);
    root.updateWorldMatrix(true, true);
  }
  function finish() {
    if (!transition) return;
    if (state === 'returning') {
      restore(); state = 'shelf';
    } else {
      root.position.copy(heldPosition()); root.quaternion.copy(orientation); state = 'held';
    }
    transition = undefined; changed();
  }
  function move(nextState) {
    transition = { position: root.position.clone(), quaternion: root.quaternion.clone(), elapsed: 0 };
    state = nextState; changed();
    if (reducedMotion.matches) finish();
  }
  function cancel() {
    if (state === 'shelf') return;
    transition = undefined; restore(); state = 'shelf'; changed();
  }
  return {
    get state() { return state; },
    get active() { return state !== 'shelf'; },
    get moving() { return Boolean(transition); },
    pickup() {
      if (disposed || state !== 'shelf') return false;
      scene.attach(root);
      camera.getWorldQuaternion(orientation);
      move('lifting');
      return true;
    },
    putBack() {
      if (disposed || !['lifting', 'held'].includes(state)) return false;
      move('returning');
      return true;
    },
    rotate(dx, dy, width, height) {
      if (disposed || state !== 'held' || width <= 0 || height <= 0) return false;
      // Screen-space axes keep a drag intuitive even after a complete turn.
      const radians = Math.PI * 2 / Math.max(240, Math.min(width, height));
      camera.getWorldQuaternion(turn);
      axis.set(0, 1, 0).applyQuaternion(turn);
      orientation.premultiply(turn.setFromAxisAngle(axis, dx * radians));
      camera.getWorldQuaternion(turn);
      axis.set(1, 0, 0).applyQuaternion(turn);
      orientation.premultiply(turn.setFromAxisAngle(axis, dy * radians)).normalize();
      root.quaternion.copy(orientation);
      root.updateWorldMatrix(true, true);
      changed();
      return true;
    },
    reveal() {
      if (disposed || state !== 'held') return false;
      camera.getWorldPosition(eye); root.worldToLocal(eye).normalize();
      // Commit only at a rendered view with the entire opposite side hidden.
      // Alternate both images over four views, then repeat the same cycle.
      if (stage % 2 === 0 && eye.z < -0.25) setArtwork(stage === 0);
      else if (stage % 2 === 1 && eye.z > 0.25) setPhoto(stage === 1);
      else return false;
      stage = (stage + 1) % 4;
      return true;
    },
    resize() {
      if (state === 'held') { root.position.copy(heldPosition()); changed(); }
    },
    update(delta) {
      if (disposed || !transition) return;
      if (reducedMotion.matches) { finish(); return; }
      transition.elapsed += Math.min(delta, 0.1);
      const progress = Math.min(transition.elapsed / DURATION, 1), blend = smooth(progress);
      const position = state === 'lifting' ? heldPosition() : parent.localToWorld(rest.position.clone());
      const quaternion = state === 'lifting' ? orientation
        : parent.getWorldQuaternion(new Quaternion()).multiply(rest.quaternion);
      root.position.lerpVectors(transition.position, position, blend);
      root.quaternion.slerpQuaternions(transition.quaternion, quaternion, blend);
      if (progress === 1) finish();
    },
    finish,
    cancel,
    dispose() { cancel(); disposed = true; },
  };
}
