import { RADIO_STATIONS } from './radio-stations.js';

export function createRadioController({ now, onChange = () => {} }) {
  let index = 0;
  const clocks = new Map();
  const durations = new Map();
  function position(frequency) {
    const startedAt = clocks.get(frequency);
    const duration = durations.get(frequency);
    if (startedAt === undefined || !duration) return 0;
    return Math.max(0, now() - startedAt) % duration;
  }
  return {
    get station() { return RADIO_STATIONS[index]; },
    get frequency() { return this.station.frequency; },
    next() {
      index = (index + 1) % RADIO_STATIONS.length;
      onChange(this.station);
      return this.station;
    },
    setDuration(frequency, duration) {
      if (Number.isFinite(duration) && duration > 0) durations.set(frequency, duration);
    },
    hasStarted(frequency) { return clocks.has(frequency); },
    started(frequency, offset = 0) {
      if (!clocks.has(frequency)) clocks.set(frequency, now() - offset);
    },
    position,
  };
}
