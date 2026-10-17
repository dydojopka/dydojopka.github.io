import { t } from './i18n.js';

// Order follows the receiver's authored preset cycle, rather than frequency.
export const RADIO_STATIONS = [
  { frequency: 50, file: 'radio-050-static.mp3', get title() { return t('scene.station50'); }, volume: 0.22,
    spatial: { distanceModel: 'exponential', refDistance: 0.5, rolloffFactor: 6 }, speaker: false },
  { frequency: 157, file: 'radio-157-schubert.mp3', get title() { return t('scene.station157'); }, volume: 1,
    spatial: { distanceModel: 'inverse', refDistance: 1.5, rolloffFactor: 0.6 }, speaker: true },
  { frequency: 227, file: 'radio-227-moonlight.mp3', get title() { return t('scene.station227'); }, volume: 1,
    spatial: { distanceModel: 'inverse', refDistance: 1.5, rolloffFactor: 0.6 }, speaker: true },
  { frequency: 212, file: 'radio-212-raindrop.mp3', get title() { return t('scene.station212'); }, volume: 1,
    spatial: { distanceModel: 'inverse', refDistance: 1.5, rolloffFactor: 0.6 }, speaker: true },
  { frequency: 142, file: 'radio-142-three-note.mp3', get title() { return t('scene.station142'); }, volume: 1,
    spatial: { distanceModel: 'inverse', refDistance: 1.5, rolloffFactor: 0.6 }, speaker: false },
];
