// Order follows the receiver's authored preset cycle, rather than frequency.
export const RADIO_STATIONS = [
  { frequency: 50, file: 'radio-050-static.mp3', title: 'Радиопомехи', volume: 0.22,
    spatial: { distanceModel: 'exponential', refDistance: 0.5, rolloffFactor: 6 }, speaker: false },
  { frequency: 157, file: 'radio-157-schubert.mp3', title: 'Шуберт — Серенада', volume: 1,
    spatial: { distanceModel: 'inverse', refDistance: 1.5, rolloffFactor: 0.6 }, speaker: true },
  { frequency: 227, file: 'radio-227-moonlight.mp3', title: 'Бетховен — Лунная соната', volume: 1,
    spatial: { distanceModel: 'inverse', refDistance: 1.5, rolloffFactor: 0.6 }, speaker: true },
  { frequency: 212, file: 'radio-212-raindrop.mp3', title: 'Шопен — Прелюдия «Дождевые капли»', volume: 1,
    spatial: { distanceModel: 'inverse', refDistance: 1.5, rolloffFactor: 0.6 }, speaker: true },
  { frequency: 142, file: 'radio-142-three-note.mp3', title: 'Three Note Oddity', volume: 1,
    spatial: { distanceModel: 'inverse', refDistance: 1.5, rolloffFactor: 0.6 }, speaker: false },
];
