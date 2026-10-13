const SOUNDS = {
  wind: { file: 'window-wind.mp3', volume: 0.8, filter: { frequency: 1000, Q: -3 } },
  computer: { file: 'computer-loop.mp3', volume: 0.35, spatial: { refDistance: 1.7, rolloffFactor: 1.05 } },
  printer: { file: 'printer-loop.mp3', volume: 1.4, spatial: { refDistance: 1.8, rolloffFactor: 1, coneInnerAngle: 12, coneOuterAngle: 50, coneOuterGain: 0.18 } },
};

function copyVector(target, value) {
  if (target.x === value.x && target.y === value.y && target.z === value.z) return false;
  Object.assign(target, { x: value.x, y: value.y, z: value.z });
  return true;
}

function positionNode(node, position, time) {
  if (node.positionX) {
    for (const axis of ['x', 'y', 'z']) node[`position${axis.toUpperCase()}`].setValueAtTime(position[axis], time);
  } else node.setPosition(position.x, position.y, position.z);
}

export function createSceneAudio({
  baseUrl,
  initialVolume = 0.5,
  createContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)(),
  request = (url, options) => fetch(url, options),
  onChange = () => {},
  onError = (error) => console.warn('Не удалось включить звук сцены.', error),
}) {
  const events = new AbortController();
  const buffers = new Map();
  const pending = new Map();
  const playing = new Map();
  const emitters = new Map();
  const listenerPose = { position: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } };
  let context;
  let master;
  let volume = Number.isFinite(initialVolume) ? Math.max(0, Math.min(1, initialVolume)) : 0.5;
  let unlocked = false;
  let active = false;
  let printing = false;
  let disposed = false;

  const audible = () => unlocked && volume > 0 && active && !disposed;
  const wanted = (name) => audible() && (name !== 'printer' || printing);

  function stop(name) {
    const nodes = playing.get(name);
    if (!nodes) return;
    playing.delete(name);
    nodes.source.stop();
    nodes.source.disconnect();
    nodes.gain.disconnect();
    nodes.panner?.disconnect();
    nodes.filter?.disconnect();
  }
  function suspend() {
    // Suspending the audio clock preserves loop positions and filter state.
    if (context && context.state !== 'closed') context.suspend().catch(() => {});
  }
  function failed(error) {
    if (disposed || !volume) return;
    volume = 0;
    suspend();
    onChange(volume);
    onError(error);
  }
  function load(name) {
    if (buffers.has(name)) return Promise.resolve(buffers.get(name));
    if (!pending.has(name)) {
      const promise = (async () => {
        const response = await request(`${baseUrl}audio/${SOUNDS[name].file}`, { signal: events.signal });
        if (!response.ok) throw new Error(`Не загружен звук ${name}: ${response.status}`);
        const data = await response.arrayBuffer();
        if (disposed) return;
        const buffer = await context.decodeAudioData(data);
        if (!disposed) buffers.set(name, buffer);
        return buffer;
      })().finally(() => pending.delete(name));
      pending.set(name, promise);
    }
    return pending.get(name);
  }
  function placeSource(name, panner) {
    const emitter = emitters.get(name);
    if (!emitter) return;
    positionNode(panner, emitter.position, context.currentTime);
    if (panner.orientationX) {
      for (const axis of ['x', 'y', 'z']) panner[`orientation${axis.toUpperCase()}`].setValueAtTime(emitter.direction[axis], context.currentTime);
    } else panner.setOrientation(emitter.direction.x, emitter.direction.y, emitter.direction.z);
  }
  function placeListener() {
    const { listener, currentTime } = context;
    const { position, forward, up } = listenerPose;
    positionNode(listener, position, currentTime);
    if (listener.forwardX) {
      for (const [prefix, vector] of [['forward', forward], ['up', up]]) {
        for (const axis of ['x', 'y', 'z']) listener[`${prefix}${axis.toUpperCase()}`].setValueAtTime(vector[axis], currentTime);
      }
    } else listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
  }
  function start(name, buffer) {
    if (!buffer || !wanted(name) || context.state !== 'running' || playing.has(name)) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const spatial = SOUNDS[name].spatial;
    const panner = spatial ? context.createPanner() : undefined;
    const filterSettings = SOUNDS[name].filter;
    const filter = filterSettings ? context.createBiquadFilter() : undefined;
    source.buffer = buffer;
    source.loop = true;
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(SOUNDS[name].volume, context.currentTime + 0.02);
    source.connect(gain);
    let output = gain;
    if (filter) {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterSettings.frequency, context.currentTime);
      filter.Q.setValueAtTime(filterSettings.Q, context.currentTime);
      gain.connect(filter);
      output = filter;
    }
    if (panner) {
      Object.assign(panner, { panningModel: 'HRTF', distanceModel: 'inverse', maxDistance: 30, ...spatial });
      placeSource(name, panner);
      output.connect(panner);
      panner.connect(master);
    } else output.connect(master);
    playing.set(name, { source, gain, panner, filter });
    source.start();
  }
  function sync() {
    if (!printing) stop('printer');
    if (!audible()) { suspend(); return; }
    // resume() runs from a scene gesture, before fetching or decoding audio.
    context.resume().then(() => {
      if (!audible()) { suspend(); return; }
      for (const name of Object.keys(SOUNDS)) load(name).then((buffer) => start(name, buffer)).catch(failed);
    }).catch(failed);
  }
  function activate() {
    if (disposed) return;
    unlocked = true;
    try {
      if (volume && !context) {
        context = createContext();
        master = context.createGain();
        master.gain.setValueAtTime(0, context.currentTime);
        master.connect(context.destination);
        placeListener();
      }
      if (master) master.gain.setTargetAtTime(volume, context.currentTime, 0.02);
      sync();
    } catch (error) { failed(error); }
  }

  return {
    get enabled() { return volume > 0; },
    get volume() { return volume; },
    activate,
    setVolume(value) {
      if (disposed) return;
      const next = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
      if (next !== volume) { volume = next; onChange(volume); }
      activate();
    },
    setSource(name, position, direction = { x: 0, y: 0, z: 1 }) {
      if (disposed || !SOUNDS[name]?.spatial) return;
      emitters.set(name, { position: { ...position }, direction: { ...direction } });
      const panner = playing.get(name)?.panner;
      if (panner) placeSource(name, panner);
    },
    setListenerPose(position, forward, up) {
      if (disposed) return;
      const moved = copyVector(listenerPose.position, position);
      const turned = copyVector(listenerPose.forward, forward);
      const tilted = copyVector(listenerPose.up, up);
      if (context && (moved || turned || tilted)) placeListener();
    },
    setActive(value) {
      if (disposed || active === value) return;
      active = value;
      sync();
    },
    setPrinting(value) {
      if (disposed || printing === value) return;
      printing = value;
      sync();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      events.abort();
      for (const name of playing.keys()) stop(name);
      suspend();
      if (context) context.close().catch(() => {});
      master?.disconnect();
      buffers.clear();
      pending.clear();
      emitters.clear();
    },
  };
}
