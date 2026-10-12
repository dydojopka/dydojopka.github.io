import * as THREE from 'three';
import { DESKTOP_Y } from './placements.js';

export function createRoomLighting(screenCenter, screenNormal, radioBounds) {
  const lighting = new THREE.Group();
  lighting.name = 'local-room-lighting';
  // A faint, finite source just inside the window reveals nearby silhouettes.
  // Keep it below the practical lights instead of filling the entire scene.
  const windowGlow = new THREE.PointLight(0x9aaebb, 2, 14, 2);
  windowGlow.name = 'window-light';
  windowGlow.position.set(-0.3, 4.1, -2.65);
  windowGlow.castShadow = true;
  windowGlow.shadow.mapSize.set(512, 512);
  windowGlow.shadow.bias = -0.0001;
  windowGlow.shadow.normalBias = 0.008;
  windowGlow.shadow.radius = 3;
  lighting.add(windowGlow);
  // Approximate the window's weak reflected light from the ceiling.
  const windowBounce = new THREE.PointLight(0x9aaebb, 0.8, 12, 2);
  windowBounce.name = 'window-bounce-light';
  windowBounce.position.set(-1, 5.8, 2.5);
  windowBounce.castShadow = true;
  windowBounce.shadow.mapSize.set(256, 256);
  windowBounce.shadow.normalBias = 0.008;
  windowBounce.shadow.radius = 3;
  lighting.add(windowBounce);
  // An off-screen room lamp softly reveals the furniture from behind the
  // usual desktop and portrait viewing positions, with local falloff.
  const roomLamp = new THREE.PointLight(0xffdfb1, 35, 24, 2);
  roomLamp.name = 'rear-room-lamp-light';
  roomLamp.position.set(-1.7, 6.2, 9.8);
  roomLamp.castShadow = true;
  roomLamp.shadow.mapSize.set(512, 512);
  roomLamp.shadow.camera.far = roomLamp.distance;
  roomLamp.shadow.bias = -0.0001;
  roomLamp.shadow.normalBias = 0.008;
  roomLamp.shadow.radius = 3;
  lighting.add(roomLamp);
  const amber = new THREE.SpotLight(0xffcb88, 22, 5, 1.15, 0.85, 2);
  amber.name = 'desk-lamp-light';
  amber.position.set(1.23, DESKTOP_Y + 0.9, 0.28);
  amber.target.position.set(1.65, DESKTOP_Y, 0.65);
  amber.castShadow = true;
  amber.shadow.mapSize.set(1024, 1024);
  amber.shadow.bias = -0.0002;
  amber.shadow.normalBias = 0.004;
  amber.shadow.radius = 2;
  lighting.add(amber, amber.target);

  const phosphor = new THREE.PointLight(0x88c394, 3, 4.5, 2);
  phosphor.name = 'monitor-light';
  phosphor.position.copy(screenCenter).addScaledVector(screenNormal, 0.5);
  phosphor.castShadow = true;
  phosphor.shadow.mapSize.set(512, 512);
  phosphor.shadow.bias = -0.0001;
  phosphor.shadow.normalBias = 0.008;
  phosphor.shadow.radius = 2;
  lighting.add(phosphor);
  // These panels already emit orange light in the preserved Unity material.
  // Small finite lights let that glow reach nearby surfaces in the room.
  const radioCenter = radioBounds.getCenter(new THREE.Vector3());
  const radioHeight = radioBounds.max.y - radioBounds.min.y;
  for (const [name, height, intensity] of [['upper', 0.78, 0.45], ['lower', 0.22, 0.35]]) {
    const panel = new THREE.PointLight(0xffba67, intensity, 2.2, 2);
    panel.name = `radio-${name}-panel-light`;
    panel.position.set(radioCenter.x, radioBounds.min.y + radioHeight * height, radioBounds.max.z + 0.22);
    panel.castShadow = true;
    panel.shadow.mapSize.set(256, 256);
    panel.shadow.bias = -0.0001;
    panel.shadow.normalBias = 0.004;
    panel.shadow.radius = 2;
    lighting.add(panel);
  }
  return lighting;
}
