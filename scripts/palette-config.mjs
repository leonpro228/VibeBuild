/**
 * Shared palette source config: imported by build-palette.mjs and fetch-textures.mjs.
 * '.' is reserved for air and is NOT part of the symbols string.
 */
export const SYMBOLS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?#$%&*+-=,_.@";

/**
 * Curated whitelist of full-cube blocks, ordered semantically.
 * Names must match vanilla block ids. Order defines symbol assignment (stable!).
 */
export const WHITELIST = [
  // Stones and bricks
  "stone", "cobblestone", "mossy_cobblestone", "stone_bricks", "mossy_stone_bricks",
  "chiseled_stone_bricks", "smooth_stone", "granite", "diorite", "andesite",
  "deepslate", "cobbled_deepslate", "deepslate_bricks", "blackstone",
  "polished_blackstone_bricks", "bricks", "netherrack", "nether_bricks",
  "obsidian", "end_stone_bricks", "quartz_block", "quartz_bricks", "dark_prismarine",
  // Terrain
  "grass_block", "dirt", "sand", "gravel", "snow_block", "clay", "moss_block", "hay_block",
  // Wood
  "oak_planks", "spruce_planks", "birch_planks", "jungle_planks", "acacia_planks",
  "dark_oak_planks", "crimson_planks", "warped_planks",
  "oak_log", "spruce_log", "birch_log", "dark_oak_log",
  // Decor / light
  "glass", "glowstone", "sea_lantern", "shroomlight",
  // Wool
  "white_wool", "light_gray_wool", "gray_wool", "black_wool",
  "red_wool", "blue_wool", "yellow_wool", "lime_wool",
  // Concrete
  "white_concrete", "light_gray_concrete", "gray_concrete", "black_concrete",
  "red_concrete", "blue_concrete", "yellow_concrete", "lime_concrete",
  // Metals
  "iron_block", "gold_block", "diamond_block", "coal_block", "redstone_block", "lapis_block",
  // Leaves (transparent texture, rendered with alpha test)
  "oak_leaves", "spruce_leaves", "cherry_leaves",
  // Misc
  "terracotta",
];

export const TRANSPARENT = new Set(["glass", "oak_leaves", "spruce_leaves", "cherry_leaves"]);

/**
 * Biome-colormap replacements for grayscale vanilla textures (the game tints
 * them at runtime). Value is 0xRRGGBF multiplier applied at atlas build time.
 * Cherry leaves are natively pink (untinted) — not listed.
 */
export const TINTS = new Map([
  ["grass_block_top", 0x91bd59], // plains grass
  ["oak_leaves", 0x48b518], // foliage
  ["spruce_leaves", 0x619961], // spruce foliage
]);