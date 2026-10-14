export function createLicenseDisclaimer({ document }) {
  const dialog = document.querySelector('#license-disclaimer');
  const trigger = document.querySelector('#license-trigger');
  const close = document.querySelector('#license-close');
  if (typeof dialog?.showModal !== 'function') return { syncMode() {}, dispose() {} };

  const events = new AbortController();
  const options = { signal: events.signal };
  dialog.close();
  close.hidden = false;
  function syncMode() {
    const mode = document.documentElement.dataset.mode;
    trigger.hidden = mode === 'scene' || mode === 'loading';
    if (mode !== 'card' && dialog.open) dialog.close();
    trigger.setAttribute('aria-controls', dialog.id);
    trigger.setAttribute('aria-haspopup', 'dialog');
  }
  syncMode();
  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    if (trigger.hidden) return;
    if (!dialog.open) dialog.showModal();
  }, options);
  // Let the dialog handle Escape without triggering scene or card shortcuts.
  dialog.addEventListener('keydown', (event) => event.stopPropagation(), options);

  return {
    syncMode,
    dispose() {
      events.abort();
      if (dialog.open) dialog.close();
      close.hidden = true;
      trigger.hidden = false;
      trigger.removeAttribute('aria-haspopup');
      trigger.removeAttribute('aria-controls');
      trigger.setAttribute('href', '#license-disclaimer');
      dialog.setAttribute('open', '');
    },
  };
}
