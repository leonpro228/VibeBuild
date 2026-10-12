/**
 * Unit-cube face table (right-handed coords, CCW winding for FrontSide).
 * Structure follows the classic three.js voxel geometry layout:
 * each face has 4 corners; triangles are (0,1,2) and (2,1,3).
 * uv: [0,0] = bottom-left of the tile in texture space.
 * Face names match vanilla model directions (palette.json `faces`).
 */
export interface FaceCorner {
  pos: [number, number, number];
  uv: [number, number];
}

export type FaceDir = "up" | "down" | "north" | "south" | "east" | "west";

export interface FaceDef {
  id: FaceDir;
  dir: [number, number, number];
  corners: FaceCorner[];
}

export const FACES: FaceDef[] = [
  // -X (west)
  {
    id: "west",
    dir: [-1, 0, 0],
    corners: [
      { pos: [0, 1, 0], uv: [0, 1] },
      { pos: [0, 0, 0], uv: [0, 0] },
      { pos: [0, 1, 1], uv: [1, 1] },
      { pos: [0, 0, 1], uv: [1, 0] },
    ],
  },
  // +X (east)
  {
    id: "east",
    dir: [1, 0, 0],
    corners: [
      { pos: [1, 1, 1], uv: [0, 1] },
      { pos: [1, 0, 1], uv: [0, 0] },
      { pos: [1, 1, 0], uv: [1, 1] },
      { pos: [1, 0, 0], uv: [1, 0] },
    ],
  },
  // -Y (bottom)
  {
    id: "down",
    dir: [0, -1, 0],
    corners: [
      { pos: [1, 0, 1], uv: [1, 0] },
      { pos: [0, 0, 1], uv: [0, 0] },
      { pos: [1, 0, 0], uv: [1, 1] },
      { pos: [0, 0, 0], uv: [0, 1] },
    ],
  },
  // +Y (top)
  {
    id: "up",
    dir: [0, 1, 0],
    corners: [
      { pos: [0, 1, 0], uv: [0, 0] },
      { pos: [0, 1, 1], uv: [0, 1] },
      { pos: [1, 1, 0], uv: [1, 0] },
      { pos: [1, 1, 1], uv: [1, 1] },
    ],
  },
  // -Z (north)
  {
    id: "north",
    dir: [0, 0, -1],
    corners: [
      { pos: [1, 0, 0], uv: [0, 0] },
      { pos: [0, 0, 0], uv: [1, 0] },
      { pos: [1, 1, 0], uv: [0, 1] },
      { pos: [0, 1, 0], uv: [1, 1] },
    ],
  },
  // +Z (south)
  {
    id: "south",
    dir: [0, 0, 1],
    corners: [
      { pos: [0, 0, 1], uv: [0, 0] },
      { pos: [1, 0, 1], uv: [1, 0] },
      { pos: [0, 1, 1], uv: [0, 1] },
      { pos: [1, 1, 1], uv: [1, 1] },
    ],
  },
];