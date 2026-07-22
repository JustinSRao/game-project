import type { AreaGameState, AreaSpec, AreaTransition } from "@unwritten/schema";
import {
  enterArea,
  initialAreaState,
  getPrologueArea,
  getPrologueAreas,
  PROLOGUE_ENTRY_ID,
} from "./deps.js";

/**
 * The client-side world store for the prologue build: holds the engine state
 * and resolves transitions between hand-authored areas. When the Director
 * lands, "generate" transitions become server calls; today they surface as
 * an "unwritten" veil (see ui.ts) — the honest edge of the built game.
 */
export interface World {
  area: AreaSpec;
  state: AreaGameState;
}

export function newWorld(): World {
  const area = getPrologueArea(PROLOGUE_ENTRY_ID);
  if (!area) throw new Error("prologue entry area missing");
  return { area, state: initialAreaState(area) };
}

export type TransitionResult =
  | { kind: "moved"; world: World }
  | { kind: "unwritten"; portalLabel: string; hint: string }
  | { kind: "ending"; hint: string };

export function followTransition(
  world: World,
  transition: AreaTransition,
  portalLabel: string,
): TransitionResult {
  switch (transition.type) {
    case "area": {
      const next = getPrologueArea(transition.areaId);
      if (!next) throw new Error(`unknown area "${transition.areaId}"`);
      return {
        kind: "moved",
        world: { area: next, state: enterArea(world.state, next) },
      };
    }
    case "generate":
      return { kind: "unwritten", portalLabel, hint: transition.hint };
    case "ending":
      return { kind: "ending", hint: transition.hint };
  }
}

export function allAreas(): readonly AreaSpec[] {
  return getPrologueAreas();
}
