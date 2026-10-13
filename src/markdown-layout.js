export const TERMINAL_FONT = 'Consolas, "Lucida Console", monospace';

export function runFont(run, size, fontFamily = TERMINAL_FONT) {
  return `${run.italic ? 'italic ' : ''}${run.bold ? 'bold ' : ''}${size}px ${fontFamily}`;
}

export function layoutMarkdown(ctx, blocks, width, baseSize = 24, images = new Map(), fontFamily = TERMINAL_FONT) {
  const items = [];
  let top = 0;
  for (const block of blocks) {
    if (block.type === 'rule') { items.push({ type: 'rule', x: 0, y: top + 8, width }); top += 28; continue; }
    if (block.type === 'image') {
      const run = block.runs.find((item) => item.type === 'image');
      const image = images.get(run.src);
      const imageWidth = image?.naturalWidth || width;
      const imageHeight = image?.naturalHeight || baseSize * 4;
      const renderedWidth = Math.min(width, imageWidth);
      const height = renderedWidth * imageHeight / imageWidth;
      items.push({ ...run, type: 'image', x: (width - renderedWidth) / 2, y: top, width: renderedWidth, height, size: baseSize });
      top += height + baseSize;
      continue;
    }
    const size = block.type === 'heading' ? baseSize + (block.depth === 2 ? 4 : 2) : baseSize;
    const lineHeight = Math.round(size * 1.4);
    let x = 0;
    let y = top + size;
    for (const source of block.runs) {
      const run = { ...source, bold: source.bold || block.type === 'heading' };
      ctx.font = runFont(run, size, fontFamily);
      for (const part of run.text.split(/(\n|[^\S\n]+|[^\s]+)/).filter(Boolean)) {
        if (part === '\n') { x = 0; y += lineHeight; continue; }
        const space = /^\s+$/.test(part);
        if (space && x === 0) continue;
        const measured = ctx.measureText(part).width;
        if (x && x + measured > width) { x = 0; y += lineHeight; if (space) continue; }
        if (measured <= width) {
          items.push({ ...run, text: part, x, y, width: measured, size, lineHeight, type: block.type });
          x += measured;
        } else {
          for (const character of part) {
            const characterWidth = ctx.measureText(character).width;
            if (x + characterWidth > width) { x = 0; y += lineHeight; }
            items.push({ ...run, text: character, x, y, width: characterWidth, size, lineHeight, type: block.type });
            x += characterWidth;
          }
        }
      }
    }
    top = y + Math.round(size * (block.type === 'list' ? 0.35 : 0.85));
  }
  return { items, height: top };
}
