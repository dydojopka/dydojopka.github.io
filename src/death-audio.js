// A screen-wide effect, connected to the same master as the room and radio.
export function createDeathAudio({
  baseUrl, request = (url, options) => fetch(url, options),
  onError = (error) => console.warn('Не удалось загрузить звук сбоя.', error),
}) {
  const events = new AbortController();
  let context, output, buffer, pending, source;
  let active = false, requested = false, unavailable = false, disposed = false;
  let elapsed = 0;
  let ended = false;

  function stop() {
    if (!source) return;
    source.onended = null;
    source.stop(); source.disconnect(); source = undefined;
  }
  function start() {
    if (disposed || ended || !requested || !active || source || !buffer || context.state !== 'running' || elapsed >= buffer.duration) return;
    const voice = context.createBufferSource();
    voice.buffer = buffer;
    voice.connect(output);
    source = voice;
    voice.onended = () => { ended = true; voice.disconnect(); if (source === voice) source = undefined; };
    voice.start(0, elapsed);
  }
  function load() {
    if (buffer || pending || unavailable || disposed || !context || !active) return;
    pending = (async () => {
      const response = await request(`${baseUrl}audio/elster-death.mp3`, { signal: events.signal });
      if (!response.ok) throw new Error(`Не загружен звук сбоя: ${response.status}`);
      const data = await response.arrayBuffer();
      if (disposed) return;
      const decoded = await context.decodeAudioData(data);
      if (disposed) return;
      buffer = decoded;
      start();
    })().catch((error) => {
      if (!disposed) { unavailable = true; onError(error); }
    }).finally(() => { pending = undefined; });
  }
  return {
    duringDeath: true,
    connect(connection) {
      if (disposed || context) return;
      ({ context, output } = connection);
      context.addEventListener?.('statechange', start, { signal: events.signal });
    },
    activate() { load(); start(); },
    play() { if (disposed || requested) return; requested = true; load(); start(); },
    setTime(time) { if (!disposed) { elapsed = time; start(); } },
    setActive(value) {
      if (disposed || active === value) return;
      active = value;
      if (!value) stop();
      else { if (requested) load(); start(); }
    },
    dispose() {
      if (disposed) return;
      disposed = true; active = false;
      events.abort(); stop(); buffer = undefined;
    },
  };
}
