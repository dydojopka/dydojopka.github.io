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
    draw(room, viewCamera) {
      renderer.setRenderTarget(target);
      renderer.render(room, viewCamera);
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
  };
}
