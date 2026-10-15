import {
  BoxGeometry, DataTexture, FrontSide, Group, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, NearestFilter, PlaneGeometry, Quaternion, SRGBColorSpace, TextureLoader, Vector3,
} from 'three';

function backingTexture() {
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const fleck = ((Math.imul(x + y * 64 + 1, 0x45d9f3b) >>> 16) & 15) - 7;
    const grain = fleck * 0.5 + Math.sin(x * 1.7 + Math.sin(y * 0.12)) * 2;
    const i = (y * 64 + x) * 4;
    pixels.set([118 + grain, 101 + grain, 77 + grain, 255], i);
  }
  const texture = new DataTexture(pixels, 64, 64);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export async function loadPaintingPhotos(baseUrl) {
  const loader = new TextureLoader();
  const results = await Promise.allSettled(['alina', 'ariane'].map((name) =>
    loader.loadAsync(`${baseUrl}images/painting-photo-${name}.png`)));
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) {
    for (const result of results) if (result.status === 'fulfilled') result.value.dispose();
    throw failure.reason;
  }
  return results.map(({ value }) => {
    value.colorSpace = SRGBColorSpace;
    value.magFilter = value.minFilter = NearestFilter;
    value.generateMipmaps = false;
    return value;
  });
}

export function preparePainting(shelf, photos) {
  const body = shelf.children.find((object) => object.name.startsWith('Painting'));
  if (!body?.isMesh) throw new Error('Missing upper-shelf painting');
  // Recover the canvas plane from its largest forward-facing triangle. The
  // exporter bakes the shelf's authored lean into the vertices themselves.
  const source = body.geometry;
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), normal = new Vector3();
  const front = new Vector3();
  let area = 0;
  for (let i = 0; i < source.index.count; i += 3) {
    a.fromBufferAttribute(source.attributes.position, source.index.getX(i));
    b.fromBufferAttribute(source.attributes.position, source.index.getX(i + 1));
    c.fromBufferAttribute(source.attributes.position, source.index.getX(i + 2));
    normal.crossVectors(b.sub(a), c.sub(a));
    if (normal.z < 0 && normal.lengthSq() > area) {
      area = normal.lengthSq(); front.copy(normal).normalize();
    }
  }
  front.x = 0; front.normalize();
  const right = new Vector3(-1, 0, 0), up = new Vector3().crossVectors(front, right).normalize();
  const basis = new Matrix4().makeBasis(right, up, front);
  const geometry = source.clone().applyMatrix4(basis.clone().invert());
  geometry.computeBoundingBox();
  const center = geometry.boundingBox.getCenter(new Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox.clone(), size = bounds.getSize(new Vector3());
  const root = new Group();
  root.name = 'painting';
  body.updateMatrix();
  root.position.copy(center).applyMatrix4(basis).applyMatrix4(body.matrix);
  root.quaternion.copy(body.quaternion).multiply(new Quaternion().setFromRotationMatrix(basis));
  root.scale.copy(body.scale);
  shelf.add(root);
  root.add(body);
  body.position.set(0, 0, 0); body.quaternion.identity(); body.scale.setScalar(1);
  body.geometry = geometry;
  source.dispose();
  const artwork = body.material;
  artwork.side = FrontSide;
  const backing = new MeshStandardMaterial({ color: 0x51412d, roughness: 1 });
  const edge = new MeshStandardMaterial({ color: 0x725330, roughness: 0.95 });
  body.material = [artwork, backing, edge];
  geometry.clearGroups();
  const surfaces = [[], [], []];
  for (let i = 0; i < geometry.index.count; i += 3) {
    const z = geometry.attributes.normal.getZ(geometry.index.getX(i));
    const surface = surfaces[z < -0.9 ? 1 : Math.abs(z) < 0.1 ? 2 : 0];
    for (let j = 0; j < 3; j++) surface.push(geometry.index.getX(i + j));
  }
  geometry.setIndex(surfaces.flat());
  let start = 0;
  surfaces.forEach((indices, material) => {
    geometry.addGroup(start, indices.length, material); start += indices.length;
  });
  const originalUVs = geometry.attributes.uv.array.slice();
  function setArtwork(island) {
    // Both images occupy the left column of the 128px atlas. Sample only
    // texel centers, retaining the complete golden frame without gutters.
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const relativeY = (originalUVs[i * 2 + 1] * 128 - 0.5) / 36;
      uv.setY(i, island ? originalUVs[i * 2 + 1] : (38.5 + relativeY * 37) / 128);
    }
    uv.needsUpdate = true;
  }
  setArtwork(false);
  const panel = new Mesh(new PlaneGeometry(size.x * 0.94, size.y * 0.9),
    new MeshStandardMaterial({ map: backingTexture(), roughness: 1 }));
  panel.name = 'painting-backing';
  panel.position.z = bounds.min.z - 0.002; panel.rotation.y = Math.PI;
  root.add(panel);
  const tabMaterial = new MeshStandardMaterial({ color: 0x282723, metalness: 0.4, roughness: 0.8 });
  for (const x of [-1, 1]) for (const y of [-1, 1]) {
    const tab = new Mesh(new BoxGeometry(size.x * 0.025, size.y * 0.085, 0.002), tabMaterial);
    tab.position.set(x * size.x * 0.456, y * size.y * 0.32, bounds.min.z - 0.004);
    root.add(tab);
  }
  const photoHeight = size.y * 0.57, photoWidth = photoHeight * 314 / 347;
  const mount = new Group();
  mount.position.set(-size.x * 0.19, size.y * 0.02, bounds.min.z - 0.004);
  mount.rotation.set(0, Math.PI, -0.09);
  root.add(mount);
  // Keep both materials reachable for shader warmup, context restoration and
  // disposeScene, including whichever photograph is currently hidden.
  const photo = new Mesh(new PlaneGeometry(photoWidth, photoHeight), photos.map((map) =>
    new MeshBasicMaterial({ map, toneMapped: false })));
  photo.name = 'painting-photo';
  photo.geometry.clearGroups(); photo.geometry.addGroup(0, 6, 0);
  mount.add(photo);
  const tapeMaterial = new MeshStandardMaterial({ color: 0xafa17a, roughness: 1 });
  for (const sign of [-1, 1]) {
    const tape = new Mesh(new BoxGeometry(photoWidth * 0.34, photoHeight * 0.09, 0.002), tapeMaterial);
    tape.position.set(sign * photoWidth * 0.22, sign * photoHeight * 0.48, 0.003);
    tape.rotation.z = -0.18;
    mount.add(tape);
  }
  root.updateWorldMatrix(true, true);
  return { root, size, bounds, setArtwork,
    setPhoto(ariane) { photo.geometry.groups[0].materialIndex = ariane ? 1 : 0; } };
}
