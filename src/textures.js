import * as THREE from 'three';

export function seededRandom(seed = 41) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function canvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function surfaceTexture() {
  const random = seededRandom();
  const texture = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#b4b4b4';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 6500; i++) {
      const value = Math.floor(100 + random() * 90);
      ctx.fillStyle = `rgba(${value},${value},${value},0.24)`;
      ctx.fillRect(random() * w, random() * h, 1, 1);
    }
    for (let i = 0; i < 35; i++) {
      ctx.fillStyle = 'rgba(32,40,36,0.13)';
      ctx.fillRect(random() * w, random() * h, random() * 18, 1);
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

export function screenTexture() {
  return canvasTexture(256, 192, (ctx, w, h) => {
    const glow = ctx.createRadialGradient(126, 85, 15, 128, 96, 170);
    glow.addColorStop(0, '#46684e');
    glow.addColorStop(0.6, '#2e4936');
    glow.addColorStop(1, '#15291e');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(5,18,10,0.22)';
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    const reflection = ctx.createLinearGradient(0, 0, 80, h);
    reflection.addColorStop(0, 'rgba(194,222,198,0.16)');
    reflection.addColorStop(0.45, 'rgba(194,222,198,0)');
    ctx.fillStyle = reflection;
    ctx.fillRect(10, 8, 236, 176);
  });
}

export function landscapeTexture() {
  const random = seededRandom(92);
  return canvasTexture(512, 512, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0a1520');
    sky.addColorStop(0.5, '#1c2b36');
    sky.addColorStop(1, '#344550');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // Distant, snow-covered industrial blocks behind the falling particles.
    ctx.filter = 'blur(1.8px)';
    for (let layer = 0; layer < 3; layer++) {
      const ground = 330 + layer * 50;
      for (let x = -30; x < w; x += 25 + random() * 70) {
        const height = 20 + random() * 75;
        const width = 18 + random() * 70;
        ctx.fillStyle = ['#25333c', '#202d37', '#192631'][layer];
        ctx.fillRect(x, ground - height, width, height + 100);
        ctx.fillStyle = 'rgba(161,178,184,0.12)';
        ctx.fillRect(x - 1, ground - height, width + 2, 3);
        if (layer === 1) {
          ctx.fillStyle = '#192c39';
          for (let y = ground - height + 12; y < ground; y += 12) {
            for (let wx = x + 5; wx < x + width - 5; wx += 10) ctx.fillRect(wx, y, 3, 4);
          }
        }
      }
    }
    ctx.filter = 'none';
    const haze = ctx.createLinearGradient(0, 110, 0, h);
    haze.addColorStop(0, 'rgba(176,187,190,0.015)');
    haze.addColorStop(0.5, 'rgba(176,187,190,0.12)');
    haze.addColorStop(1, 'rgba(190,197,198,0.26)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, w, h);
    // Broad, pale fog banks soften the skyline without lighting the night sky.
    for (const [x, y, radius, opacity] of [[100, 325, 220, 0.11], [390, 390, 260, 0.15]]) {
      const bank = ctx.createRadialGradient(x, y, 0, x, y, radius);
      bank.addColorStop(0, `rgba(198,205,205,${opacity})`);
      bank.addColorStop(1, 'rgba(198,205,205,0)');
      ctx.fillStyle = bank;
      ctx.fillRect(0, 0, w, h);
    }
  });
}

