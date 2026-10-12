/**
 * Resolves vanilla blockstate -> model -> parent chain into per-face textures.
 *
 * Input shapes (PrismarineJS minecraft-assets data/<ver>/):
 *   blocks_states.json: { [blockId]: { variants: { [condition]: { model, x?, y? } } } }
 *   blocks_models.json: { [modelName]: { parent?, textures?, elements? } }
 *
 * Values carry "minecraft:block/..." prefixes while registry keys are bare.
 * We only need which texture goes on which of the 6 cube faces; sub-UVs and
 * element rotations inside models are ignored (full-cube approximations).
 */

const PREFIX_RE = /^(?:minecraft:)?(?:block\/)?/;

function strip(ref) {
  return typeof ref === "string" ? ref.replace(PREFIX_RE, "") : null;
}

/** Picks the default (upright, unrotated) variant of a blockstate.
 * 26.1 format: a condition may hold an array of weighted variants (mirrors,
 * rotations) — the first entry is the plain model. */
function pickVariant(state) {
  const raw =
    state.variants[""] ?? state.variants["axis=y"] ?? state.variants["snowy=false"] ??
    state.variants[Object.keys(state.variants)[0]];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Returns { up, down, north, south, east, west: textureName } for a block id,
 * or null when the blockstate/model chain can't be resolved.
 */
export function resolveBlockFaces(id, states, models) {
  const state = states[id];
  if (!state || !state.variants) return null;
  const variant = pickVariant(state);
  const modelName = variant?.model ? strip(variant.model) : null;
  if (!modelName) return null;

  // Merge textures down the parent chain (child overrides parent).
  const textures = {};
  let elements = null;
  let current = modelName;
  const visited = new Set();
  for (let depth = 0; current && !visited.has(current) && depth < 16; depth++) {
    visited.add(current);
    const model = models[current];
    if (!model) break;
    Object.assign(textures, model.textures ?? {});
    if (!elements && model.elements) elements = model.elements;
    current = model.parent ? strip(model.parent) : null;
  }
  if (!elements || !elements.length) return null;

  // Prefer an element covering the whole unit cube with all six faces
  // (grass_block has a second overlay element we intentionally ignore).
  const hasAll6 = (e) =>
    e.faces && ["up", "down", "north", "south", "east", "west"].every((d) => e.faces[d]);
  const elem =
    elements.find((e) => hasAll6(e) && e.from?.[0] === 0 && e.to?.[0] === 16) ??
    elements.find(hasAll6) ??
    elements[0];
  if (!elem?.faces) return null;

  // "#var" -> actual texture name, following variable chains, cycle-safe.
  // Newer versions wrap some values as {force_translucent, sprite: "minecraft:block/x"}.
  const resolveVar = (ref) => {
    let value = ref;
    const seen = new Set();
    for (let hop = 0; hop < 8; hop++) {
      if (value == null) return null;
      if (typeof value === "object") value = value.sprite ?? null;
      if (typeof value !== "string") return null;
      if (!value.startsWith("#")) return strip(value);
      const key = value.slice(1);
      if (seen.has(key)) return null;
      seen.add(key);
      value = textures[key] ?? null;
    }
    return null;
  };
  const fallbackTex = resolveVar(textures.particle) ??
    Object.values(textures).map(resolveVar).find(Boolean);

  const out = {};
  for (const dir of ["up", "down", "north", "south", "east", "west"]) {
    const tex = resolveVar(elem.faces[dir]?.texture) ?? fallbackTex;
    if (!tex) return null;
    out[dir] = tex;
  }
  return out;
}