export const DESKTOP_Y = 2.252;

// One switch controls the retrofitted CardReader, its cable and contact shadow.
export const SHOW_PRINTER = true;

// Position is the bottom-center of each exported group. Keeping placement
// separate lets geometry checks use the same transforms as the actual scene.
export const placements = {
  room: { position: [-1.27, 0, 0.6], scale: 0.75, yaw: Math.PI },
  'room-furniture': { position: [-1.27, 0, 0.6], scale: 0.75, yaw: Math.PI },
  desk: { position: [0, 0, 0.25], scale: 0.79, yaw: Math.PI },
  monitor: { position: [-0.4, DESKTOP_Y, -0.42], scale: 0.95 },
  keyboard: { position: [-0.4, DESKTOP_Y + 0.006, 1.1], scale: 0.88 },
  'radio-stack': { position: [-3.22, DESKTOP_Y, -0.52], scale: 0.56, yaw: Math.PI },
  plant: { position: [-2.15, DESKTOP_Y, -0.38], scale: 0.64, yaw: 0.28 },
  'desk-lamp': { position: [1.23, DESKTOP_Y, -0.3], scale: 0.43, yaw: -Math.PI / 2 },
  'card-reader': { position: [2.63, DESKTOP_Y, 0.05], scale: 0.84, yaw: -0.14 },
  book: { position: [1.1, DESKTOP_Y + 0.004, 1.2], scale: 0.36, yaw: -0.12 },
  books: { position: [4.2, 2.785, -2.15], scale: 0.72, yaw: Math.PI },
  radiator: { position: [4.55, 0.14, -2.25], scale: 0.58, yaw: Math.PI },
};
