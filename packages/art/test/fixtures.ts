import type { ArtRequest, StyleBible } from "@unwritten/schema";

export const dustyRuinsStyle: StyleBible = {
  paletteName: "dusty-ruins",
  colors: [
    "#0d0a0c",
    "#2b2126",
    "#5a4238",
    "#8a6a4f",
    "#c49a6c",
    "#e8c99b",
    "#7a8c6b",
    "#c1d1a5",
  ],
  gridSize: 32,
  outline: "dark",
  perspective: "side-on, waist-high camera",
  keywords: ["sun-bleached", "sandstone", "wind-worn"],
};

export const neonTideStyle: StyleBible = {
  paletteName: "neon-tide",
  colors: [
    "#08021a",
    "#1c0f4d",
    "#3a1c8c",
    "#6a2ce0",
    "#b13bf0",
    "#ff5fd1",
    "#33e6c1",
    "#0ea5ff",
  ],
  gridSize: 16,
  outline: "selective",
  perspective: "top-down, three-quarter",
  keywords: ["bioluminescent", "wet-chrome", "midnight"],
};

export function sampleRequest(
  overrides: Partial<ArtRequest> = {},
): ArtRequest {
  return {
    kind: "sprite",
    subject: "a weary courier in a patched coat",
    mood: "guarded but curious",
    sizeClass: "medium",
    ...overrides,
  };
}
