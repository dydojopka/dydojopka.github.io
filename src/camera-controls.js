const DEG = Math.PI / 180;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const KEY_DIRECTIONS = {
  ArrowLeft: [-3, 0], ArrowRight: [3, 0], ArrowUp: [0, -2], ArrowDown: [0, 2],
  KeyA: [-3, 0], KeyD: [3, 0], KeyW: [0, -2], KeyS: [0, 2],
};

export function keyboardDirection(event) {
  // Physical codes keep WASD usable with the Russian keyboard layout too.
  return KEY_DIRECTIONS[event.code] ?? KEY_DIRECTIONS[event.key];
}

export function edgeInput(position, zone = 0.2) {
  const amount = position < zone ? (position - zone) / zone : position > 1 - zone ? (position - (1 - zone)) / zone : 0;
  const strength = clamp(Math.abs(amount), 0, 1);
  return Math.sign(amount) * strength * strength * (3 - 2 * strength);
}

export function cameraDirection(yaw, pitch) {
  return [Math.sin(yaw * DEG) * Math.cos(pitch * DEG), -Math.sin(pitch * DEG), -Math.cos(yaw * DEG) * Math.cos(pitch * DEG)];
}

export function createViewState(pitch) {
  return { yaw: 0, pitch, targetYaw: 0, targetPitch: pitch };
}

export function yawLimits(pitch, limits) {
  if (limits.focusPitch === undefined) return { min: limits.minYaw, max: limits.maxYaw };
  const progress = clamp((pitch - limits.focusPitch) / (limits.maxPitch - limits.focusPitch), 0, 1);
  const blend = progress * progress * (3 - 2 * progress);
  // In portrait, stop the upright view at the side props. Looking down opens
  // just enough extra rotation to reach the near corners of the desktop.
  return {
    min: limits.focusMinYaw + (limits.minYaw - limits.focusMinYaw) * blend,
    max: limits.focusMaxYaw + (limits.maxYaw - limits.focusMaxYaw) * blend,
  };
}

export function constrainView(state, limits) {
  for (const key of ['pitch', 'targetPitch']) state[key] = clamp(state[key], limits.minPitch, limits.maxPitch);
  for (const [yaw, pitch] of [['yaw', 'pitch'], ['targetYaw', 'targetPitch']]) {
    const allowed = yawLimits(state[pitch], limits);
    state[yaw] = clamp(state[yaw], allowed.min, allowed.max);
  }
}

export function advanceView(state, input, delta, limits) {
  delta = clamp(delta, 0, 0.05);
  const previousYaw = state.yaw, previousPitch = state.pitch;
  state.targetYaw += input.x * 18 * delta;
  state.targetPitch += input.y * 10 * delta;
  constrainView(state, limits);
  const blend = 1 - Math.exp(-14 * delta);
  for (const [current, target] of [['yaw', 'targetYaw'], ['pitch', 'targetPitch']]) {
    state[current] += (state[target] - state[current]) * blend;
    if (Math.abs(state[target] - state[current]) < 0.002) state[current] = state[target];
  }
  constrainView(state, limits);
  return previousYaw !== state.yaw || previousPitch !== state.pitch;
}

