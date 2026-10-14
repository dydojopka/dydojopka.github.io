import { Quaternion, Vector3 } from 'three';
import { screenCenter } from './screen.js';
import { radioEmitter } from './radio-focus.js';

export function createSceneAudioPlacement({ audio, camera, screen, printer, radio, radioAudio }) {
  printer.updateWorldMatrix(true, false);
  audio.setSource('computer', screenCenter(screen));
  audio.setSource('printer', printer.getObjectByName('printer-display-screen').getWorldPosition(new Vector3()),
    new Vector3(0, 0.35, 1).normalize().transformDirection(printer.matrixWorld));
  if (radio && radioAudio) {
    const { position, direction } = radioEmitter(radio);
    radioAudio.setSource(position, direction);
  }
  const position = new Vector3(), forward = new Vector3(), up = new Vector3();
  const rotation = new Quaternion();
  return () => {
    camera.getWorldPosition(position);
    camera.getWorldQuaternion(rotation);
    forward.set(0, 0, -1).applyQuaternion(rotation);
    up.set(0, 1, 0).applyQuaternion(rotation);
    audio.setListenerPose(position, forward, up);
  };
}
