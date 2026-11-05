import { DESKTOP_Y, placements } from './placements.js';

const DEG = Math.PI / 180;

// Keep the monitor readable on portrait displays, then let the visitor look
// across the desk instead of shrinking the whole room into a single frame.
export function cameraView(aspect, desk, focus, normal) {
  aspect = Math.max(aspect, 0.1);
  const fov = Math.min(42, 2 * Math.atan(Math.tan(36 * DEG) / aspect) / DEG);
  const horizontalFov = 2 * Math.atan(Math.tan(fov * DEG / 2) * aspect) / DEG;
  const initialYaw = Math.atan2(-normal.x, normal.z) / DEG;
  const slope = normal.x / normal.z;
  const position = [0, 0, Math.max(5.3, 0.55 + 2.55 / (2 * Math.tan(horizontalFov * DEG / 2)))];
  // Tablet widths also need enough distance to reach the near desktop corners
  // without increasing the hard rotation limits used on smaller displays.
  const leftTangent = Math.tan((25 + horizontalFov / 2 - 2 - initialYaw) * DEG);
  const rightTangent = Math.tan((28 + horizontalFov / 2 - 2 + initialYaw) * DEG);
  const leftDistance = (focus.x - desk.min.x - slope * focus.z + leftTangent * desk.max.z) / (leftTangent - slope);
  const rightDistance = (desk.max.x - focus.x + slope * focus.z + rightTangent * desk.max.z) / (rightTangent + slope);
  position[2] = Math.max(position[2], leftDistance, rightDistance);
  // The exported screen's yaw is baked into its vertices. Keep the eye on
  // its horizontal normal and add a small lift above the face-to-face view.
  position[0] = focus.x + (position[2] - focus.z) * slope;
  position[1] = focus.y + (position[2] - focus.z) * normal.y / normal.z + 0.25;
  const initialPitch = Math.atan2(position[1] - focus.y, Math.hypot(position[0] - focus.x, position[2] - focus.z)) / DEG;
  // The shelf above the window is part of the room visitors can inspect.
  const minPitch = -12;
  const frontPitch = Math.atan2(position[1] - DESKTOP_Y, position[2] - desk.max.z) / DEG;
  // Keep the near edge in the lower portion of a portrait frame instead of
  // using the desktop tilt, which would put most of a tall screen under the desk.
  const maxPitch = Math.max(minPitch + 1, Math.min(22, frontPitch - Math.atan(Math.tan(fov * DEG / 2) * 0.3) / DEG));
  // Pitch widens the horizontal angle at the middle of the image. Account for
  // its largest value so a diagonal movement cannot expose extra side walls.
  const halfView = Math.atan(Math.tan(horizontalFov * DEG / 2) / Math.cos(maxPitch * DEG)) / DEG;
  const distance = position[2] - desk.max.z;
  const leftEdge = Math.atan2(desk.min.x - position[0], distance) / DEG - initialYaw;
  const rightEdge = Math.atan2(desk.max.x - position[0], distance) / DEG - initialYaw;
  const minYaw = Math.min(0, Math.max(-25, leftEdge + halfView - 2));
  const maxYaw = Math.max(0, Math.min(28, rightEdge - halfView + 2));
  const leftProp = placements['radio-stack'].position;
  const rightProp = placements['card-reader'].position;
  return {
    aspect, fov, horizontalFov, position,
    initialYaw, initialPitch,
    limits: {
      minYaw, maxYaw, minPitch, maxPitch, focusPitch: initialPitch,
      focusMinYaw: Math.max(minYaw, Math.atan2(leftProp[0] - position[0], position[2] - leftProp[2]) / DEG - initialYaw),
      focusMaxYaw: Math.min(maxYaw, Math.atan2(rightProp[0] - position[0], position[2] - rightProp[2]) / DEG - initialYaw),
    },
    frameHeight: 2 * position[2] * Math.tan(fov * DEG / 2),
  };
}

export function renderSize(width, height, monitorFocused = false) {
  const scale = Math.min(1, (monitorFocused ? 1440 : 600) / Math.max(height, 1), (monitorFocused ? 1920 : 1600) / Math.max(width, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function wrap(value, min, max) {
  const length = max - min;
  return ((value - min) % length + length) % length + min;
}
