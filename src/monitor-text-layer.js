import { Triangle, Vector3 } from 'three';
import { runFont } from './markdown-layout.js';

function uvPoint(screen, x, y) {
  const target = new Vector3(x, y, 0);
  const { position, uv } = screen.geometry.attributes;
  const indices = screen.geometry.index.array;
  for (let offset = 0; offset < indices.length; offset += 3) {
    const triangle = Array.from(indices.slice(offset, offset + 3));
    const corners = triangle.map((index) => new Vector3(uv.getX(index), uv.getY(index), 0));
    const weights = Triangle.getBarycoord(target, ...corners, new Vector3());
    if (weights && Math.min(weights.x, weights.y, weights.z) >= -0.00001) {
      const point = new Vector3();
      triangle.forEach((index, corner) => point.addScaledVector(new Vector3().fromBufferAttribute(position, index), weights.getComponent(corner)));
      return point.applyMatrix4(screen.matrixWorld);
    }
  }
}

export function projectionMatrix(source, destination) {
  const rows = source.flatMap(([x, y], index) => {
    const [u, v] = destination[index];
    return [[x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]];
  });
  for (let column = 0; column < 8; column++) {
    let pivot = column;
    for (let row = column + 1; row < 8; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    if (Math.abs(divisor) < 1e-10) return undefined;
    rows[column] = rows[column].map((value) => value / divisor);
    for (let row = 0; row < 8; row++) {
      if (row === column) continue;
      const multiplier = rows[row][column];
      rows[row] = rows[row].map((value, index) => value - multiplier * rows[column][index]);
    }
  }
  const [a, b, c, d, e, f, g, h] = rows.map((row) => row[8]);
  return [a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, c, f, 0, 1];
}

export function createMonitorTextLayer(host, onLink) {
  const events = new AbortController();
  const options = { signal: events.signal };
  const layer = document.createElement('div');
  layer.className = 'monitor-text-layer'; layer.hidden = true;
  layer.setAttribute('aria-hidden', 'true'); host.append(layer);
  let stamp;
  let anchorScreen;
  let anchors;
  let selecting = false;
  layer.addEventListener('pointerdown', (event) => { selecting = event.pointerType === 'mouse'; }, options);
  document.addEventListener('pointerup', () => { selecting = false; }, options);
  document.addEventListener('pointercancel', () => { selecting = false; }, options);
  layer.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link) return;
    event.preventDefault();
    if (!window.getSelection()?.isCollapsed) return;
    onLink(link.getAttribute('href'));
  }, options);
  return {
    get selecting() { return selecting; },
    setContent(items, key) {
      if (stamp === key) return;
      stamp = key;
      layer.replaceChildren(...items.map((item) => {
        const span = document.createElement(item.href ? 'a' : 'span');
        if (item.href) span.setAttribute('href', item.href);
        span.textContent = item.text; span.tabIndex = -1;
        span.style.cssText = `left:${item.x}px;top:${item.y - item.size * 0.82}px;font:${runFont(item, item.size)};line-height:1;`;
        return span;
      }));
    },
    update(screen, camera, enabled) {
      layer.hidden = !enabled;
      if (!enabled || !screen || !camera) return;
      screen.updateWorldMatrix(true, false); camera.updateMatrixWorld();
      const source = [[144, 108], [1296, 108], [1296, 972], [144, 972]];
      if (anchorScreen !== screen) {
        anchorScreen = screen;
        anchors = source.map(([x, y]) => uvPoint(screen, x / 1440, 1 - y / 1080));
      }
      const destination = anchors.map((anchor) => {
        const point = anchor?.clone().project(camera);
        return point ? [(point.x + 1) * host.clientWidth / 2, (1 - point.y) * host.clientHeight / 2] : undefined;
      });
      const matrix = destination.every(Boolean) ? projectionMatrix(source, destination) : undefined;
      if (matrix) layer.style.transform = `matrix3d(${matrix.join(',')})`;
      else layer.hidden = true;
    },
    dispose() { events.abort(); layer.remove(); },
  };
}
