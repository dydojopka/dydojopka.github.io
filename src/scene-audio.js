const SOUNDS = {
  wind: { file: 'window-wind.mp3', volume: 0.8, filter: { frequency: 1000, Q: -3 } },
  computer: { file: 'computer-loop.mp3', volume: 0.35, spatial: { refDistance: 1.7, rolloffFactor: 1.05 } },
  printer: { file: 'printer-loop.mp3', volume: 1.4, spatial: { refDistance: 1.8, rolloffFactor: 1, coneInnerAngle: 12, coneOuterAngle: 50, coneOuterGain: 0.18 } },
  desert: { file: 'window-toteninsel.mp3', volume: 0.65, optional: true },
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
  const unavailable = new Set();
  const playing = new Map();
  const emitters = new Map();
  const streams = new Set();
  const listenerPose = { position: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } };
  let context;
  let master;
  let volume = Number.isFinite(initialVolume) ? Math.max(0, Math.min(1, initialVolume)) : 0.5;
  let previousVolume = volume || 0.5;
  let unlocked = false;
  let active = false;
  let printing = false;
  let desert = false;
  let windGust = 0;
  let disposed = false;

  const audible = () => unlocked && volume > 0 && active && !disposed;
  const wanted = (name) => audible() && (name !== 'printer' || printing)
    && (name !== 'wind' || !desert) && (name !== 'desert' || desert);
  const windVolume = () => SOUNDS.wind.volume * (1 + 2 * windGust);
  const windFrequency = () => SOUNDS.wind.filter.frequency + 1800 * windGust;

  function windTarget(parameter, value) {
    const time = context.currentTime;
    if (parameter.cancelAndHoldAtTime) parameter.cancelAndHoldAtTime(time);
    else {
      const held = parameter.value;
      parameter.cancelScheduledValues?.(time);
      parameter.setValueAtTime(held, time);
    }
    parameter.setTargetAtTime(value, time, 0.07);
  }

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
    for (const stream of streams) stream.setActive(false);
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
    if (unavailable.has(name)) return Promise.resolve();
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
    gain.gain.linearRampToValueAtTime(name === 'wind' ? windVolume() : SOUNDS[name].volume, context.currentTime + 0.02);
    source.connect(gain);
    let output = gain;
    if (filter) {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(name === 'wind' ? windFrequency() : filterSettings.frequency, context.currentTime);
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
  function sync(gesture = false) {
    if (!printing) stop('printer');
    stop(desert ? 'wind' : 'desert');
    if (!audible()) { suspend(); return; }
    for (const stream of streams) {
      stream.setActive(true);
      if (gesture) stream.activate();
    }
    // resume() runs from a scene gesture, before fetching or decoding audio.
    context.resume().then(() => {
      if (!audible()) { suspend(); return; }
      for (const [name, sound] of Object.entries(SOUNDS)) {
        if ((name === 'wind' && desert) || (sound.optional && !wanted(name))) continue;
        load(name).then((buffer) => start(name, buffer)).catch((error) => {
          if (name === 'wind' && desert) return;
          if (!sound.optional) { failed(error); return; }
          if (disposed || unavailable.has(name)) return;
          unavailable.add(name);
          onError(error);
        });
      }
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
        for (const stream of streams) stream.connect({ context, output: master });
        context.addEventListener?.('statechange', () => {
          if (context.state === 'interrupted') for (const stream of streams) stream.setActive(false);
        });
      }
      if (master) master.gain.setTargetAtTime(volume, context.currentTime, 0.02);
      sync(true);
    } catch (error) { failed(error); }
  }

  function setVolume(value) {
    if (disposed) return;
    const next = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    if (next > 0) previousVolume = next;
    if (next !== volume) { volume = next; onChange(volume); }
    activate();
  }

  return {
    get enabled() { return volume > 0; },
    get volume() { return volume; },
    get currentTime() { return context?.currentTime ?? 0; },
    activate,
    addStream(stream) {
      if (disposed) { stream.dispose(); return; }
      streams.add(stream);
      if (context) stream.connect({ context, output: master });
      stream.setActive(audible());
    },
    setVolume,
    toggleMute() { setVolume(volume > 0 ? 0 : previousVolume); },
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
    setDesert(value) {
      if (disposed || desert === value) return;
      desert = value;
      if (desert) windGust = 0;
      sync();
    },
    setWindGust(value) {
      if (disposed || desert) return;
      const next = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
      if (windGust === next) return;
      windGust = next;
      const wind = playing.get('wind');
      if (!wind) return;
      windTarget(wind.gain.gain, windVolume());
      windTarget(wind.filter.frequency, windFrequency());
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      events.abort();
      for (const stream of streams) stream.dispose();
      streams.clear();
      for (const name of playing.keys()) stop(name);
      suspend();
      if (context) context.close().catch(() => {});
      master?.disconnect();
      buffers.clear();
      pending.clear();
      unavailable.clear();
      emitters.clear();
    },
  };
}
