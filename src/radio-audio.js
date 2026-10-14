const FADE_SECONDS = 0.08;

function waitForMedia(element, eventName, ready, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('Истекло время загрузки радиостанции.')), 30000);
    function finish(error) {
      clearTimeout(timeout);
      element.removeEventListener(eventName, changed);
      element.removeEventListener('error', failed);
      signal.removeEventListener('abort', aborted);
      if (error) reject(error); else resolve();
    }
    function changed() { if (ready()) finish(); }
    function failed() { finish(new Error('Не загружена запись радиостанции.')); }
    function aborted() { finish(signal.reason); }
    element.addEventListener(eventName, changed);
    element.addEventListener('error', failed);
    signal.addEventListener('abort', aborted, { once: true });
  });
}

export function createRadioAudio({
  controller, baseUrl, createMedia = () => new Audio(),
  onError = (error) => console.warn('Не удалось включить радиостанцию.', error),
}) {
  const slots = new Map();
  const spatialProfiles = new Map();
  let context, output;
  let active = false;
  let disposed = false;
  let current;
  let emitter;

  function place(slot) {
    if (!emitter) return;
    const { panner } = slot;
    const { position, direction } = emitter;
    if (panner.positionX) {
      for (const [prefix, vector] of [['position', position], ['orientation', direction]]) {
        for (const axis of ['x', 'y', 'z']) panner[`${prefix}${axis.toUpperCase()}`].setValueAtTime(vector[axis], context.currentTime);
      }
    } else {
      panner.setPosition(position.x, position.y, position.z);
      panner.setOrientation(direction.x, direction.y, direction.z);
    }
  }
  function gain(slot, value, fade = FADE_SECONDS) {
    const parameter = slot.gain.gain;
    if (parameter.cancelAndHoldAtTime) parameter.cancelAndHoldAtTime(context.currentTime);
    else {
      const held = parameter.value;
      parameter.cancelScheduledValues(context.currentTime);
      parameter.setValueAtTime(held, context.currentTime);
    }
    if (fade) parameter.linearRampToValueAtTime(value, context.currentTime + fade);
    else parameter.setValueAtTime(value, context.currentTime);
  }
  function stop(slot, immediate = false) {
    slot.attempt?.abort();
    slot.attempt = undefined;
    slot.playing = false;
    clearTimeout(slot.pauseTimer);
    gain(slot, 0, immediate ? 0 : FADE_SECONDS);
    if (immediate) slot.element.pause();
    else slot.pauseTimer = setTimeout(() => { slot.element.pause(); slot.pauseTimer = undefined; }, FADE_SECONDS * 1000);
  }
  function speakerNoise(input, mix, nodes) {
    // Follow the filtered music's amplitude, so interference also recedes in
    // quiet passages. The envelope never reaches the acoustic output.
    const rectifier = context.createWaveShaper();
    rectifier.curve = Float32Array.from({ length: 1025 }, (_, i) => Math.abs(i / 512 - 1) * 0.07);
    const envelope = context.createBiquadFilter();
    envelope.type = 'lowpass'; envelope.frequency.value = 4; envelope.Q.value = -3;
    const noiseGain = context.createGain(); noiseGain.gain.value = 0;
    input.connect(rectifier); rectifier.connect(envelope); envelope.connect(noiseGain.gain);
    const noise = context.createBufferSource();
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 142;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = seed / 2147483648 - 1;
    }
    noise.buffer = buffer; noise.loop = true;
    const high = context.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 400;
    const low = context.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 3500;
    noise.connect(high); high.connect(low); low.connect(noiseGain); noiseGain.connect(mix);
    noise.start();
    nodes.push(rectifier, envelope, noiseGain, high, low, noise);
    return noise;
  }
  function slotFor(station) {
    if (slots.has(station.frequency)) return slots.get(station.frequency);
    const element = createMedia();
    element.preload = 'metadata'; element.loop = true;
    const source = context.createMediaElementSource(element);
    const mix = context.createGain(); mix.gain.value = 0;
    const panner = context.createPanner();
    Object.assign(panner, { panningModel: 'HRTF', maxDistance: 40, ...station.spatial, ...spatialProfiles.get(station.frequency) });
    const nodes = [source, mix, panner];
    let signal = source;
    if (station.speaker) {
      const high = context.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 170; high.Q.value = 0.5;
      const low = context.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 4000; low.Q.value = 0.5;
      source.connect(high); high.connect(low); signal = low;
      nodes.push(high, low);
    }
    signal.connect(mix); mix.connect(panner); panner.connect(output);
    const noise = station.speaker ? speakerNoise(signal, mix, nodes) : undefined;
    const slot = { station, element, gain: mix, panner, nodes, noise, playing: false };
    slots.set(station.frequency, slot);
    place(slot);
    const failed = () => {
      if (current !== slot || !active || disposed) return;
      stop(slot, true);
      onError(new Error(`Не загружена частота ${station.frequency}.`));
    };
    element.addEventListener('error', failed);
    slot.failed = failed;
    const waiting = () => {
      if (disposed || !active || current !== slot || !slot.playing) return;
      gain(slot, 0, 0);
      slot.playing = false;
      start();
    };
    element.addEventListener('waiting', waiting);
    slot.waiting = waiting;
    element.src = `${baseUrl}audio/${station.file}`;
    return slot;
  }
  async function seek(slot, position, signal) {
    const { element } = slot;
    if (Math.abs(element.currentTime - position) < 0.025 && !element.seeking) return;
    element.currentTime = position;
    await waitForMedia(element, 'seeked', () => !element.seeking, signal);
  }
  function start() {
    if (!active || disposed || !context) return;
    let slot;
    try { slot = slotFor(controller.station); }
    catch (error) { onError(error); return; }
    current = slot;
    if (slot.playing || slot.attempt) return;
    clearTimeout(slot.pauseTimer);
    gain(slot, 0, 0);
    const attempt = new AbortController();
    slot.attempt = attempt;
    const valid = () => !disposed && active && current === slot && slot.attempt === attempt && !attempt.signal.aborted;
    // Invoke play() synchronously in the selecting/unlocking gesture. Keep its
    // output silent until metadata, playback permission and seeking agree.
    let playback;
    try {
      if (slot.element.error) slot.element.load();
      playback = Promise.resolve(slot.element.play());
    }
    catch (error) { playback = Promise.reject(error); }
    const permission = playback.then(() => {
      if (!valid() && (current !== slot || !active || disposed)) slot.element.pause();
    }).catch((error) => { attempt.abort(error); throw error; });
    async function prepare() {
      await Promise.all([permission, waitForMedia(slot.element, 'loadedmetadata',
        () => Number.isFinite(slot.element.duration) && slot.element.duration > 0, attempt.signal)]);
      if (!valid()) return;
      const frequency = slot.station.frequency;
      controller.setDuration(frequency, slot.element.duration);
      await seek(slot, controller.position(frequency), attempt.signal);
      if (!valid()) return;
      // Slow range requests can finish well after the first position estimate.
      // Recheck after every seek, including a delayed corrective seek.
      while (valid() && controller.hasStarted(frequency)) {
        const position = controller.position(frequency);
        const difference = Math.abs(slot.element.currentTime - position);
        if (Math.min(difference, slot.element.duration - difference) <= 0.1) break;
        await seek(slot, position, attempt.signal);
      }
      if (!valid()) return;
      controller.started(frequency, slot.element.currentTime);
      slot.playing = true;
      slot.attempt = undefined;
      gain(slot, slot.station.volume);
    }
    prepare().catch((error) => {
      if (slot.attempt !== attempt) return;
      const report = !disposed && active && current === slot;
      stop(slot, true);
      if (report) onError(error);
    });
  }
  return {
    connect(graph) {
      if (context || disposed) return;
      ({ context, output } = graph);
    },
    setSource(position, direction) {
      emitter = { position: { ...position }, direction: { ...direction } };
      for (const slot of slots.values()) place(slot);
    },
    setSpatialProfile(frequency, profile) {
      if (disposed) return;
      spatialProfiles.set(frequency, { ...profile });
      const slot = slots.get(frequency);
      if (slot) Object.assign(slot.panner, profile);
    },
    select() {
      if (disposed) return;
      if (current) stop(current);
      current = undefined;
      start();
    },
    activate() { start(); },
    setActive(value) {
      if (disposed || active === value) return;
      active = value;
      if (value) start();
      else for (const slot of slots.values()) stop(slot, true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const slot of slots.values()) {
        stop(slot, true);
        slot.element.removeEventListener('error', slot.failed);
        slot.element.removeEventListener('waiting', slot.waiting);
        slot.element.removeAttribute('src'); slot.element.load();
        slot.noise?.stop();
        for (const node of slot.nodes) node.disconnect();
      }
      slots.clear();
    },
  };
}
