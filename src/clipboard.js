export async function copyEmail(href) {
  const address = decodeURIComponent(href.replace(/^mailto:/i, '').split('?')[0]);
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(address); return true; }
  } catch { /* Restricted clipboard permissions use the selection fallback. */ }
  const active = document.activeElement;
  const selection = window.getSelection();
  const ranges = Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange());
  const input = document.createElement('textarea');
  input.value = address; input.readOnly = true;
  input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.append(input); input.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { copied = false; } finally {
    input.remove(); active?.focus({ preventScroll: true }); selection.removeAllRanges();
    ranges.forEach((range) => selection.addRange(range));
  }
  return copied;
}
