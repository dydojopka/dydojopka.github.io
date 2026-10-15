import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';

export const PROMISE_MESSAGE = 'REMEMBER OUR PROMISE';

export function createMonitorPromise({ screen, light, interference, reducedMotion, onChange, createCanvas = () => document.createElement('canvas') }) {
  const original = screen.material.map;
  const originalColor = light.color.clone(), originalIntensity = light.intensity;
  const canvas = createCanvas();
  canvas.width = 1440; canvas.height = 1080;
  const context = canvas.getContext('2d');
  context.fillStyle = '#000'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = '112px "Signalis Dialogue", monospace';
  context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillStyle = '#b81019'; context.shadowColor = '#df101c'; context.shadowBlur = 5;
  context.fillText(PROMISE_MESSAGE, canvas.width / 2, canvas.height / 2, canvas.width * 0.74);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false; texture.minFilter = LinearFilter;
  let state = 'idle', disposed = false;
  function restore() {
    screen.material.map = original;
    light.color.copy(originalColor); light.intensity = originalIntensity;
  }
  function show() {
    if (state !== 'interference') return;
    state = 'message'; screen.material.map = texture;
    light.color.setHex(0xe66b72); light.intensity = 0.45;
    onChange();
  }
  return {
    get active() { return state === 'interference' || state === 'message'; },
    trigger() {
      if (disposed || state !== 'idle') return false;
      state = 'interference';
      if (reducedMotion.matches) show();
      else { interference.trigger(); onChange(); }
      return true;
    },
    update() { if (!disposed && !interference.active) show(); },
    finish() { if (!disposed) { interference.clear(); show(); } },
    dismiss() {
      if (disposed || state !== 'message') return false;
      state = 'dismissed'; restore();
      onChange();
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true; restore(); texture.dispose();
    },
  };
}
