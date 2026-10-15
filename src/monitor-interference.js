const DURATION = 0.2;

export function createMonitorInterference(screen) {
  const material = screen.material;
  const compile = material.onBeforeCompile, cacheKey = material.customProgramCacheKey;
  const intensity = { value: 0 }, time = { value: 0 };
  let elapsed = DURATION, disposed = false;
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.uniforms.bookInterference = intensity;
    shader.uniforms.bookInterferenceTime = time;
    shader.fragmentShader = `uniform float bookInterference;
uniform float bookInterferenceTime;
float bookNoise(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec2 bookUv = vMapUv;
  float bookBand = floor(bookUv.y * 34.0);
  float bookShift = (bookNoise(vec2(bookBand, bookInterferenceTime)) - 0.5) * 0.065 * bookInterference;
  bookUv.x = clamp(bookUv.x + bookShift, 0.0, 1.0);
  vec4 bookSample = texture2D(map, bookUv);
  float bookGrain = bookNoise(floor(bookUv * vec2(720.0, 540.0)) + bookInterferenceTime);
  float bookStripe = step(0.68, bookNoise(vec2(bookBand, bookInterferenceTime)));
  bookSample.rgb = mix(bookSample.rgb, vec3(bookGrain * 0.32), bookInterference * 0.58);
  bookSample.rgb += vec3(0.12, 0.2, 0.14) * bookStripe * bookInterference;
  diffuseColor *= bookSample;
#endif`);
  };
  material.customProgramCacheKey = () => `${cacheKey.call(material)}:book-interference-v1`;
  material.needsUpdate = true;
  function clear() { elapsed = DURATION; intensity.value = 0; }
  return {
    get active() { return !disposed && elapsed < DURATION; },
    trigger() { if (!disposed) { elapsed = 0; intensity.value = 1; time.value = 0; } },
    update(delta) {
      if (disposed || elapsed >= DURATION) return;
      elapsed = Math.min(DURATION, elapsed + delta);
      time.value = Math.floor(elapsed * 60);
      intensity.value = elapsed === DURATION ? 0 : 1 - elapsed / DURATION * 0.35;
    },
    clear,
    dispose() {
      if (disposed) return;
      disposed = true; clear();
      material.onBeforeCompile = compile; material.customProgramCacheKey = cacheKey; material.needsUpdate = true;
    },
  };
}
