import * as THREE from 'three';
import { landscapeTexture, windowLightsTexture } from './textures.js';

function distantMaterial(source, color, haze, lights) {
  const material = new THREE.MeshBasicMaterial({
    map: source.map, color, alphaTest: source.alphaTest,
    side: THREE.DoubleSide, fog: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.hazeColor = { value: new THREE.Color(0x64717f) };
    shader.uniforms.highHazeColor = { value: new THREE.Color(0x34434e) };
    shader.uniforms.hazeAmount = { value: haze };
    if (lights) shader.uniforms.windowLights = { value: lights };
    shader.vertexShader = `varying float exteriorHeight;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nexteriorHeight = (modelMatrix * vec4(position, 1.0)).y;');
    shader.fragmentShader = `varying float exteriorHeight;\nuniform vec3 hazeColor;\nuniform vec3 highHazeColor;\nuniform float hazeAmount;\n${lights ? 'uniform sampler2D windowLights;\n' : ''}${shader.fragmentShader}`.replace(
      '#include <opaque_fragment>',
      `${lights ? 'outgoingLight += texture2D(windowLights, vMapUv).rgb;\n' : ''}float mist = mix(0.9, hazeAmount, smoothstep(-0.8, 7.0, exteriorHeight));\nvec3 air = mix(hazeColor, highHazeColor, smoothstep(0.0, 9.0, exteriorHeight));\noutgoingLight = mix(outgoingLight, air, mist);\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => lights ? 'exterior-windows' : 'exterior-haze';
  return material;
}

export function createExterior(kit) {
  const outside = new THREE.Group();
  outside.name = 'school-skyline';
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(100, 40),
    new THREE.MeshBasicMaterial({ map: landscapeTexture(), fog: false }));
  sky.position.set(0, 3, -30);
  outside.add(sky);

  function place(name, width, position, yaw, color, haze, seed) {
    const object = kit.getObjectByName(name).clone(true);
    const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    object.scale.setScalar(width / size.x);
    object.position.set(...position);
    object.rotation.y = yaw;
    const lights = seed === undefined ? undefined : windowLightsTexture(seed);
    object.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.material = distantMaterial(mesh.material, color, haze, lights);
      mesh.castShadow = mesh.receiveShadow = false;
    });
    outside.add(object);
    return object;
  }

  const ground = place('ground', 100, [0, -1.2, -38], 0, 0x3b4c58, 0.62);
  ground.traverse((mesh) => {
    if (!mesh.isMesh) return;
    // Keep the terrain behind the window even though its authored mesh is
    // broad enough to cover the complete city and continue under the room.
    mesh.material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 0, -1), -5.25)];
  });
  ground.updateWorldMatrix(true, true);
  const ray = new THREE.Raycaster();
  function restOnGround(object) {
    const bounds = new THREE.Box3().setFromObject(object);
    const heights = [];
    for (const x of [bounds.min.x, (bounds.min.x + bounds.max.x) / 2, bounds.max.x]) {
      for (const z of [bounds.min.z, (bounds.min.z + bounds.max.z) / 2, bounds.max.z]) {
        ray.set(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
        const [hit] = ray.intersectObject(ground);
        if (hit) heights.push(hit.point.y);
      }
    }
    if (!heights.length) throw new Error(`Exterior model has no ground beneath it: ${object.name}`);
    object.position.y += Math.min(...heights) - bounds.min.y - 0.03;
  }

  // Original RES_School facades and dishes, composed at several depths. The
  // lower floors dissolve into the same blue-grey haze as the reference.
  const buildings = [
    place('highrise', 17, [-1, 0, -17], Math.PI, 0x667785, 0.43, 17),
    place('highrise', 17, [11, 0, -18.5], Math.PI - 0.1, 0x607584, 0.49, 23),
    place('highrise', 19, [-12, 0, -19], Math.PI + 0.15, 0x536776, 0.46, 31),
  ];
  const dishes = [
    place('satellite-dish', 6.3, [-11, 0, -27], 0.55, 0x17232b, 0.42),
    place('satellite-dish', 4.1, [-4, 0, -27], 0.1, 0x17232b, 0.5),
    place('satellite-dish', 4.1, [1, 0, -28], 0.4, 0x17232b, 0.46),
    place('satellite-dish', 6.2, [4.5, 0, -28], -0.8, 0x17232b, 0.44),
  ];
  for (const object of [...buildings, ...dishes]) restOnGround(object);
  return outside;
}
