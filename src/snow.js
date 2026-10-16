import * as THREE from 'three';
import { seededRandom } from './textures.js';
import { wrap } from './layout.js';

export function createSnow() {
  const baseCount = 1300;
  const baseStreakCount = 360;
  const count = 6800;
  const streakCount = 1400;
  const random = seededRandom(73);
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = -4.2 + random() * 8.4;
    positions[i * 3 + 1] = 1.4 + random() * 5.2;
    positions[i * 3 + 2] = -3.2 - random() * 1.8;
    speeds[i] = 0.9 + random() * 1.4;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, baseCount);
  const material = new THREE.PointsMaterial({ color: 0xb2cadf, size: 1.1, transparent: true, opacity: 0.48, depthWrite: false, sizeAttenuation: false });
  const flakes = new THREE.Points(geometry, material);
  flakes.name = 'distant-flakes';
  const streaks = new Float32Array(streakCount * 6);
  const streakSpeeds = new Float32Array(streakCount);
  for (let i = 0; i < streakCount; i++) {
    streaks[i * 6] = -4.2 + random() * 8.4;
    streaks[i * 6 + 1] = 1.4 + random() * 5.2;
    streaks[i * 6 + 2] = -3.15 - random() * 1.3;
    streakSpeeds[i] = 1.7 + random() * 1.8;
  }
  const streakGeometry = new THREE.BufferGeometry();
  streakGeometry.setAttribute('position', new THREE.BufferAttribute(streaks, 3));
  streakGeometry.setDrawRange(0, baseStreakCount * 2);
  const lines = new THREE.LineSegments(streakGeometry, new THREE.LineBasicMaterial({ color: 0xb6cede, transparent: true, opacity: 0.4, depthWrite: false }));
  lines.name = 'wind-swept-streaks';
  // Moving particles stay behind the imported wall; depth testing clips them
  // to its window opening. Disable culling against their initial positions.
  flakes.frustumCulled = lines.frustumCulled = false;
  const mesh = new THREE.Group();
  mesh.name = 'blizzard-outside';
  mesh.add(flakes, lines);
  let time = 0;
  let strength = 0;
  let visibleCount = baseCount;
  let visibleStreaks = baseStreakCount;
  function setGust(value) {
    strength = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    visibleCount = Math.round(baseCount + (count - baseCount) * strength);
    visibleStreaks = Math.round(baseStreakCount + (streakCount - baseStreakCount) * strength);
    geometry.setDrawRange(0, visibleCount);
    streakGeometry.setDrawRange(0, visibleStreaks * 2);
    material.opacity = 0.48 + strength * 0.3;
    material.size = 1.1 + strength * 0.8;
    lines.material.opacity = 0.4 + strength * 0.35;
  }
  function update(delta) {
    time += delta;
    const gust = (1 + Math.sin(time * 0.7) * 0.28 + Math.sin(time * 1.7) * 0.12) * (1 + strength * 3.8);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = wrap(positions[i * 3] + delta * speeds[i] * 2.9 * gust, -4.2, 4.2);
      positions[i * 3 + 1] = wrap(positions[i * 3 + 1] - delta * speeds[i] * (0.85 + strength * 0.3), 1.4, 6.6);
    }
    for (let i = 0; i < streakCount; i++) {
      const offset = i * 6;
      const speed = streakSpeeds[i];
      streaks[offset] = wrap(streaks[offset] + delta * speed * 3.1 * gust, -4.2, 4.2);
      streaks[offset + 1] = wrap(streaks[offset + 1] - delta * speed, 1.4, 6.6);
      streaks[offset + 3] = streaks[offset] - speed * 0.045 * gust * (1 + strength * 0.5);
      streaks[offset + 4] = streaks[offset + 1] + speed * (0.015 + strength * 0.015);
      streaks[offset + 5] = streaks[offset + 2];
    }
    geometry.attributes.position.needsUpdate = true;
    streakGeometry.attributes.position.needsUpdate = true;
  }
  update(0);
  return {
    mesh,
    update,
    setGust,
  };
}
