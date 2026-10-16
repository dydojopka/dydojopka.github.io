const PARTS = ['39486', '60170', '24326', '01064', '97867'];

export function createWindowCode({ onPart = () => {}, onComplete = () => {} } = {}) {
  let part = 0;
  let buffer = '';
  let disposed = false;

  return {
    get complete() { return part === PARTS.length; },
    input(value) {
      if (disposed || part === PARTS.length) return false;
      let matched = false;
      for (const digit of String(value ?? '').replace(/\D/g, '')) {
        buffer = (buffer + digit).slice(-PARTS[part].length);
        if (buffer !== PARTS[part]) continue;
        part++;
        buffer = '';
        matched = true;
        const finished = part === PARTS.length;
        // Commit before callbacks: sounds and the final transition cannot undo
        // a completed part or consume the same code a second time.
        onPart();
        if (finished && !disposed) onComplete();
        if (disposed || part === PARTS.length) break;
      }
      return matched;
    },
    dispose() { disposed = true; buffer = ''; },
  };
}
