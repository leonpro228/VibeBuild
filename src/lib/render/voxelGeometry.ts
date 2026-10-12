import * as THREE from "three";
import { ATLAS, INFO_BY_ID, faceTile } from "../palette/palette.ts";
import { FACES } from "./faceTable.ts";
import type { Build } from "../build/types";

/** UV rectangle of a tile inside the atlas, with a small inset against bleeding. */
export function tileUV(tile: number): { u0: number; v0: number; du: number; dv: number } {
  const col = tile % ATLAS.cols;
  const row = Math.floor(tile / ATLAS.cols);
  const inset = 0.02;
  return {
    u0: (col + inset) / ATLAS.cols,
    v0: 1 - (row + 1 - inset) / ATLAS.rows,
    du: (1 - 2 * inset) / ATLAS.cols,
    dv: (1 - 2 * inset) / ATLAS.rows,
  };
}

/** True when the face between `current` and `neighbor` must be rendered. */
export function faceVisible(current: string, neighbor: string): boolean {
  if (neighbor === "") return true; // air or out of bounds
  const neighborInfo = INFO_BY_ID.get(neighbor);
  if (!neighborInfo || !neighborInfo.transparent) return false; // solid neighbor culls
  return neighbor !== current; // same transparent block (e.g. glass-glass) culls
}

/** Flattens build layers into a grid map: index -> block id. */
export function flattenGrid(build: Build): Map<number, string> {
  const { width: w, height: h, depth: d } = build.size;
  const grid = new Map<number, string>();
  for (const layer of build.layers) {
    if (layer.y < 0 || layer.y >= h) continue;
    layer.rows.forEach((row, z) => {
      if (z < 0 || z >= d) return;
      row.forEach((id, x) => {
        if (x < 0 || x >= w) return;
        if (!id || id === "air") return;
        grid.set((layer.y * d + z) * w + x, id);
      });
    });
  }
  return grid;
}

/** Slice selector for instruction focus mode. */
export interface GeometrySlice {
  /** Include only layers matching this predicate. */
  y?: (y: number) => boolean;
  /** Neighbors at y >= this are treated as air: layers above the rendered
   *  region are hidden, so faces opening into them must be drawn. */
  exposedAbove?: number;
}

/** Builds a merged BufferGeometry for one material class of blocks. */
export function buildGeometry(
  build: Build,
  transparentClass: boolean,
  slice: GeometrySlice = {},
): THREE.BufferGeometry {
  const { y: yFilter, exposedAbove } = slice;
  const { width: w, height: h, depth: d } = build.size;
  const grid = flattenGrid(build);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const at = (x: number, y: number, z: number): string => {
    if (x < 0 || x >= w || y < 0 || y >= h || z < 0 || z >= d) return "";
    return grid.get((y * d + z) * w + x) ?? "";
  };

  for (const [index, id] of grid) {
    const info = INFO_BY_ID.get(id);
    if (!info || info.transparent !== transparentClass) continue;
    const x = index % w;
    const y = Math.floor(index / (d * w));
    const z = Math.floor((index % (d * w)) / w);
    if (yFilter && !yFilter(y)) continue;

    for (const face of FACES) {
      const [dx, dy, dz] = face.dir;
      const nx = x + dx;
      const ny = y + dy;
      const neighbor = at(nx, ny, z + dz);
      // Hidden neighbor (above the rendered slice) or air → the face is exposed.
      const exposed =
        !neighbor || (exposedAbove !== undefined && ny >= exposedAbove);
      if (!exposed && !faceVisible(id, neighbor)) continue;
      // Per-face tile: log tops, grass tops, hay ends, etc. (flat fallback otherwise).
      const { u0, v0, du, dv } = tileUV(faceTile(info, face.id));
      const base = positions.length / 3;
      for (const corner of face.corners) {
        positions.push(x + corner.pos[0], y + corner.pos[1], z + corner.pos[2]);
        normals.push(dx, dy, dz);
        uvs.push(u0 + corner.uv[0] * du, v0 + corner.uv[1] * dv);
      }
      indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}
