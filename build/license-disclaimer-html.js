import { t } from '../src/i18n.js';

export function getLicenseDisclaimerHtml(locale = 'ru') {
  return Array.from({ length: 6 }, (_, index) => {
    const key = `legal.notice${index + 1}`;
    return `<p data-i18n-html="${key}">${t(key, {}, locale)}</p>`;
  }).join('\n');
}

export const licenseDisclaimerHtml = getLicenseDisclaimerHtml('ru');
