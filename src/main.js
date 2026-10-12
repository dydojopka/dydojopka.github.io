import * as THREE from 'three';
import { createRoom } from './scene.js';
import { cameraView, renderSize } from './layout.js';
import { createCameraControls } from './camera-controls.js';
import { createCursor } from './cursor.js';
import { screenCenter, screenNormal } from './screen.js';
import { createPortfolio } from './portfolio.js';
import { createMonitorFocus } from './monitor-focus.js';
import { createPostProcessing } from './post-processing.js';
import { createRenderLoop } from './render-loop.js';
import './style.css';

const host = document.querySelector('#room');
const fallback = document.querySelector('#fallback');
const portfolio = createPortfolio({ host });

start().catch((error) => {
  host.hidden = true;
  fallback.hidden = false;
  portfolio.setFallback(true);
  console.error('The room could not be initialized.', error);
});

async function start() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.localClippingEnabled = true;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', host.getAttribute('aria-label'));
  host.append(renderer.domElement);

  const { scene, snow, screens } = await createRoom({ screenTexture: portfolio.texture });
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 70);
  const deskBounds = new THREE.Box3().setFromObject(scene.getObjectByName('desk'));
  const monitorFocus = screenCenter(screens.primary);
  const monitorNormal = screenNormal(screens.primary);
  const postProcessing = createPostProcessing(renderer);
  const monitorControls = host.querySelector('.monitor-controls');

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let contextLost = false;
  let targetsDirty = true;
  const controls = createCameraControls({ host, camera, reducedMotion, onChange: requestDraw });
  const cursor = createCursor(host, reducedMotion);
  const monitor = createMonitorFocus({
    camera,
    screen: screens.primary,
    reducedMotion,
    onStateChange(state) {
      host.dataset.monitorState = state;
      controls.setEnabled(state === 'room' && !contextLost);
      cursor.setEnabled(state === 'room' && !contextLost);
      portfolio.setFocused(state === 'focused');
      monitorControls.hidden = state === 'room' || contextLost;
      requestTargetResize();
      requestDraw();
      if (state === 'room') host.focus({ preventScroll: true });
    },
  });
  const renderLoop = createRenderLoop({
    update(delta) {
      monitor.update(delta);
      controls.update(delta);
      snow.update(delta);
    },
    draw,
  });
  host.dataset.monitorState = 'room';
  portfolio.attach({
    screen: screens.primary,
    camera,
    onChange: requestDraw,
    onEnter() {
      if (!contextLost) monitor.enter();
    },
    onLeave: () => monitor.leave(),
  });
  document.addEventListener('keydown', (event) => {
    if ((event.key === 'Escape' || event.key === 'Home') && monitor.state !== 'room' && !contextLost) {
      event.preventDefault();
      monitor.leave();
    }
  });

  function requestDraw() {
    renderLoop.requestDraw();
  }
  function draw() {
    if (contextLost) return;
    resizeTargets();
    postProcessing.draw(scene, camera);
    portfolio.updateTextProjection();
  }
  function requestTargetResize() {
    targetsDirty = true;
  }
  function resizeTargets() {
    if (!targetsDirty) return;
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    const size = renderSize(width, height, monitor.state !== 'room');
    postProcessing.resize(size.width, size.height);
    targetsDirty = false;
  }
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    const view = cameraView(width / height, deskBounds, monitorFocus, monitorNormal);
    controls.configure(view);
    monitor.resize(width / height, {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      fov: camera.fov,
      aspect: camera.aspect,
    });
    portfolio.setViewport(width, height);
    postProcessing.setFrameHeight(monitor.state === 'room' ? view.frameHeight : 2);
    requestTargetResize();
    requestDraw();
  }
  function syncAnimation() {
    controls.stop();
    renderLoop.setMode({ visible: !contextLost && !document.hidden, animated: !reducedMotion.matches });
  }

  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    syncAnimation();
    controls.setEnabled(false);
    cursor.setEnabled(false);
    monitorControls.hidden = true;
    fallback.hidden = false;
    portfolio.setFallback(true);
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    portfolio.setFallback(false);
    controls.setEnabled(monitor.state === 'room');
    cursor.setEnabled(monitor.state === 'room');
    monitorControls.hidden = monitor.state === 'room';
    fallback.hidden = true;
    renderer.shadowMap.needsUpdate = true;
    resize();
    syncAnimation();
  });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', syncAnimation);
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) monitor.finish();
    syncAnimation();
  });
  renderer.shadowMap.needsUpdate = true;
  resize();
  syncAnimation();
}
