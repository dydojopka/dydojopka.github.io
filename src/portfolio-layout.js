export const SCREEN_WIDTH = 1440;
export const SCREEN_HEIGHT = 1080;
export const MENU_TOP = 286;
export const MENU_BOTTOM = 888;
export const MENU_ROW = 76;

export function menuRegions(projects, scroll = 0) {
  return projects.map((project, index) => ({
    x: 48, y: MENU_TOP + index * MENU_ROW - scroll, width: 320, height: 68, type: 'select', id: project.id,
  })).filter((region) => region.y >= MENU_TOP && region.y + region.height <= MENU_BOTTOM);
}

export function screenAction(uv, regions, enabled = true) {
  if (!enabled || !uv || uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1) return undefined;
  const x = uv.x * SCREEN_WIDTH;
  const y = (1 - uv.y) * SCREEN_HEIGHT;
  return regions.find((region) => x >= region.x && x <= region.x + region.width
    && y >= region.y && y <= region.y + region.height);
}
