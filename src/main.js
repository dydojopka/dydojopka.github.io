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
import { createRadioController } from './radio-controller.js';
import { createRadioAudio } from './radio-audio.js';
import { createRadioDisplay, loadRadioAtlas } from './radio-display.js';
import { radioView, radioFrontHit, radioEmitter } from './radio-focus.js';
import { hitBelongsTo, nearestVisibleHit } from './scene-hit.js';
import { createKeyboardController } from './keyboard-controller.js';
import { createKeyboardAudio } from './keyboard-audio.js';
import { createSceneEffectsAudio } from './scene-effects-audio.js';
import { createBookController } from './book-controller.js';
import { BOOK_MESSAGES, createBookDialog } from './book-dialog.js';
import { createMonitorInterference } from './monitor-interference.js';
import { createPlantController } from './plant-controller.js';
import { createMonitorPromise, PROMISE_MESSAGE } from './monitor-promise.js';
import { createPaintingController } from './painting-controller.js';
import './book-dialog.css';
import './style.css';

export async function createSceneRuntime({ onCard, onLost, onReady, onFailure, onProgress = () => {} }) {
  const host = document.querySelector('#room');
  const events = new AbortController();
  const options = { signal: events.signal };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let renderer, portfolio, scene, postProcessing, controls, cursor, display, printerController, renderLoop;
  let radioDisplay, keyboardController, bookController, bookDialog, monitorInterference;
  let plantController, monitorPromise, paintingController;
  let pointerDown;
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
  const leaveRadioButton = host.querySelector('#leave-radio');
  const leavePaintingButton = host.querySelector('#leave-painting');
  const status = host.querySelector('#printer-status');
  const radioStatus = host.querySelector('#radio-status');
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
  const radioController = createRadioController({
    now: () => audio.currentTime,
    onChange(station) {
      radioDisplay?.setFrequency(station.frequency);
      host.dataset.radioFrequency = station.frequency;
      radioStatus.textContent = `Частота ${station.frequency}. ${station.title}.`;
      radioAudio.select();
    },
  });
  const radioAudio = createRadioAudio({ controller: radioController, baseUrl: import.meta.env.BASE_URL });
  audio.addStream(radioAudio);
  const keyboardAudio = createKeyboardAudio({ baseUrl: import.meta.env.BASE_URL });
  audio.addStream(keyboardAudio);
  const paperAudio = createSceneEffectsAudio({ baseUrl: import.meta.env.BASE_URL, sounds: { page: 'page-turn.mp3' } });
  audio.addStream(paperAudio);
  const lampAudio = createSceneEffectsAudio({
    baseUrl: import.meta.env.BASE_URL,
    sounds: { click: 'lamp-switch.mp3' },
  });
  audio.addStream(lampAudio);
  syncSceneVolumeControl(soundSlider, soundControl, audio.volume);
  soundSlider.addEventListener('input', () => audio.setVolume(Number(soundSlider.value) / 100), options);
  function activateAudio(event = {}) {
    if (visible && !contextLost && !event.altKey && !event.ctrlKey && !event.metaKey) audio.activate();
  }
  host.addEventListener('pointerdown', activateAudio, { ...options, capture: true });
  host.addEventListener('keydown', activateAudio, { ...options, capture: true });

  function requestDraw() { renderLoop?.requestDraw(); }
  function syncInput() {
    const active = visible && !contextLost && !disposed && !bookDialog?.open;
    syncSceneVolumeControl(soundSlider, soundControl, audio.volume);
    soundControl.hidden = !active;
    const roomActive = active && focus?.state === 'room' && !paintingController?.active;
    controls?.setEnabled(roomActive, active && paintingController?.active ? 'painting'
      : active && target === 'radio' ? 'radio' : 'room');
    cursor?.setEnabled(active && target !== 'monitor');
    const portfolioActive = active && !monitorPromise?.active && !paintingController?.active;
    portfolio?.setEnabled(portfolioActive && ['room', 'monitor'].includes(target));
    portfolio?.setFocused(portfolioActive && target === 'monitor' && focus.state === 'focused');
    monitorControls.hidden = !active || target !== 'monitor' || focus.state === 'room';
    printerControls.hidden = !active || target !== 'printer' || focus.state === 'room';
    leaveRadioButton.hidden = !active || target !== 'radio' || focus.state === 'room';
    leavePaintingButton.hidden = !active || !paintingController?.active;
    leavePaintingButton.disabled = paintingController?.state === 'returning';
    leaveButton.disabled = ['lifting', 'returning'].includes(printerController?.paper);
  }
  function syncAnimation() {
    controls?.stop();
    bookDialog?.setActive(visible && !contextLost && !document.hidden && !disposed);
    audio.setActive(visible && !contextLost && !document.hidden && !disposed);
    renderLoop?.setMode({ visible: visible && !contextLost && !document.hidden && !disposed, animated: !reducedMotion.matches });
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelPainting();
    renderLoop?.setMode({ visible: false, animated: false });
    events.abort();
    audio.dispose();
    controls?.dispose(); cursor?.dispose();
    portfolio?.dispose(); display?.dispose(); printerController?.dispose();
    radioDisplay?.dispose();
    keyboardController?.dispose();
    plantController?.dispose(); monitorPromise?.dispose();
    paintingController?.dispose();
    bookController?.dispose(); bookDialog?.dispose(); monitorInterference?.dispose();
    postProcessing?.dispose();
    if (scene) disposeScene(scene);
    renderer?.dispose(); renderer?.domElement.remove();
    monitorControls.hidden = printerControls.hidden = true;
    soundControl.hidden = true;
  }

  try {
    onProgress('graphics');
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
    // Listen before loading models: loss during initialization must also reach the card.
    renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      contextLost = true;
      cancelPainting();
      cancelBookEvent();
      postProcessing?.lose();
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
    onProgress('environment');
    const radioAtlas = await loadRadioAtlas(import.meta.env.BASE_URL);
    const room = await createRoom({ screenTexture: portfolio.texture });
    ({ scene } = room);
    if (contextLost || disposed) throw new Error('Графический контекст потерян во время загрузки сцены.');
    const { snow, screens, printer, plant, plantParts, painting } = room;
    const lamp = scene.getObjectByName('desk-lamp');
    const lampLight = scene.getObjectByName('desk-lamp-light');
    const lampIntensity = lampLight.intensity;
    const keyboard = scene.getObjectByName('keyboard');
    keyboardController = createKeyboardController({ keyboard, reducedMotion, onPress: (sound, position) => keyboardAudio.play(sound, position) });
    const book = scene.getObjectByName('book');
    monitorInterference = createMonitorInterference(screens.primary);
    bookDialog = createBookDialog({ document, reducedMotion, onChange: () => { syncInput(); requestDraw(); } });
    bookController = createBookController({
      book, shadow: scene.getObjectByName('book-contact-shadow'), reducedMotion,
      onRead() {
        if (!visible || contextLost || document.hidden || focus.state !== 'room') return false;
        if (!bookDialog.show()) return false;
        if (!reducedMotion.matches) monitorInterference.trigger();
        requestDraw();
        return true;
      },
    });
    const radio = scene.getObjectByName('radio-stack');
    radioDisplay = createRadioDisplay({ radio, atlas: radioAtlas, onChange: requestDraw });
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 70);
    paintingController = createPaintingController({
      painting, scene, camera, reducedMotion,
      onChange(state) {
        host.dataset.paintingState = state;
        renderer.shadowMap.needsUpdate = true;
        syncInput(); requestDraw();
        if (state === 'shelf' && visible && !disposed && !contextLost) host.focus({ preventScroll: true });
      },
    });
    syncAudioPose = createSceneAudioPlacement({ audio, camera, screen: screens.primary, printer, radio, radioAudio });
    const deskBounds = new THREE.Box3().setFromObject(scene.getObjectByName('desk'));
    const monitorCenter = screenCenter(screens.primary);
    const monitorNormal = screenNormal(screens.primary);
    postProcessing = createPostProcessing(renderer);
    controls = createCameraControls({ host, camera, reducedMotion, onChange: requestDraw });
    cursor = createCursor(host, reducedMotion);
    display = createPrinterDisplayPainter(printer.getObjectByName('printer-display-screen'));
    onProgress('card');
    await document.fonts?.load('48px "Signalis Dialogue"', [...BOOK_MESSAGES, PROMISE_MESSAGE].join(' ')).catch(() => {});
    monitorPromise = createMonitorPromise({
      screen: screens.primary, light: scene.getObjectByName('monitor-light'), interference: monitorInterference, reducedMotion,
      onChange() { syncInput(); requestDraw(); },
    });
    plantController = createPlantController({
      plant, ...plantParts, reducedMotion, onPromise: () => monitorPromise.trigger(),
    });
    const cardImages = await loadBusinessCardImages(about, import.meta.env.BASE_URL);
    if (contextLost || disposed) throw new Error('Графический контекст потерян во время подготовки визитки.');
    printerController = createPrinterController({
      printer, scene, camera, reducedMotion,
      prepareTexture: () => createBusinessCardTexture(about, () => document.createElement('canvas'), cardImages),
      onPickup: (position) => paperAudio.play('page', position),
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
      view: (aspect) => ({
        monitor: () => monitorView(screens.primary, aspect),
        printer: () => printerView(printer, aspect),
        radio: () => radioView(radio, aspect),
      })[target](),
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
        const keysMoving = keyboardController.moving;
        keyboardController.update(delta);
        const bookMoving = bookController.moving;
        bookController.update(delta);
        const plantMoving = plantController.moving;
        plantController.update(delta);
        const paintingMoving = paintingController.moving;
        paintingController.update(delta);
        monitorInterference.update(delta);
        monitorPromise.update();
        if (keysMoving || bookMoving || plantMoving || paintingMoving) renderer.shadowMap.needsUpdate = true;
        snow.update(delta);
        if (printerController.paperMoving) renderer.shadowMap.needsUpdate = true;
      },
      draw() {
        try { draw(); }
        catch (error) { visible = false; syncInput(); syncAnimation(); onFailure(error); }
      },
    });
    function enter(nextTarget) {
      if (!visible || contextLost || bookDialog.open || focus.state !== 'room') return false;
      cancelPainting();
      cancelBookEvent();
      controls.stop();
      target = nextTarget;
      if (target === 'radio') {
        host.focus({ preventScroll: true });
        radioStatus.textContent = `Радиоприёмник. Частота ${radioController.frequency}. Enter — следующая станция. Escape — к столу.`;
      }
      return focus.enter();
    }
    function leave() {
      if (!visible || contextLost || ['lifting', 'returning'].includes(printerController.paper)) return;
      if (paintingController.active) {
        clearPointer(); paintingController.putBack();
        return;
      }
      focus.leave();
    }
    function print() {
      if (visible && !contextLost && target === 'printer' && focus.state === 'focused') printerController.print();
    }
    function pressKeyboard() {
      if (!visible || contextLost || document.hidden || bookDialog.open || focus.state !== 'room') return;
      keyboardController.press();
      renderer.shadowMap.needsUpdate = true;
      requestDraw();
    }
    function openSheet(callback = onCard) {
      if (!visible || contextLost || bookDialog.open || !printerController.printed) return false;
      cancelPainting();
      if (focus.state !== 'focused' || target !== 'printer') {
        if (focus.state !== 'room') { focus.leave(); focus.finish(); }
        target = 'printer'; focus.enter(); focus.finish();
      }
      return printerController.open(callback);
    }
    const workstation = scene.getObjectByName('workstation');
    portfolio.attach({ screen: screens.primary, camera, getHit: sceneHit, onChange: requestDraw, onLeave: leave });
    leaveButton.addEventListener('click', leave, options);
    leaveRadioButton.addEventListener('click', leave, options);
    leavePaintingButton.addEventListener('click', leave, options);
    document.addEventListener('keydown', (event) => {
      if (!visible || contextLost || bookDialog.open || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      if (paintingController.active && ['Escape', 'Home'].includes(event.key)) {
        event.preventDefault(); leave();
        return;
      }
      if (event.target === soundSlider) return;
      if (visible && !contextLost && focus.state !== 'room' && ['Escape', 'Home'].includes(event.key)) {
        event.preventDefault(); leave();
      } else if (event.target === host && focus.state === 'room' && ['KeyP', 'KeyM', 'KeyR'].includes(event.code)) {
        event.preventDefault(); enter({ KeyP: 'printer', KeyM: 'monitor', KeyR: 'radio' }[event.code]);
      } else if (target === 'radio' && focus.state === 'focused' && event.key === 'Enter' && event.target === host) {
        event.preventDefault(); radioController.next();
      } else if (target === 'printer' && focus.state === 'focused' && event.key === 'Enter' && event.target === host) {
        event.preventDefault();
        if (printerController.printed) openSheet();
        else print();
      }
    }, options);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    function sceneHit(event) {
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
      camera.updateMatrixWorld(); scene.updateMatrixWorld(true);
      raycaster.setFromCamera(pointer, camera);
      const roots = [workstation];
      if (printerController.sheet.parent === scene) roots.push(printerController.sheet);
      if (painting.root.parent === scene) roots.push(painting.root);
      return nearestVisibleHit(raycaster.intersectObjects(roots, true));
    }
    host.addEventListener('pointerdown', (event) => {
      const touchText = event.pointerType !== 'mouse' && event.target.closest('.monitor-text-layer');
      if (!visible || contextLost || bookDialog.open || focus.moving || paintingController.moving || event.button !== 0 || (event.target.tagName !== 'CANVAS' && !touchText) || pointerDown) return;
      pointerDown = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false,
        state: focus.state, textLink: touchText && event.target.closest('a'),
        painting: paintingController.active, rotate: paintingController.active && hitBelongsTo(sceneHit(event), painting.root) };
      if ((focus.state === 'focused' || paintingController.active) && !touchText) {
        if (target !== 'monitor') host.focus({ preventScroll: true });
        host.setPointerCapture(event.pointerId);
      }
    }, options);
    host.addEventListener('pointermove', (event) => {
      if (pointerDown?.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 8) pointerDown.moved = true;
      if (pointerDown.rotate && pointerDown.moved) {
        const rect = host.getBoundingClientRect();
        paintingController.rotate(event.clientX - (pointerDown.lastX ?? pointerDown.x),
          event.clientY - (pointerDown.lastY ?? pointerDown.y), rect.width, rect.height);
        pointerDown.lastX = event.clientX; pointerDown.lastY = event.clientY;
      }
    }, options);
    for (const name of ['pointercancel', 'lostpointercapture']) host.addEventListener(name, (event) => {
      if (pointerDown?.id === event.pointerId) pointerDown = undefined;
    }, options);
    host.addEventListener('pointerup', (event) => {
      if (pointerDown?.id !== event.pointerId) return;
      const down = pointerDown; pointerDown = undefined;
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
      if (!visible || contextLost || bookDialog.open || !down || down.id !== event.pointerId || down.moved) return;
      if (focus.moving || paintingController.moving || down.state !== focus.state || down.textLink) return;
      const hit = sceneHit(event);
      if (down.painting) {
        if (paintingController.active && !down.rotate && !hitBelongsTo(hit, painting.root)) paintingController.putBack();
        return;
      }
      const hitTarget = hitBelongsTo(hit, radio) ? 'radio'
        : hitBelongsTo(hit, printer) || hitBelongsTo(hit, printerController.sheet) ? 'printer'
          : hitBelongsTo(hit, screens.primary.parent) ? 'monitor' : undefined;
      if (focus.state === 'room') {
        if (hitBelongsTo(hit, painting.root)) {
          cancelBookEvent();
          paintingController.pickup();
        } else if (hitBelongsTo(hit, keyboard)) pressKeyboard();
        else if (hitBelongsTo(hit, lamp)) {
          // Keep the light count stable to reuse the prepared shaders and shadows.
          lampLight.intensity = lampLight.intensity ? 0 : lampIntensity;
          lampAudio.play('click', lamp.getWorldPosition(new THREE.Vector3()));
          requestDraw();
        } else if (hitBelongsTo(hit, plant)) {
          if (plantController.press()) requestDraw();
        } else if (hitBelongsTo(hit, book)) {
          if (bookController.press()) {
            paperAudio.play('page', book.getWorldPosition(new THREE.Vector3()));
            requestDraw();
          }
        } else if (hitTarget) enter(hitTarget);
      } else if (focus.state === 'focused' && hitTarget !== target) leave();
      else if (target === 'radio' && focus.state === 'focused') {
        if (radioFrontHit(radio, hit)) radioController.next();
      } else if (target === 'monitor' && focus.state === 'focused') {
        if (monitorPromise.active) monitorPromise.dismiss();
        else portfolio.click(hit);
      } else if (target === 'printer' && focus.state === 'focused') {
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
      paintingController.resize();
      portfolio.setViewport(width, height);
      // Portrait framing moves the close camera farther from the receiver.
      // Calibrate the static radius to that viewport, then attenuate solely
      // by physical distance as the camera moves between objects.
      radioAudio.setSpatialProfile(50, { refDistance: radioView(radio, width / height).position.distanceTo(radioEmitter(radio).position) });
      roomFrameHeight = view.frameHeight;
      postProcessing.setFrameHeight(focus.state === 'room' ? roomFrameHeight : 2);
      targetsDirty = true;
      requestDraw();
    }
    function draw() {
      if (contextLost || disposed) return;
      paintingController.reveal();
      if (plantController?.reveal(camera, target, focus.state)) renderer.shadowMap.needsUpdate = true;
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
    window.addEventListener('pagehide', () => { cancelPainting(); audio.setActive(false); bookDialog.setActive(false); }, options);
    window.addEventListener('blur', clearPointer, options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearPointer(); }, options);
    window.addEventListener('pageshow', syncAnimation, options);
    reducedMotion.addEventListener('change', () => {
      if (reducedMotion.matches) {
        focus.finish(); printerController.finish(); keyboardController.finish();
        bookController.finish(); monitorInterference.clear(); bookDialog.finishTyping();
        plantController.finish(); monitorPromise.finish();
        paintingController.finish();
        renderer.shadowMap.needsUpdate = true;
      }
      syncAnimation();
    }, options);
    host.dataset.focusTarget = host.dataset.focusState = host.dataset.monitorState = 'room';
    host.dataset.printState = 'idle'; host.dataset.paperState = 'input';
    host.dataset.paintingState = 'shelf';
    status.textContent = PRINTER_STATUS.idle;
    host.dataset.radioFrequency = radioController.frequency;
    radioStatus.textContent = `Частота ${radioController.frequency}. Радиопомехи.`;
    renderer.shadowMap.needsUpdate = true;
    resize(); syncInput();
    onProgress('shaders');
    await warmPrinter();
    return {
      get printed() { return printerController.printed; },
      activateAudio,
      setVisible(value) {
        visible = value;
        if (!value) { cancelPainting(); cancelBookEvent(); plantController.finish(); }
        if (value) { resize(); draw(); }
        syncInput(); syncAnimation();
      },
      openSheet,
      returnSheet() { if (printerController.returnSheet()) requestDraw(); },
      dispose,
    };
  } catch (error) { dispose(); throw error; }

  function cancelBookEvent() {
    bookController?.cancel();
    if (!monitorPromise?.active) monitorInterference?.clear();
    bookDialog?.close({ restoreFocus: false });
    if (renderer) renderer.shadowMap.needsUpdate = true;
  }

  function clearPointer() {
    const down = pointerDown; pointerDown = undefined;
    if (down && host.hasPointerCapture(down.id)) host.releasePointerCapture(down.id);
  }
  function cancelPainting() {
    clearPointer();
    paintingController?.cancel();
  }
}
