import * as THREE from 'three';
import { createRoom } from './scene.js';
import { cameraView, renderSize } from './layout.js';
import { createCameraControls } from './camera-controls.js';
import { createCursor } from './cursor.js';
import { screenCenter, screenNormal } from './screen.js';
import { createPortfolio } from './portfolio.js';
import { monitorView } from './monitor-focus.js';
import { cameraPose, createFocusTransition } from './focus-transition.js';
import { printerView } from './printer-focus.js';
import { createPrinterController } from './printer-controller.js';
import { createPrinterDisplayPainter, printButtonHit, PRINTER_STATUS } from './printer-display.js';
import { createBusinessCardTexture, loadBusinessCardImages } from './business-card-painter.js';
import { about } from './portfolio-content.js';
import { createPostProcessing } from './post-processing.js';
import { createRenderLoop } from './render-loop.js';
import { disposeScene } from './dispose-scene.js';
import { createSceneAudio } from './scene-audio.js';
import { createSceneAudioPlacement } from './scene-audio-placement.js';
import { readSceneVolume, saveSceneVolume, syncSceneVolumeControl } from './scene-audio-controls.js';
import './style.css';

export async function createSceneRuntime({ onCard, onLost, onReady, onFailure }) {
  const host = document.querySelector('#room');
  const events = new AbortController();
  const options = { signal: events.signal };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let renderer, portfolio, scene, postProcessing, controls, cursor, display, printerController, renderLoop;
  let visible = false;
  let contextLost = false;
  let disposed = false;
  let focus;
  let target = 'room';
  let targetsDirty = true;
  let viewport = { width: window.innerWidth, height: window.innerHeight };
  let syncAudioPose = () => {};
  const monitorControls = host.querySelector('.monitor-controls');
  const printerControls = host.querySelector('.printer-controls');
  const leaveButton = host.querySelector('#leave-printer');
  const status = host.querySelector('#printer-status');
  const soundControl = host.querySelector('#scene-sound-control');
  const soundSlider = host.querySelector('#scene-sound');
  const audio = createSceneAudio({
    baseUrl: import.meta.env.BASE_URL,
    initialVolume: readSceneVolume(window),
    onChange(volume) {
      syncSceneVolumeControl(soundSlider, soundControl, volume);
      saveSceneVolume(window, volume);
    },
  });
  syncSceneVolumeControl(soundSlider, soundControl, audio.volume);
  soundSlider.addEventListener('input', () => audio.setVolume(Number(soundSlider.value) / 100), options);
  function activateAudio(event) {
    if (visible && !contextLost && !event.altKey && !event.ctrlKey && !event.metaKey) audio.activate();
  }
  host.addEventListener('pointerdown', activateAudio, { ...options, capture: true });
  host.addEventListener('keydown', activateAudio, { ...options, capture: true });

  function requestDraw() { renderLoop?.requestDraw(); }
  function syncInput() {
    const active = visible && !contextLost && !disposed;
    syncSceneVolumeControl(soundSlider, soundControl, audio.volume);
    soundControl.hidden = !active;
    const roomActive = active && focus?.state === 'room';
    controls?.setEnabled(roomActive);
    cursor?.setEnabled(roomActive);
    portfolio?.setEnabled(active && target !== 'printer');
    portfolio?.setFocused(active && target === 'monitor' && focus.state === 'focused');
    monitorControls.hidden = !active || target !== 'monitor' || focus.state === 'room';
    printerControls.hidden = !active || target !== 'printer' || focus.state === 'room';
    leaveButton.disabled = ['lifting', 'returning'].includes(printerController?.paper);
  }
  function syncAnimation() {
    controls?.stop();
    audio.setActive(visible && !contextLost && !document.hidden && !disposed);
    renderLoop?.setMode({ visible: visible && !contextLost && !document.hidden && !disposed, animated: !reducedMotion.matches });
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    renderLoop?.setMode({ visible: false, animated: false });
    events.abort();
    audio.dispose();
    controls?.dispose(); cursor?.dispose();
    portfolio?.dispose(); display?.dispose(); printerController?.dispose();
    postProcessing?.dispose();
    if (scene) disposeScene(scene);
    renderer?.dispose(); renderer?.domElement.remove();
    monitorControls.hidden = printerControls.hidden = true;
    soundControl.hidden = true;
  }

  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
    // Listen before loading models: loss during initialization must also reach the card.
    renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      contextLost = true;
      syncAnimation(); syncInput();
      onLost();
    }, options);
    renderer.domElement.addEventListener('webglcontextrestored', async () => {
      if (!scene || disposed) return;
      contextLost = false;
      postProcessing.restore();
      scene.traverse((object) => {
        for (const material of [object.material].flat().filter(Boolean)) {
          material.needsUpdate = true;
          for (const value of Object.values(material)) if (value?.isTexture) value.needsUpdate = true;
        }
      });
      renderer.shadowMap.needsUpdate = true;
      targetsDirty = true;
      try { await warmPrinter(); onReady(); }
      catch (error) { onFailure(error); }
      syncInput(); syncAnimation();
    }, options);
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
    portfolio = createPortfolio({ host });
    const room = await createRoom({ screenTexture: portfolio.texture });
    ({ scene } = room);
    if (contextLost || disposed) throw new Error('Графический контекст потерян во время загрузки сцены.');
    const { snow, screens, printer } = room;
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 70);
    syncAudioPose = createSceneAudioPlacement({ audio, camera, screen: screens.primary, printer });
    const deskBounds = new THREE.Box3().setFromObject(scene.getObjectByName('desk'));
    const monitorCenter = screenCenter(screens.primary);
    const monitorNormal = screenNormal(screens.primary);
    postProcessing = createPostProcessing(renderer);
    controls = createCameraControls({ host, camera, reducedMotion, onChange: requestDraw });
    cursor = createCursor(host, reducedMotion);
    display = createPrinterDisplayPainter(printer.getObjectByName('printer-display-screen'));
    const cardImages = await loadBusinessCardImages(about, import.meta.env.BASE_URL);
    if (contextLost || disposed) throw new Error('Графический контекст потерян во время подготовки визитки.');
    printerController = createPrinterController({
      printer, scene, camera, reducedMotion,
      prepareTexture: () => createBusinessCardTexture(about, () => document.createElement('canvas'), cardImages),
      onRead: onCard,
      onChange(state) {
        const wasReturning = host.dataset.paperState === 'returning';
        host.dataset.printState = state.job;
        audio.setPrinting(['feeding', 'printing', 'ejecting'].includes(state.job));
        host.dataset.paperState = state.paper;
        status.textContent = PRINTER_STATUS[state.job];
        display.paint(state.job);
        renderer.shadowMap.needsUpdate = true;
        syncInput(); requestDraw();
        if (wasReturning && state.paper === 'output' && visible) host.focus({ preventScroll: true });
      },
    });
    let roomFrameHeight = 6.35;
    focus = createFocusTransition({
      camera, reducedMotion,
      view: (aspect) => target === 'printer' ? printerView(printer, aspect) : monitorView(screens.primary, aspect),
      onStateChange(state) {
        if (state === 'room') target = 'room';
        host.dataset.focusTarget = target;
        host.dataset.focusState = state;
        host.dataset.monitorState = target === 'monitor' ? state : 'room';
        syncInput();
        targetsDirty = true;
        postProcessing.setFrameHeight(state === 'room' ? roomFrameHeight : 2);
        requestDraw();
        if (state === 'room' && visible) host.focus({ preventScroll: true });
      },
    });
    renderLoop = createRenderLoop({
      update(delta) {
        focus.update(delta);
        controls.update(delta);
        printerController.update(delta);
        snow.update(delta);
        if (printerController.paperMoving) renderer.shadowMap.needsUpdate = true;
      },
      draw() {
        try { draw(); }
        catch (error) { visible = false; syncInput(); syncAnimation(); onFailure(error); }
      },
    });
    function enter(nextTarget) {
      if (!visible || contextLost || focus.state !== 'room') return false;
      controls.stop();
      target = nextTarget;
      return focus.enter();
    }
    function leave() {
      if (!visible || contextLost || ['lifting', 'returning'].includes(printerController.paper)) return;
      focus.leave();
    }
    function print() {
      if (visible && !contextLost && target === 'printer' && focus.state === 'focused') printerController.print();
    }
    function openSheet(callback = onCard) {
      if (!visible || contextLost || !printerController.printed) return false;
      if (focus.state !== 'focused' || target !== 'printer') {
        if (focus.state !== 'room') { focus.leave(); focus.finish(); }
        target = 'printer'; focus.enter(); focus.finish();
      }
      return printerController.open(callback);
    }
    const workstation = scene.getObjectByName('workstation');
    portfolio.attach({ screen: screens.primary, camera, scene: workstation, onChange: requestDraw,
      onEnter: () => enter('monitor'), onLeave: leave });
    leaveButton.addEventListener('click', leave, options);
    document.addEventListener('keydown', (event) => {
      if (!visible || contextLost || event.target === soundSlider || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      if (visible && !contextLost && focus.state !== 'room' && ['Escape', 'Home'].includes(event.key)) {
        event.preventDefault(); leave();
      } else if (focus.state === 'room' && ['KeyP', 'KeyM'].includes(event.code)) {
        event.preventDefault(); enter(event.code === 'KeyP' ? 'printer' : 'monitor');
      } else if (target === 'printer' && focus.state === 'focused' && event.key === 'Enter' && event.target === host) {
        event.preventDefault();
        if (printerController.printed) openSheet();
        else print();
      }
    }, options);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown;
    function printerHit(event) {
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
      camera.updateMatrixWorld(); scene.updateMatrixWorld(true);
      raycaster.setFromCamera(pointer, camera);
      const nearest = raycaster.intersectObject(target === 'printer' ? printer : workstation, true).find((hit) => {
        let object = hit.object;
        while (object) { if (!object.visible) return false; object = object.parent; }
        const materials = [hit.object.material].flat();
        return materials.every((material) => !material.clippingPlanes?.some((plane) => plane.distanceToPoint(hit.point) < 0));
      });
      if (!nearest) return;
      let object = nearest.object;
      while (object && object !== printer && object !== printerController.sheet) object = object.parent;
      return object ? nearest : undefined;
    }
    host.addEventListener('pointerdown', (event) => {
      if (!visible || contextLost || event.button !== 0 || event.target.tagName !== 'CANVAS') return;
      pointerDown = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      if (target === 'printer' && focus.state === 'focused') host.setPointerCapture(event.pointerId);
    }, options);
    host.addEventListener('pointermove', (event) => {
      if (pointerDown?.id === event.pointerId && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 8) pointerDown.moved = true;
    }, options);
    for (const name of ['pointercancel', 'lostpointercapture']) host.addEventListener(name, () => { pointerDown = undefined; }, options);
    host.addEventListener('pointerup', (event) => {
      const down = pointerDown; pointerDown = undefined;
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
      if (!visible || contextLost || !down || down.id !== event.pointerId || down.moved) return;
      const hit = printerHit(event);
      if (!hit) {
        if (target === 'printer' && focus.state === 'focused') leave();
        return;
      }
      if (focus.state === 'room') enter('printer');
      else if (target === 'printer' && focus.state === 'focused') {
        if (hit.object === printerController.sheet && printerController.paper === 'output') openSheet();
        else if (hit.object.name === 'printer-display-screen' && printButtonHit(hit.uv)) print();
      }
    }, options);

    function resize() {
      const rect = host.getBoundingClientRect();
      viewport = { width: rect.width || window.innerWidth, height: rect.height || window.innerHeight };
      const { width, height } = viewport;
      const previous = cameraPose(camera);
      const view = cameraView(width / height, deskBounds, monitorCenter, monitorNormal);
      controls.configure(view);
      const nextRoom = cameraPose(camera);
      if (focus.state !== 'room') {
        camera.position.copy(previous.position); camera.quaternion.copy(previous.quaternion); camera.fov = previous.fov;
      }
      focus.resize(width / height, nextRoom);
      printerController.resize();
      portfolio.setViewport(width, height);
      roomFrameHeight = view.frameHeight;
      postProcessing.setFrameHeight(focus.state === 'room' ? roomFrameHeight : 2);
      targetsDirty = true;
      requestDraw();
    }
    function draw() {
      if (contextLost || disposed) return;
      syncAudioPose();
      if (targetsDirty) {
        const size = renderSize(viewport.width, viewport.height, target === 'monitor' && focus.state !== 'room');
        postProcessing.resize(size.width, size.height);
        targetsDirty = false;
      }
      postProcessing.draw(scene, camera);
      if (renderer.getContext().isContextLost()) throw new Error('Графический контекст недоступен.');
      portfolio.updateTextProjection();
    }
    async function warmPrinter() {
      await printerController.warmup(async (texture) => {
        renderer.initTexture(texture);
        const compilation = new AbortController();
        try {
          await Promise.race([
            renderer.compileAsync(scene, camera),
            new Promise((resolve, reject) => renderer.domElement.addEventListener('webglcontextlost', () => reject(new Error('Контекст потерян во время подготовки печати.')), { once: true, signal: compilation.signal })),
          ]);
        } finally { compilation.abort(); }
        if (contextLost || disposed) throw new Error('Графический контекст недоступен после подготовки печати.');
        draw();
      });
      renderer.shadowMap.needsUpdate = true;
      draw();
    }
    window.addEventListener('resize', resize, options);
    document.addEventListener('visibilitychange', syncAnimation, options);
    window.addEventListener('pagehide', () => audio.setActive(false), options);
    window.addEventListener('pageshow', syncAnimation, options);
    reducedMotion.addEventListener('change', () => {
      if (reducedMotion.matches) { focus.finish(); printerController.finish(); }
      syncAnimation();
    }, options);
    host.dataset.focusTarget = host.dataset.focusState = host.dataset.monitorState = 'room';
    host.dataset.printState = 'idle'; host.dataset.paperState = 'input';
    status.textContent = PRINTER_STATUS.idle;
    renderer.shadowMap.needsUpdate = true;
    resize(); syncInput();
    await warmPrinter();
    return {
      get printed() { return printerController.printed; },
      setVisible(value) {
        visible = value;
        if (value) { resize(); draw(); }
        syncInput(); syncAnimation();
      },
      openSheet,
      returnSheet() { if (printerController.returnSheet()) requestDraw(); },
      dispose,
    };
  } catch (error) { dispose(); throw error; }
}
