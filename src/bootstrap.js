import { createCardMode } from './card-mode.js';

const modes = createCardMode({
  window,
  document,
  async loadRuntime(callbacks) {
    const { createSceneRuntime } = await import('./main.js');
    return createSceneRuntime(callbacks);
  },
});
modes.start();
