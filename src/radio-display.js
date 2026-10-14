import { TextureSource } from 'three';
import { RADIO_STATIONS } from './radio-stations.js';

export const RADIO_PATCH = { x: 272, y: 29, width: 85, height: 36, sourceSize: 1024 };

export async function loadRadioAtlas(baseUrl) {
  const image = new Image();
  image.src = `${baseUrl}images/radio-frequencies.png`;
  await image.decode();
  return image;
}

export function createRadioDisplay({ radio, atlas, createCanvas = () => document.createElement('canvas'), onChange = () => {} }) {
  const assignments = [];
  const materials = new Map();
  radio.traverse((object) => {
    if (!object.isMesh || object.material.name !== 'RES_Radio') return;
    const original = object.material;
    if (!materials.has(original)) {
      const material = original.clone();
      const maps = ['map', 'emissiveMap'].map((key) => {
        const texture = original[key].clone();
        const canvas = createCanvas();
        // Keep the source atlas and UVs; give the small numeric fields enough
        // texels for their original five-pixel glyphs in the close view.
        canvas.width = Math.max(original[key].image.width, RADIO_PATCH.sourceSize);
        canvas.height = Math.max(original[key].image.height, RADIO_PATCH.sourceSize);
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = false;
        context.drawImage(original[key].image, 0, 0, canvas.width, canvas.height);
        // A cloned glTF texture shares Source. Use a new Source for each canvas.
        texture.source = new TextureSource(canvas);
        material[key] = texture;
        return { texture, canvas, context };
      });
      materials.set(original, { material, maps });
    }
    assignments.push({ object, original });
    object.material = materials.get(original).material;
  });
  let frequency;
  let disposed = false;
  function setFrequency(value) {
    if (disposed || frequency === value) return;
    const row = RADIO_STATIONS.findIndex((station) => station.frequency === value);
    if (row < 0) return;
    frequency = value;
    const { x, y, width, height, sourceSize } = RADIO_PATCH;
    for (const { maps } of materials.values()) maps.forEach(({ texture, canvas, context }, column) => {
      const scaleX = canvas.width / sourceSize, scaleY = canvas.height / sourceSize;
      context.drawImage(atlas, column * width, row * height, width, height,
        x * scaleX, y * scaleY, width * scaleX, height * scaleY);
      texture.needsUpdate = true;
    });
    onChange();
  }
  setFrequency(50);
  return {
    setFrequency,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { object, original } of assignments) object.material = original;
      for (const { material, maps } of materials.values()) {
        for (const { texture } of maps) texture.dispose();
        material.dispose();
      }
    },
  };
}
