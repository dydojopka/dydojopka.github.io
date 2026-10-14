import { createCardMode } from './card-mode.js';
import { createLicenseDisclaimer } from './license-disclaimer.js';

let disclaimer;
const modes = createCardMode({
  window,
  document,
  onModeChange() { disclaimer?.syncMode(); },
  async loadRuntime(callbacks) {
    const { createSceneRuntime } = await import('./main.js');
    return createSceneRuntime(callbacks);
  },
});
disclaimer = createLicenseDisclaimer({ document });
modes.start();
