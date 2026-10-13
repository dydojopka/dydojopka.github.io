import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, CanvasTexture, SRGBColorSpace } from 'three';

export const PRINT_BUTTON = { left: 0.12, right: 0.88, top: 0.67, bottom: 0.92 };
export const PRINTER_STATUS = {
  idle: 'Распечатать визитку?',
  feeding: 'Печать визитки…',
  printing: 'Печать визитки…',
  ejecting: 'Печать визитки…',
  ready: 'Визитка готова. Нажмите на лист в лотке.',
  error: 'Не удалось подготовить визитку',
};

export function createPrinterDisplay() {
  const display = new Group();
  display.name = 'printer-display';
  display.position.set(0.465, 0.785, 0.36);
  display.rotation.x = -0.85;
  const casing = new Mesh(new BoxGeometry(0.90, 0.60, 0.055), new MeshStandardMaterial({ color: 0x202d25, roughness: 0.85 }));
  casing.name = 'printer-display-bezel';
  casing.castShadow = casing.receiveShadow = true;
  const screen = new Mesh(new PlaneGeometry(0.83, 0.519), new MeshBasicMaterial({ color: 0x73df92, toneMapped: false }));
  screen.name = 'printer-display-screen';
  screen.position.z = 0.029;
  display.add(casing, screen);
  return display;
}

export function printButtonHit(uv) {
  if (!uv) return false;
  const y = 1 - uv.y;
  return uv.x >= PRINT_BUTTON.left && uv.x <= PRINT_BUTTON.right && y >= PRINT_BUTTON.top && y <= PRINT_BUTTON.bottom;
}

export function createPrinterDisplayPainter(screen, createCanvas = () => document.createElement('canvas')) {
  const canvas = createCanvas();
  canvas.width = 720; canvas.height = 450;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Printer display canvas is unavailable');
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  screen.material.color.setHex(0xffffff);
  screen.material.map = texture;
  screen.material.needsUpdate = true;
  let previous;
  function paint(state) {
    const visualState = ['feeding', 'printing', 'ejecting'].includes(state) ? 'printing' : state;
    if (previous === visualState) return;
    previous = visualState;
    context.fillStyle = '#030b07'; context.fillRect(0, 0, 720, 450);
    context.strokeStyle = '#245438'; context.lineWidth = 3; context.strokeRect(14, 14, 692, 422);
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillStyle = '#a3ffb7'; context.font = '80px Consolas, monospace';
    const heading = visualState === 'idle' ? ['Распечатать', 'визитку?']
      : visualState === 'ready' ? ['Визитка', 'готова']
        : visualState === 'error' ? ['Ошибка', 'печати'] : ['Печать', 'визитки…'];
    heading.forEach((line, index) => context.fillText(line, 360, 78 + index * 82));
    context.fillStyle = '#73df92'; context.font = `${visualState === 'idle' ? 52 : 48}px Consolas, monospace`;
    const caption = visualState === 'idle' ? ['Версия без 3D']
      : visualState === 'ready' ? ['Нажмите на лист', 'в лотке']
        : visualState === 'error' ? ['Повторите попытку'] : ['Подождите…'];
    caption.forEach((line, index) => context.fillText(line, 360, (visualState === 'idle' || visualState === 'error' ? 252 : 270) + index * 56));
    if (state === 'idle' || state === 'error') {
      context.fillStyle = '#06110b'; context.fillRect(86, 302, 548, 112);
      context.strokeStyle = '#73df92'; context.strokeRect(86, 302, 548, 112);
      context.fillStyle = '#a3ffb7'; context.font = '64px Consolas, monospace';
      context.fillText(state === 'error' ? 'Повторить' : 'Печатать', 360, 358);
    }
    texture.needsUpdate = true;
  }
  paint('idle');
  return { paint, dispose() { screen.material.map = null; texture.dispose(); } };
}