export function createCameraControls({ host, camera, reducedMotion, onChange }) {
  const events = new AbortController();
  const options = { signal: events.signal };
  const state = createViewState(12);
  const input = { x: 0, y: 0 };
  const coarsePointer = matchMedia('(pointer: coarse)');
  const controls = host.querySelector('.view-controls');
  const help = host.querySelector('#view-help');
  let profile;
  let enabled = true;
  let drag;

  function apply() {
    const [x, y, z] = cameraDirection(profile.initialYaw + state.yaw, state.pitch);
    camera.lookAt(camera.position.x + x, camera.position.y + y, camera.position.z + z);
  }
  function stop() {
    input.x = input.y = 0;
    state.targetYaw = state.yaw;
    state.targetPitch = state.pitch;
    if (drag && host.hasPointerCapture(drag.id)) host.releasePointerCapture(drag.id);
    drag = undefined;
  }
  function change(yaw, pitch, immediate = reducedMotion.matches) {
    state.targetYaw = yaw;
    state.targetPitch = pitch;
    constrainView(state, profile.limits);
    if (immediate) {
      state.yaw = state.targetYaw;
      state.pitch = state.targetPitch;
      apply();
    }
    onChange();
  }
  function reset() {
    if (!enabled || !profile) return;
    stop();
    change(0, profile.initialPitch);
  }
  function updateHelp() {
    help.textContent = coarsePointer.matches ? 'Осмотр — свайп · Выбор — нажатие'
        : 'Осмотр — курсор / ↑←↓→ / WASD · Выбор — клик / P / M · Сброс — Home';
  }

  host.addEventListener('pointerdown', (event) => {
    if (!enabled || !profile || event.button !== 0) return;
    if (event.target.closest('button, input, .scene-sound')) { stop(); return; }
    host.focus({ preventScroll: true });
    if (event.pointerType === 'mouse' && !reducedMotion.matches) return;
    stop();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    host.setPointerCapture(event.pointerId);
  }, options);
  host.addEventListener('pointermove', (event) => {
    if (!enabled || !profile) return;
    const rect = host.getBoundingClientRect();
    if (drag && event.pointerId === drag.id) {
      const yaw = state.yaw - (event.clientX - drag.x) / rect.width * profile.horizontalFov;
      const pitch = state.pitch - (event.clientY - drag.y) / rect.height * profile.fov;
      drag.x = event.clientX;
      drag.y = event.clientY;
      change(yaw, pitch, true);
      return;
    }
    if (event.pointerType !== 'mouse' || reducedMotion.matches || event.target.closest('button, input, .scene-sound')) {
      input.x = input.y = 0;
      return;
    }
    input.x = edgeInput((event.clientX - rect.left) / rect.width, 0.28);
    input.y = edgeInput((event.clientY - rect.top) / rect.height);
  }, options);
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    host.addEventListener(name, (event) => { if (drag?.id === event.pointerId) stop(); }, options);
  }
  host.addEventListener('pointerleave', () => { if (!drag) stop(); }, options);
  host.addEventListener('keydown', (event) => {
    if (!enabled || !profile || event.target.closest('input') || event.altKey || event.ctrlKey || event.metaKey) return;
    const direction = keyboardDirection(event);
    if (event.key === 'Home') {
      event.preventDefault();
      reset();
    } else if (direction) {
      event.preventDefault();
      input.x = input.y = 0;
      const [yaw, pitch] = direction;
      change(state.targetYaw + yaw, state.targetPitch + pitch);
    }
  }, options);
  window.addEventListener('blur', stop, options);
  document.addEventListener('visibilitychange', stop, options);
  reducedMotion.addEventListener('change', () => { stop(); updateHelp(); }, options);
  coarsePointer.addEventListener('change', updateHelp, options);
  updateHelp();
  controls.hidden = false;

  return {
    configure(nextProfile) {
      const atHome = !profile || (Math.abs(state.targetYaw) < 0.01 && Math.abs(state.targetPitch - profile.initialPitch) < 0.01);
      stop();
      profile = nextProfile;
      if (atHome) Object.assign(state, createViewState(profile.initialPitch));
      constrainView(state, profile.limits);
      camera.position.set(...profile.position);
      camera.aspect = profile.aspect;
      camera.fov = profile.fov;
      camera.updateProjectionMatrix();
      apply();
    },
    update(delta) {
      if (!enabled || !profile) return false;
      const changed = advanceView(state, input, delta, profile.limits);
      if (changed) apply();
      return changed;
    },
    setEnabled(value) {
      enabled = value;
      controls.hidden = !value;
      stop();
    },
    stop,
    dispose() {
      stop();
      events.abort();
      controls.hidden = true;
    },
  };
}
