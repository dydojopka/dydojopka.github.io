import { t } from './i18n.js';

export const DEFAULT_SCENE_VOLUME = 0.5;
const VOLUME_KEY = 'workstation-volume';

export function readSceneVolume(window) {
  try {
    const saved = window.localStorage.getItem(VOLUME_KEY);
    if (saved !== null && saved.trim() !== '') {
      const volume = Number(saved);
      if (Number.isFinite(volume) && volume >= 0 && volume <= 1) return volume;
    }
  } catch { /* The scene also works when browser storage is unavailable. */ }
  return DEFAULT_SCENE_VOLUME;
}

export function saveSceneVolume(window, volume) {
  try { window.localStorage.setItem(VOLUME_KEY, String(volume)); }
  catch { /* Keep the current setting even when it cannot be persisted. */ }
}

export function syncSceneVolumeControl(slider, control, volume, muteButton) {
  const percent = Math.round(volume * 100);
  slider.value = String(percent);
  slider.setAttribute('aria-valuetext', percent ? `${percent}%` : t('scene.soundOff'));
  control.dataset.muted = String(!percent);
  control.style.setProperty('--sound-level', `${percent}%`);
  if (muteButton) {
    const label = percent ? t('scene.mute') : t('scene.unmute');
    muteButton.setAttribute('aria-label', label);
    muteButton.setAttribute('aria-pressed', String(!percent));
    muteButton.title = label;
  }
}
