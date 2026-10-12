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

export function landscapeTexture() {
  return canvasTexture(64, 256, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#192630');
    sky.addColorStop(0.43, '#34434e');
    sky.addColorStop(0.62, '#64717f');
    sky.addColorStop(1, '#84909b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
  });
}

export function windowLightsTexture(seed) {
  const random = seededRandom(seed);
  const texture = canvasTexture(512, 512, (ctx) => {
    // Pane coordinates follow the preserved Rotfront_Highrise1 atlas. Fill
    // individual glass panes so lintels, mullions and walls remain unlit.
    const columns = [6, 51, 97, 385, 436, 481, 527];
    const colors = ['#776d53', '#6c767c', '#794535'];
    for (let floor = 0; floor < 14; floor++) {
      for (const x of columns) {
        if (random() > 0.26) continue;
        ctx.fillStyle = colors[Math.floor(random() * colors.length)];
        for (let pane = 0; pane < 3; pane++) {
          if (random() < 0.35) continue;
          ctx.fillRect((x + 3 + pane * 8) / 2, (15 + floor * 74) / 2, 3, 11);
        }
      }
    }
  });
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}
