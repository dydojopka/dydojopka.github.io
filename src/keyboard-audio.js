import { createSceneEffectsAudio } from './scene-effects-audio.js';

const SOUNDS = {
  tap: 'keyboard-tap.mp3',
  space: 'keyboard-space.mp3',
  enter: 'keyboard-enter.mp3',
};

export function createKeyboardAudio(options) {
  return createSceneEffectsAudio({
    sounds: SOUNDS,
    onError: (error) => console.warn('Не удалось загрузить звук клавиатуры.', error),
    ...options,
  });
}
