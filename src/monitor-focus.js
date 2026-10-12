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

function cameraPose(camera) { return { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov, aspect: camera.aspect }; }

export function createMonitorFocus({ camera, screen, reducedMotion, onStateChange }) {
  let state = 'room';
  let roomPose;
  let transition;
  function apply(pose) {
    camera.position.copy(pose.position);
    camera.quaternion.copy(pose.quaternion);
    camera.fov = pose.fov;
    camera.aspect = pose.aspect;
    camera.updateProjectionMatrix();
  }
  function setState(value) { state = value; onStateChange(value); }
  function move(destination, nextState, finalState) {
    transition = { from: cameraPose(camera), to: destination, elapsed: 0, finalState };
    setState(nextState);
    if (reducedMotion.matches) finish();
  }
  function finish() {
    if (!transition) return;
    const { to, finalState } = transition;
    transition = undefined;
    apply(to);
    setState(finalState);
  }
  return {
    get state() { return state; },
    get moving() { return Boolean(transition); },
    enter() {
      if (state !== 'room') return;
      roomPose = cameraPose(camera);
      move(monitorView(screen, camera.aspect), 'approaching', 'focused');
    },
    leave() { if (state === 'focused' || state === 'approaching') move(roomPose, 'leaving', 'room'); },
    resize(aspect, nextRoomPose) {
      if (state === 'room') return;
      roomPose = nextRoomPose;
      roomPose.aspect = aspect;
      if (state === 'leaving') { transition.to = roomPose; finish(); }
      else { if (transition) transition.to = monitorView(screen, aspect); else apply(monitorView(screen, aspect)); }
    },
    update(delta) {
      if (!transition) return false;
      if (reducedMotion.matches) { finish(); return true; }
      transition.elapsed += Math.min(delta, 0.1);
      const progress = Math.min(transition.elapsed / 0.65, 1);
      const blend = progress * progress * (3 - 2 * progress);
      camera.position.lerpVectors(transition.from.position, transition.to.position, blend);
      camera.quaternion.slerpQuaternions(transition.from.quaternion, transition.to.quaternion, blend);
      camera.fov = transition.from.fov + (transition.to.fov - transition.from.fov) * blend;
      camera.updateProjectionMatrix();
      if (progress === 1) finish();
      return true;
    },
    finish,
  };
}
