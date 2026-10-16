import { Mesh, PlaneGeometry, ShaderMaterial } from 'three';

const COVER_TIME = 1.8;
const REVEAL_TIME = 2.8;
const END_TIME = 4.8;

export function createWindowTransition({ winter, desert, snow, reducedMotion, onReveal = () => {}, onRevealProgress = () => {}, onComplete = () => {}, onChange = () => {}, onGust = () => {} }) {
  const material = new ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { time: { value: 0 }, cover: { value: 0 }, clearing: { value: 0 } },
    vertexShader: `
      varying vec2 windowUv;
      void main() {
        windowUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 windowUv;
      uniform float time;
      uniform float cover;
      uniform float clearing;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
          mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), f.x), f.y);
      }
      void main() {
        vec2 p = (windowUv - 0.5) * vec2(30.0, 20.0);
        // The same left-to-right wind as the particles carries elongated
        // snow clouds across the opening, then sweeps them away to the right.
        vec2 wind = vec2(p.x - time * 13.0, p.y + p.x * 0.08);
        float cloud = noise(wind * vec2(0.18, 1.3)) * 0.65
          + noise(wind * vec2(0.4, 4.0)) * 0.35;
        float grain = hash(floor(windowUv * vec2(1200.0, 800.0)) + floor(time * 30.0));
        float progress = mix(cover, 1.0 - cover, clearing);
        float front = mix(-6.5, 6.5, progress);
        float passed = smoothstep(front - 1.0, front + 1.0, p.x + (cloud - 0.5) * 1.5);
        float swept = mix(1.0 - passed, passed, clearing);
        float alpha = cover * (0.7 + cloud * 0.3) * swept;
        // Complete whiteout is opaque at every pixel, including between flakes.
        alpha = mix(alpha, 1.0, smoothstep(0.78, 1.0, cover));
        vec3 color = mix(vec3(0.38, 0.46, 0.52), vec3(0.84, 0.9, 0.94), cloud);
        gl_FragColor = vec4(color + (grain - 0.5) * 0.035, alpha);
      }
    `,
  });
  const veil = new Mesh(new PlaneGeometry(30, 20), material);
  veil.name = 'window-whiteout';
  veil.position.set(0, 4, -3.06);
  veil.renderOrder = 20;
  veil.visible = false;
  desert.visible = false;
  let elapsed = 0;
  let started = false;
  let revealed = false;
  let completed = false;
  let moving = false;
  let disposed = false;
  let gust = 0;
  let revealProgress = 0;

  function setGust(value) {
    if (gust === value) return;
    gust = value;
    snow.setGust(value);
    onGust(value);
  }

  function setRevealProgress(value) {
    if (revealProgress === value) return;
    revealProgress = value;
    onRevealProgress(value);
  }

  function reveal() {
    if (revealed) return;
    revealed = true;
    winter.visible = snow.mesh.visible = false;
    desert.visible = true;
    setGust(0);
    onReveal();
  }
  function finish() {
    if (!started || disposed || completed) return;
    reveal();
    moving = false;
    setGust(0);
    veil.visible = false;
    material.uniforms.cover.value = 0;
    setRevealProgress(1);
    completed = true;
    onComplete();
    onChange();
  }
  return {
    veil,
    get moving() { return moving; },
    trigger() {
      if (started || disposed) return false;
      started = true;
      if (reducedMotion.matches) { finish(); return true; }
      moving = veil.visible = true;
      onChange();
      return true;
    },
    update(delta) {
      if (!moving || disposed) return;
      if (reducedMotion.matches) { finish(); return; }
      elapsed += Math.max(0, delta);
      material.uniforms.time.value = elapsed;
      material.uniforms.clearing.value = elapsed > REVEAL_TIME ? 1 : 0;
      if (!revealed) {
        const progress = Math.min(1, elapsed / COVER_TIME);
        setGust(progress * progress * (3 - 2 * progress));
      }
      if (!revealed && elapsed >= (COVER_TIME + REVEAL_TIME) / 2) {
        material.uniforms.cover.value = 1;
        reveal();
      }
      const fade = elapsed < COVER_TIME ? elapsed / COVER_TIME
        : elapsed <= REVEAL_TIME ? 1 : 1 - (elapsed - REVEAL_TIME) / (END_TIME - REVEAL_TIME);
      material.uniforms.cover.value = Math.min(1, Math.max(0, fade));
      if (elapsed > REVEAL_TIME) {
        const progress = 1 - material.uniforms.cover.value;
        setRevealProgress(progress * progress * (3 - 2 * progress));
      }
      if (elapsed >= END_TIME) finish();
    },
    finish,
    async warmup(compile) {
      const visibility = [desert.visible, veil.visible];
      try {
        desert.visible = veil.visible = true;
        await compile();
      } finally {
        desert.visible = revealed || visibility[0];
        veil.visible = !disposed && moving && visibility[1];
      }
    },
    dispose() { disposed = true; moving = false; veil.visible = false; setGust(0); },
  };
}
