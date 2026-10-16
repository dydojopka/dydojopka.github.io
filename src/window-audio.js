import { createSceneEffectsAudio } from './scene-effects-audio.js';

export function createWindowAudio(options) {
  return createSceneEffectsAudio({
    sounds: { impact: 'window-impact.mp3' },
    onError: (error) => console.warn('Не удалось загрузить звук окна.', error),
    ...options,
  });
}
