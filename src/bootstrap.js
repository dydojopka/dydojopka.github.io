import { createCardMode } from './card-mode.js';
import { createLicenseDisclaimer } from './license-disclaimer.js';
import { createLanguageControls } from './language-controls.js';
import { getPortfolioContent } from './portfolio-content.js';
import { businessCardHtml } from './business-card-html.js';

let disclaimer;
const language = createLanguageControls({
  window,
  document,
  base: import.meta.env.BASE_URL,
  renderCard: (locale) => businessCardHtml(getPortfolioContent(locale), import.meta.env.BASE_URL, locale),
});
const modes = createCardMode({
  window,
  document,
  onModeChange() { disclaimer?.syncMode(); language.syncLinks(); },
  async loadRuntime(callbacks) {
    const { createSceneRuntime } = await import('./main.js');
    return createSceneRuntime(callbacks);
  },
});
disclaimer = createLicenseDisclaimer({ document });
modes.start();

if (import.meta.hot) import.meta.hot.dispose(() => { modes.dispose(); disclaimer.dispose(); language.dispose(); });
