// Keep the full desk visible, including on portrait displays. A narrow screen
// reveals more room above and below instead of cutting off the objects.
export function cameraFrame(aspect) {
  const height = Math.max(6.35, 10.7 / Math.max(aspect, 0.1));
  return { left: -height * aspect / 2, right: height * aspect / 2, top: height / 2, bottom: -height / 2 };
}

export function renderSize(width, height) {
  const scale = Math.min(1, 640 / Math.max(height, 1), 1600 / Math.max(width, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function wrap(value, min, max) {
  const length = max - min;
  return ((value - min) % length + length) % length + min;
}
