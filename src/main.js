import * as THREE from 'three';
import { createRoom } from './scene.js';
import { cameraFrame, renderSize } from './layout.js';
import './style.css';

const host = document.querySelector('#room');
const fallback = document.querySelector('#fallback');

start().catch((error) => {
  host.hidden = true;
  fallback.hidden = false;
  console.error('The room could not be initialized.', error);
});

async function start() {
  // The shipped style is subtly pixelated. This development-only option lets us
  // compare the same composition without adding controls to the experience.
  const pixelated = !(import.meta.env.DEV && new URLSearchParams(location.search).has('smooth'));
  const renderer = new THREE.WebGLRenderer({ antialias: !pixelated, powerPreference: 'low-power' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', host.getAttribute('aria-label'));
  if (!pixelated) renderer.domElement.style.imageRendering = 'auto';
  host.append(renderer.domElement);

  const { scene, snow } = await createRoom();
  const camera = new THREE.OrthographicCamera(-5, 5, 3, -3, 0.1, 70);
  camera.position.set(2.7, 5.2, 12.8);
  camera.lookAt(0, 2.88, -0.15);

  const target = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const postScene = new THREE.Scene();
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const postMaterial = new THREE.ShaderMaterial({
    uniforms: {
      image: { value: target.texture }, resolution: { value: new THREE.Vector2(1, 1) },
      frameHeight: { value: 6.35 }, backdrop: { value: new THREE.Color(0x080e12) },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D image;
      uniform vec2 resolution;
      uniform float frameHeight;
      uniform vec3 backdrop;
      varying vec2 vUv;
      void main() {
        vec3 color = texture2D(image, vUv).rgb;
        vec2 centered = (vUv - 0.5) * vec2(1.0, 0.85);
        float vignette = 1.0 - smoothstep(0.16, 0.72, length(centered)) * 0.46;
        // Fixed grain, not animated noise: only the snow moves in this scene.
        float grain = fract(sin(dot(floor(vUv * resolution), vec2(12.9898, 78.233))) * 43758.5453);
        // Fade the cropped architecture into the room's darkness on portrait
        // displays, where the camera sees beyond the original ceiling/floor.
        float portraitFade = smoothstep(3.2, 4.75, abs(vUv.y - 0.5) * frameHeight);
        color = mix(color * vignette, backdrop * 0.35, portraitFade);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb += (grain - 0.5) * 0.009;
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial));

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let lastTime = 0;
  let lastDraw = 0;
  let contextLost = false;
  function draw() {
    if (contextLost) return;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
  }
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    Object.assign(camera, cameraFrame(width / height));
    postMaterial.uniforms.frameHeight.value = camera.top - camera.bottom;
    camera.updateProjectionMatrix();
    const size = renderSize(width, height, pixelated);
    renderer.setSize(size.width, size.height, false);
    target.setSize(size.width, size.height);
    postMaterial.uniforms.resolution.value.set(size.width, size.height);
    draw();
  }
  function animate(time) {
    frame = requestAnimationFrame(animate);
    // 30 fps is sufficient for quiet snowfall; don't redraw the room at 120 Hz.
    if (time - lastDraw < 1000 / 30) return;
    const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0;
    lastTime = lastDraw = time;
    snow.update(delta);
    draw();
  }
  function syncAnimation() {
    cancelAnimationFrame(frame);
    lastTime = lastDraw = 0;
    if (contextLost || document.hidden) return;
    draw();
    if (!reducedMotion.matches) frame = requestAnimationFrame(animate);
  }
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    cancelAnimationFrame(frame);
    fallback.hidden = false;
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    fallback.hidden = true;
    renderer.shadowMap.needsUpdate = true;
    resize();
    syncAnimation();
  });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', syncAnimation);
  reducedMotion.addEventListener('change', syncAnimation);
  renderer.shadowMap.needsUpdate = true;
  resize();
  syncAnimation();
}
