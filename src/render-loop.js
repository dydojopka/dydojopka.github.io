const FRAME_INTERVAL = 1000 / 60;
const FRAME_TOLERANCE = 0.5;

export function createRenderLoop({ update, draw, requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame }) {
  let frame = 0;
  let visible = false;
  let animated = false;
  let lastUpdate;
  let nextDraw;
  let version = 0;

  function requestDraw() {
    if (visible && !frame) frame = requestFrame(tick);
  }
  function tick(time) {
    frame = 0;
    if (!visible) return;
    const currentVersion = version;
    if (!animated) {
      draw();
      return;
    }
    if (nextDraw === undefined || time >= nextDraw - FRAME_TOLERANCE) {
      const delta = lastUpdate === undefined ? 0 : Math.min((time - lastUpdate) / 1000, 0.1);
      lastUpdate = time;
      // Retain the remainder on 75/120/144 Hz displays. Resetting the deadline
      // to time + interval would permanently discard time on every skip.
      nextDraw = nextDraw === undefined ? time + FRAME_INTERVAL
        : nextDraw + Math.max(1, Math.floor((time - nextDraw + FRAME_TOLERANCE) / FRAME_INTERVAL) + 1) * FRAME_INTERVAL;
      update(delta);
      if (version !== currentVersion) return;
      draw();
    }
    requestDraw();
  }
  return {
    requestDraw,
    setMode(mode) {
      cancelFrame(frame);
      frame = 0;
      version++;
      visible = mode.visible;
      animated = mode.animated;
      lastUpdate = nextDraw = undefined;
      requestDraw();
    },
  };
}
