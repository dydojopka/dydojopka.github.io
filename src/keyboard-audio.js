const SOUNDS = {
  tap: 'keyboard-tap.mp3',
  space: 'keyboard-space.mp3',
  enter: 'keyboard-enter.mp3',
};
const MAX_VOICES = 8;

export function createKeyboardAudio({
  baseUrl, request = (url, options) => fetch(url, options),
  onError = (error) => console.warn('Не удалось загрузить звук клавиатуры.', error),
}) {
  const events = new AbortController();
  const buffers = new Map(), pending = new Map(), unavailable = new Set(), voices = new Set();
  let context, output;
  let active = false;
  let disposed = false;
  let version = 0;

  function release(voice, stop = false) {
    if (!voices.delete(voice)) return;
    voice.source.onended = null;
    if (stop) voice.source.stop();
    voice.source.disconnect(); voice.gain.disconnect(); voice.panner.disconnect();
  }
  function load(sound) {
    if (buffers.has(sound)) return Promise.resolve(buffers.get(sound));
    if (unavailable.has(sound)) return Promise.resolve();
    if (!pending.has(sound)) {
      const promise = (async () => {
        const response = await request(`${baseUrl}audio/${SOUNDS[sound]}`, { signal: events.signal });
        if (!response.ok) throw new Error(`Не загружен звук ${sound}: ${response.status}`);
        const data = await response.arrayBuffer();
        if (disposed) return;
        const buffer = await context.decodeAudioData(data);
        if (!disposed) { buffers.set(sound, buffer); return buffer; }
      })().catch((error) => {
        if (!disposed) { unavailable.add(sound); onError(error); }
      }).finally(() => pending.delete(sound));
      pending.set(sound, promise);
    }
    return pending.get(sound);
  }
  function start(buffer, position) {
    if (voices.size >= MAX_VOICES) release(voices.values().next().value, true);
    const source = context.createBufferSource(), gain = context.createGain(), panner = context.createPanner();
    source.buffer = buffer;
    gain.gain.setValueAtTime(0.65, context.currentTime);
    Object.assign(panner, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 2, maxDistance: 30, rolloffFactor: 1 });
    if (panner.positionX) {
      for (const axis of ['x', 'y', 'z']) panner[`position${axis.toUpperCase()}`].setValueAtTime(position[axis], context.currentTime);
    } else panner.setPosition(position.x, position.y, position.z);
    source.connect(gain); gain.connect(panner); panner.connect(output);
    const voice = { source, gain, panner };
    voices.add(voice);
    source.onended = () => release(voice);
    source.start();
  }
  return {
    connect(connection) {
      if (disposed || context) return;
      ({ context, output } = connection);
    },
    activate() {
      if (disposed || !active || !context) return;
      for (const sound of Object.keys(SOUNDS)) load(sound);
    },
    play(sound, position) {
      if (disposed || !active || !context || !SOUNDS[sound]) return;
      const currentVersion = version, time = context.currentTime;
      const point = { x: position.x, y: position.y, z: position.z };
      if (buffers.has(sound) && context.state === 'running') { start(buffers.get(sound), point); return; }
      load(sound).then((buffer) => {
        // Do not replay an old tap after loading, muting or leaving the scene.
        if (buffer && !disposed && active && currentVersion === version && context.state === 'running' && context.currentTime - time < 0.15) start(buffer, point);
      });
    },
    setActive(value) {
      if (disposed || active === value) return;
      active = value;
      if (!value) { version++; for (const voice of voices) release(voice, true); }
    },
    dispose() {
      if (disposed) return;
      disposed = true; active = false; version++;
      events.abort();
      for (const voice of voices) release(voice, true);
      buffers.clear(); pending.clear(); unavailable.clear();
    },
  };
}
