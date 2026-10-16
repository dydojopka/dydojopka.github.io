import * as THREE from 'three';

export function createPostProcessing(renderer) {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      image: { value: target.texture },
      resolution: { value: new THREE.Vector2(1, 1) },
      frameHeight: { value: 6.35 },
      backdrop: { value: new THREE.Color(0x080e12) },
      deathTime: { value: 0 },
      deathStrength: { value: 0 },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D image;
      uniform vec2 resolution;
      uniform float frameHeight;
      uniform vec3 backdrop;
      uniform float deathTime;
      uniform float deathStrength;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 uv = vUv;
        float damage = deathStrength;
        float clock = floor(deathTime * 14.0);
        float row = floor(vUv.y * 72.0);
        float block = hash(vec2(row, clock));
        float burst = step(0.64, hash(vec2(clock, 8.0)));
        float ending = smoothstep(5.3, 6.0, deathTime);
        float tear = step(0.82 - ending * 0.35, block) * (0.35 + burst * 0.65);
        if (damage > 0.0) uv.x = fract(uv.x + (hash(vec2(row, clock + 3.0)) - 0.5) * tear * 0.5);
        vec3 color = texture2D(image, uv).rgb;
        if (damage > 0.0) {
          float split = (0.0015 + tear * 0.018) * (0.5 + burst);
          color.r = texture2D(image, vec2(fract(uv.x + split), uv.y)).r;
          color.b = texture2D(image, vec2(fract(uv.x - split), uv.y)).b;
          float dropout = step(0.87 - ending * 0.4, hash(vec2(floor(vUv.x * 12.0) + row, clock)));
          color *= 1.0 - dropout * (0.8 + ending * 0.2);
          color *= 0.73;
          float edge = smoothstep(0.18, 0.65, length((vUv - 0.5) * vec2(1.0, 0.85)));
          color += vec3(0.25, 0.008, 0.003) * edge * (0.55 + 0.45 * sin(deathTime * 4.0));
          color += (hash(floor(vUv * resolution) + clock) - 0.5) * (0.018 + tear * 0.08);
          color *= 1.0 - step(0.5, fract(vUv.y * resolution.y * 0.5)) * 0.12;
        }
        vec2 centered = (vUv - 0.5) * vec2(1.0, 0.85);
        float vignette = 1.0 - smoothstep(0.16, 0.72, length(centered)) * 0.46;
        // Fixed grain, not animated noise, keeps camera movement quiet.
        float grain = fract(sin(dot(floor(vUv * resolution), vec2(12.9898, 78.233))) * 43758.5453);
        // Fade cropped architecture into darkness on portrait displays.
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
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

  return {
    resize(width, height) {
      // Resizing clears the drawing buffer. Call just before the next draw.
      if (renderer.domElement.width !== width || renderer.domElement.height !== height) {
        renderer.setSize(width, height, false);
      }
      if (target.width !== width || target.height !== height) target.setSize(width, height);
      material.uniforms.resolution.value.set(width, height);
    },
    setFrameHeight(height) {
      material.uniforms.frameHeight.value = height;
    },
    setDeath(time, strength) {
      material.uniforms.deathTime.value = time;
      material.uniforms.deathStrength.value = strength;
    },
    lose() {
      // Release the old context's handles while it is lost. After restoration
      // Three.js replaces its resource registry; old disposal listeners would
      // otherwise try to delete handles belonging to the previous context.
      target.dispose();
    },
    draw(room, viewCamera) {
      renderer.setRenderTarget(target);
      renderer.render(room, viewCamera);
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    restore() {
      target.dispose();
      material.needsUpdate = true;
    },
    dispose() {
      target.dispose();
      material.dispose();
      scene.children[0].geometry.dispose();
    },
  };
}
