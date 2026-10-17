import { MeshStandardMaterial, Plane, Quaternion, Vector3 } from 'three';
import { setPrinterState } from './printer-indicators.js';
import { printerOpening } from './printer-body.js';
import { PAPER_WIDTH, PAPER_HEIGHT, OUTPUT_POSITION } from './printer-paper.js';

export const PRINT_DURATIONS = { feeding: 2.4, printing: 1.2, ejecting: 3.6 };
const smooth = (value) => value * value * (3 - 2 * value);
const OUTPUT = { position: new Vector3().fromArray(OUTPUT_POSITION), quaternion: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2) };

export function createPrinterController({ printer, scene, camera, reducedMotion, prepareTexture, onChange = () => {}, onRead = () => {}, onPickup = () => {} }) {
  const sheet = printer.getObjectByName('input-sheet-3');
  const hopper = sheet.parent;
  const inputPosition = sheet.position.clone();
  const inputQuaternion = sheet.quaternion.clone();
  const inputScale = sheet.scale.clone();
  const blank = sheet.material.clone();
  blank.clipShadows = true;
  sheet.material = blank;
  let ink;
  let texture;
  let job = 'idle';
  let paper = 'input';
  let elapsed = 0;
  let printStarted = false;
  let printed = false;
  let readCallback;
  let disposed = false;
  const clip = new Plane();
  const clipNormal = new Vector3();
  const axis = new Vector3(1, 0, 0);
  setClip(hopper, clipNormal.set(0, 1, 0), 0.12);

  function changed() { onChange({ job, paper, printStarted, printed }); }
  function setClip(parent, normal, constant) {
    parent.updateWorldMatrix(true, false);
    clip.set(normal, constant).applyMatrix4(parent.matrixWorld);
    for (const material of [blank, ink].filter(Boolean)) {
      if (material.clippingPlanes?.[0] !== clip) {
        material.clippingPlanes = [clip];
        material.needsUpdate = true;
      }
    }
  }
  function unclip() {
    // Keep one clipping plane throughout the job to reuse the compiled shader.
    clip.set(clipNormal.set(0, 1, 0), 1000);
  }
  function outputPose() {
    printer.add(sheet);
    sheet.position.copy(OUTPUT.position);
    sheet.quaternion.copy(OUTPUT.quaternion);
    sheet.scale.copy(inputScale);
    sheet.name = 'printed-sheet';
    sheet.material = [blank, blank, blank, blank, ink, blank];
    setClip(printer, clipNormal.set(0, 0, 1), -printerOpening.back);
  }
  function setJob(value) {
    job = value;
    elapsed = 0;
    setPrinterState(printer, ['feeding', 'printing', 'ejecting'].includes(value) ? 'printing' : value === 'error' ? 'error' : 'ready');
    changed();
  }
  function finishPrint() {
    outputPose();
    sheet.visible = true;
    printed = true;
    paper = 'output';
    setJob('ready');
  }
  function nextPhase() {
    if (job === 'feeding') {
      sheet.visible = false;
      setJob('printing');
    } else if (job === 'printing') {
      outputPose();
      sheet.position.z = printerOpening.back - PAPER_HEIGHT / 2;
      sheet.visible = true;
      paper = 'output';
      setJob('ejecting');
    } else if (job === 'ejecting') finishPrint();
  }
  function worldPose(position, quaternion) {
    printer.updateWorldMatrix(true, false);
    return { position: position.clone().applyMatrix4(printer.matrixWorld),
      quaternion: printer.getWorldQuaternion(new Quaternion()).multiply(quaternion),
      scale: printer.getWorldScale(new Vector3()).multiply(inputScale) };
  }
  function readingPose() {
    camera.updateWorldMatrix(true, false);
    const scale = printer.getWorldScale(new Vector3()).multiply(inputScale);
    const tangent = Math.tan(camera.fov * Math.PI / 360);
    const fitDistance = Math.max(PAPER_HEIGHT * scale.y, PAPER_WIDTH * scale.x / camera.aspect) / (2 * tangent * 0.78);
    const quaternion = camera.getWorldQuaternion(new Quaternion());
    const position = camera.getWorldPosition(new Vector3());
    const direction = new Vector3(0, 0, -1).applyQuaternion(quaternion);
    const localPosition = printer.worldToLocal(position.clone());
    const localDirection = direction.clone().transformDirection(printer.matrixWorld.clone().invert());
    // A close camera must pull the sheet towards itself, without sending it back through the printer.
    const clearanceDistance = (localPosition.z - 2.5) / Math.max(0.001, -localDirection.z) * printer.getWorldScale(new Vector3()).z;
    const distance = Math.min(fitDistance, Math.max(camera.near + 0.2, clearanceDistance));
    return { position: camera.getWorldPosition(new Vector3()).add(new Vector3(0, 0, -Math.max(distance, camera.near + 0.2)).applyQuaternion(quaternion)), quaternion, scale };
  }
  function blend(a, b, amount) {
    const value = smooth(Math.min(1, Math.max(0, amount)));
    return { position: a.position.clone().lerp(b.position, value), quaternion: a.quaternion.clone().slerp(b.quaternion, value), scale: a.scale };
  }
  function liftedPose(progress) {
    const start = worldPose(OUTPUT.position, OUTPUT.quaternion);
    const tilt = new Quaternion().setFromAxisAngle(axis, -Math.PI / 2 - 0.18);
    const tilted = worldPose(new Vector3(0, 0.14 + (0.54 - printerOpening.front) * Math.tan(0.18), 0.54), tilt);
    const extracted = worldPose(new Vector3(0, 0.14 + (1.74 - printerOpening.front) * Math.tan(0.18), 1.74), tilt);
    const clear = worldPose(new Vector3(0, 1.5, 2.15), tilt);
    if (progress < 0.1) return blend(start, tilted, progress / 0.1);
    if (progress < 0.35) return blend(tilted, extracted, (progress - 0.1) / 0.25);
    if (progress < 0.6) return blend(extracted, clear, (progress - 0.35) / 0.25);
    return blend(clear, readingPose(), (progress - 0.6) / 0.4);
  }
  function applyLift(progress) {
    const pose = liftedPose(progress);
    sheet.position.copy(pose.position);
    sheet.quaternion.copy(pose.quaternion);
    sheet.scale.copy(pose.scale);
    if (progress < 0.35) setClip(printer, clipNormal.set(0, 0, 1), -printerOpening.front);
    else unclip();
  }
  function finishPaper() {
    if (paper === 'lifting') {
      applyLift(1);
      paper = 'reading';
      changed();
      const callback = readCallback;
      readCallback = undefined;
      callback?.();
    } else if (paper === 'returning') {
      outputPose();
      paper = 'output';
      changed();
    }
  }
  return {
    get job() { return job; },
    get paper() { return paper; },
    get printStarted() { return printStarted; },
    get printed() { return printed; },
    get sheet() { return sheet; },
    get moving() { return ['feeding', 'printing', 'ejecting'].includes(job) || ['lifting', 'returning'].includes(paper); },
    get paperMoving() { return ['feeding', 'ejecting'].includes(job) || ['lifting', 'returning'].includes(paper); },
    prepare() {
      if (!texture) {
        texture = prepareTexture();
        ink = new MeshStandardMaterial({ map: texture, color: 0xffffff, roughness: 1, clipShadows: true, clippingPlanes: [clip] });
      }
      return texture;
    },
    refreshTexture() {
      if (!texture || disposed) return;
      const previous = texture;
      texture = prepareTexture();
      ink.map = texture;
      ink.needsUpdate = true;
      previous.dispose();
    },
    async warmup(render) {
      const prepared = this.prepare();
      const previous = sheet.material;
      const wasVisible = sheet.visible, wasCulled = sheet.frustumCulled;
      const previousJob = job, previousPaper = paper;
      const warming = [blank, blank, blank, blank, ink, blank];
      sheet.material = warming;
      sheet.visible = true; sheet.frustumCulled = false;
      try { await render(prepared); }
      finally {
        if (sheet.material === warming) sheet.material = previous;
        if (job === previousJob && paper === previousPaper) sheet.visible = wasVisible;
        sheet.frustumCulled = wasCulled;
      }
    },
    print() {
      if (printStarted || disposed || !['idle', 'error'].includes(job)) return false;
      try {
        this.prepare();
      } catch (error) {
        texture?.dispose(); texture = undefined;
        setJob('error');
        console.error('Не удалось подготовить печатную визитку.', error);
        return false;
      }
      printStarted = true;
      setClip(hopper, clipNormal.set(0, 1, 0), 0.12);
      setJob('feeding');
      if (reducedMotion.matches) finishPrint();
      return true;
    },
    open(callback = onRead) {
      if (!printed || disposed || !['output', 'returning', 'reading'].includes(paper)) return false;
      if (paper === 'reading') { callback(); return true; }
      if (paper === 'returning') finishPaper();
      printer.updateWorldMatrix(true, true);
      scene.attach(sheet);
      paper = 'lifting'; elapsed = 0; readCallback = callback;
      applyLift(0);
      onPickup(sheet.getWorldPosition(new Vector3()));
      changed();
      if (reducedMotion.matches) finishPaper();
      return true;
    },
    returnSheet() {
      if (!['reading', 'lifting'].includes(paper) || disposed) return false;
      readCallback = undefined;
      if (paper === 'lifting') {
        outputPose(); paper = 'output'; changed();
      } else {
        paper = 'returning'; elapsed = 0; applyLift(1); changed();
        if (reducedMotion.matches) finishPaper();
      }
      return true;
    },
    resize() {
      if (paper === 'reading') applyLift(1);
      else if (paper === 'lifting' || paper === 'returning') applyLift(paper === 'lifting' ? elapsed / 0.8 : 1 - elapsed / 0.8);
    },
    update(delta) {
      if (disposed || delta <= 0) return;
      if (reducedMotion.matches) { this.finish(); return; }
      if (PRINT_DURATIONS[job]) {
        elapsed += Math.min(delta, 0.1);
        const progress = Math.min(elapsed / PRINT_DURATIONS[job], 1);
        if (job === 'feeding') sheet.position.y = inputPosition.y - progress * 1.97;
        if (job === 'ejecting') sheet.position.z = printerOpening.back - PAPER_HEIGHT / 2 + progress * (OUTPUT.position.z - printerOpening.back + PAPER_HEIGHT / 2);
        if (progress === 1) nextPhase();
      } else if (paper === 'lifting' || paper === 'returning') {
        elapsed += Math.min(delta, 0.1);
        const progress = Math.min(elapsed / 0.8, 1);
        applyLift(paper === 'lifting' ? progress : 1 - progress);
        if (progress === 1) finishPaper();
      }
    },
    finish() {
      if (PRINT_DURATIONS[job]) finishPrint();
      finishPaper();
    },
    dispose() {
      disposed = true;
      readCallback = undefined;
      blank.dispose(); ink?.dispose(); texture?.dispose();
      hopper.add(sheet);
      sheet.position.copy(inputPosition); sheet.quaternion.copy(inputQuaternion); sheet.scale.copy(inputScale);
    },
  };
}
