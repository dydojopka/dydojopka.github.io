export function cameraPose(camera) {
  return { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov, aspect: camera.aspect };
}

export function createFocusTransition({ camera, view, reducedMotion, onStateChange }) {
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
  function finish() {
    if (!transition) return;
    const { to, finalState } = transition;
    transition = undefined;
    apply(to);
    setState(finalState);
  }
  function move(destination, nextState, finalState) {
    transition = { from: cameraPose(camera), to: destination, elapsed: 0, finalState };
    setState(nextState);
    if (reducedMotion.matches) finish();
  }
  return {
    get state() { return state; },
    get moving() { return Boolean(transition); },
    enter() {
      if (state !== 'room') return false;
      roomPose = cameraPose(camera);
      move(view(camera.aspect), 'approaching', 'focused');
      return true;
    },
    leave() { if (state === 'focused' || state === 'approaching') move(roomPose, 'leaving', 'room'); },
    resize(aspect, nextRoomPose) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      if (state === 'room') return;
      roomPose = { ...nextRoomPose, aspect };
      if (state === 'leaving') { transition.to = roomPose; finish(); }
      else if (transition) {
        transition.from = cameraPose(camera);
        transition.to = view(aspect);
        transition.elapsed = 0;
      } else apply(view(aspect));
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
