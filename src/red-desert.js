import * as THREE from 'three';
import { seededRandom } from './textures.js';

const PILLAR_COLOR = 0x48272c;

const DESERT_FOG_UNIFORMS = {
  desertFogColor: { value: new THREE.Color(0.012, 0.00025, 0.0012) },
  desertFogWindowZ: { value: -5.25 },
  desertFogDensity: { value: 0.038 },
};
const DESERT_FOG_VERTEX = 'varying vec3 desertWorldPosition;';
const DESERT_FOG_FRAGMENT = `
  uniform vec3 desertFogColor;
  uniform float desertFogWindowZ;
  uniform float desertFogDensity;
  varying vec3 desertWorldPosition;
  vec3 desertAtmosphere(vec3 color) {
    float depth = max(0.0, desertFogWindowZ - desertWorldPosition.z - 3.0);
    float lowHaze = 1.0 - smoothstep(-1.0, 4.0, desertWorldPosition.y);
    float opticalDepth = depth * desertFogDensity * mix(0.8, 1.35, lowHaze);
    return mix(color, desertFogColor, 1.0 - exp(-opticalDepth));
  }
`;

function shadeDesertMaterial(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, DESERT_FOG_UNIFORMS);
    shader.vertexShader = `${DESERT_FOG_VERTEX}\n${shader.vertexShader}`.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\ndesertWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = `${DESERT_FOG_FRAGMENT}\n${shader.fragmentShader}`.replace(
      '#include <opaque_fragment>',
      'outgoingLight = desertAtmosphere(outgoingLight);\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => 'red-desert-atmosphere';
}

function groundObject(object, ground) {
  ground.updateWorldMatrix(true, true);
  const ray = new THREE.Raycaster(new THREE.Vector3(object.position.x, 20, object.position.z), new THREE.Vector3(0, -1, 0));
  const [hit] = ray.intersectObject(ground, true);
  if (hit) object.position.y = hit.point.y - 0.03;
  return object;
}

export function frameRedDesert(outside, aspect) {
  // The portrait printer hides the rightmost part of the window. Set the wreck
  // farther back along an open sightline, keeping its nose in the real terrain.
  const wreck = outside.getObjectByName('shuttle');
  wreck.position.set(...(aspect < 0.8 ? [-4, 0, -44] : [4.4, 0, -30]));
  groundObject(wreck, outside.getObjectByName('ground'));
  wreck.position.y -= 0.07;
}

// The view is staged at several depths, beyond the existing window and sill.
// Models and maps remain the authored Unity assets; only their lighting changes.
export function createRedDesert(kit) {
  const outside = new THREE.Group();
  outside.name = 'red-desert';
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(160, 90), new THREE.ShaderMaterial({
    depthWrite: false, toneMapped: false,
    uniforms: { ...DESERT_FOG_UNIFORMS },
    vertexShader: `
      ${DESERT_FOG_VERTEX}
      varying vec2 skyUv;
      void main() {
        skyUv = uv;
        desertWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      ${DESERT_FOG_FRAGMENT}
      varying vec2 skyUv;
      void main() {
        float height = smoothstep(0.3, 0.85, skyUv.y);
        float clouds = sin(skyUv.x * 49.0 + sin(skyUv.y * 28.0) * 2.0) * 0.0015;
        vec3 color = mix(vec3(0.045, 0.0008, 0.002), vec3(0.006, 0.0001, 0.0005), height);
        gl_FragColor = vec4(desertAtmosphere(color + vec3(clouds, clouds * 0.05, clouds * 0.1)), 1.0);
      }
    `,
  }));
  sky.name = 'desert-red-sky';
  sky.position.set(0, 12, -42);
  outside.add(sky);

  function place(name, width, position, yaw, tint) {
    const object = kit.getObjectByName(name).clone(true);
    const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    object.scale.setScalar(width / size.x);
    object.position.set(...position);
    object.rotation.y = yaw;
    object.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const source = mesh.material;
      mesh.material = new THREE.MeshBasicMaterial({
        map: source.map, color: tint, alphaTest: source.alphaTest,
        side: THREE.DoubleSide, fog: false,
      });
      shadeDesertMaterial(mesh.material);
      mesh.castShadow = mesh.receiveShadow = false;
    });
    outside.add(object);
    return object;
  }

  const ground = place('ground', 150, [0, -1.2, -30], 0, new THREE.Color(1.6, 0.06, 0.08));
  // Compress the original mountain terrain into low dunes at window scale.
  ground.scale.y *= 0.05;
  ground.traverse((mesh) => {
    if (mesh.isMesh) mesh.material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 0, -1), -5.25)];
  });
  const gate = groundObject(place('gate', 2.1, [1.2, 0, -18], Math.PI, 0x4a2a2b), ground);
  // Only the upper steps emerge from the sand; the threshold rests on them.
  gate.position.y += 0.24;
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(3.94, 8.94), new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...DESERT_FOG_UNIFORMS },
    vertexShader: `
      ${DESERT_FOG_VERTEX}
      varying vec2 portalUv;
      void main() {
        portalUv = uv;
        desertWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      ${DESERT_FOG_FRAGMENT}
      varying vec2 portalUv;
      void main() {
        float edge = pow(abs(portalUv.x - 0.5) * 2.0, 5.0);
        float glow = 0.25 + edge * 0.55 + portalUv.y * 0.15;
        gl_FragColor = vec4(desertAtmosphere(vec3(glow, 0.002, 0.009)), 1.0);
      }
    `,
  }));
  portal.name = 'red-gate-opening';
  portal.position.set(0.035, 4.47, 0);
  gate.add(portal);
  const approach = place('gate-base', 1, gate.position.toArray(), Math.PI, 0x4a2a2b);
  approach.scale.copy(gate.scale);
  // The crash-site model is shared with PEN_Wreck. Its snow-free material is
  // retained while the tilted nose sinks into sand instead of hovering above it.
  const wreck = groundObject(place('shuttle', 5.1, [4.4, 0, -30], -0.08, 0xb9aaa0), ground);
  wreck.rotation.z = 0.025;
  wreck.position.y -= 0.07;
  // These near/far silhouettes occupy the narrow opening left of the monitor.
  for (const [width, x, z, yaw] of [
    [0.6, -10.8, -19, 0.35],
    [0.75, -14.5, -26, -0.2],
    [0.8, -19, -33, 0.55],
  ]) {
    const pillar = groundObject(place('pillar', width, [x, 0, z], yaw, PILLAR_COLOR), ground);
    pillar.name = 'left-window-pillar';
  }
  const random = seededRandom(39486);
  for (let i = 0; i < 64; i++) {
    const x = -18 + random() * 36;
    const z = -12 - random() * 42;
    // Leave the two landmarks and their approach clear of nearby monoliths.
    if (Math.hypot(x - gate.position.x, z - gate.position.z) < 4.5
      || Math.hypot(x - wreck.position.x, z - wreck.position.z) < 3.2) continue;
    const width = 0.15 + random() * 0.4;
    groundObject(place('pillar', width, [x, 0, z], random() * Math.PI * 2,
      new THREE.Color(PILLAR_COLOR).multiplyScalar(0.95 + random() * 0.1)), ground);
  }
  return outside;
}
