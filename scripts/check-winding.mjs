/**
 * Sanity check for the face table: every triangle of every face must have a
 * geometric normal whose dot product with face.dir is positive (CCW winding,
 * FrontSide rendering). Run: node scripts/check-winding.mjs
 */
import { FACES } from "../src/lib/render/faceTable.ts";

let ok = true;
for (const face of FACES) {
  const [p0, p1, p2, p3] = face.corners.map((c) => c.pos);
  for (const [a, b, c] of [
    [p0, p1, p2],
    [p2, p1, p3],
  ]) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const dot = n[0] * face.dir[0] + n[1] * face.dir[1] + n[2] * face.dir[2];
    if (dot <= 0) {
      ok = false;
      console.error(`BAD winding: dir=${face.dir} tri=(${a},${b},${c}) normalDot=${dot}`);
    }
  }
}
console.log(ok ? "winding OK: all faces CCW along dir" : "winding FAILED");
process.exit(ok ? 0 : 1);
