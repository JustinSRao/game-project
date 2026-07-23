import type {
  AreaAction,
  AreaGameState,
  AreaSpec,
  ReunionGameState,
  ReunionPlayer,
  ReunionRole,
} from "@howeverfar/schema";
import { projectPlayer, STARTING_SHEET } from "@howeverfar/schema";
import {
  applyAreaAction,
  enterArea,
  type AreaActionOutcome,
  type Direction,
  tryMove,
} from "./area.js";

/**
 * Two players, one world (Phase 7) — still pure, still deterministic, still
 * zero AI and zero network (ADR-0002).
 *
 * The design here is the whole point: the Reunion does NOT get a second set of
 * rules. A player is projected out of the shared state into the ordinary
 * single-player shape, the existing Area engine decides what their action
 * does, and the result is merged back. Everything already tested — collision,
 * reachability, once-semantics, checks, quests, portals — applies unchanged
 * and cannot drift from the solo game, which is exactly what ADR-0021
 * predicted the Reunion would need.
 *
 * The split of state follows the fiction: where you are standing and what you
 * personally can do is yours; the world is shared. A door one of them opened
 * is open.
 */

/** Where the other player is right now, if they are in the same area. */
export function partnerOf(state: ReunionGameState, role: ReunionRole): ReunionPlayer {
  return role === "her" ? state.his : state.her;
}

/**
 * The area as this player sees it: their partner standing in it, blocking a
 * tile like any other character.
 *
 * Two people cannot occupy one square, and discovering that by walking through
 * each other would make the world feel like a diagram. Injecting the partner
 * as an entity rather than special-casing movement means collision, integrity
 * and reachability all keep the one definition they already had — and because
 * the injected entity carries no interaction, nothing else in the engine
 * treats it as anything but furniture.
 */
export function areaWithPartner(
  area: AreaSpec,
  state: ReunionGameState,
  role: ReunionRole,
): AreaSpec {
  const partner = partnerOf(state, role);
  if (!partner.connected) return area;
  return {
    ...area,
    entities: [
      ...area.entities,
      {
        id: PARTNER_ENTITY_ID,
        name: partner.name,
        description: "The person you crossed a world to stand next to.",
        role: "character",
        pos: { ...partner.pos },
      },
    ],
  };
}

/**
 * Reserved id for the injected partner. Nothing may target it: it exists to
 * occupy a tile, and an area the Director wrote must never name it.
 */
export const PARTNER_ENTITY_ID = "the-other";

/** Fold a single-player result back into the shared world. */
export function mergePlayer(
  state: ReunionGameState,
  role: ReunionRole,
  next: AreaGameState,
): ReunionGameState {
  const player: ReunionPlayer = {
    ...(role === "her" ? state.her : state.his),
    pos: { ...next.pos },
    facing: next.facing,
    sheet: next.sheet,
  };
  return {
    ...state,
    ...(role === "her" ? { her: player } : { his: player }),
    currentAreaId: next.currentAreaId,
    flags: next.flags,
    inventory: next.inventory,
    visitedAreaIds: next.visitedAreaIds,
    usedInteractions: next.usedInteractions,
    rng: next.rng,
    quests: next.quests,
  };
}

export interface ReunionOutcome {
  state: ReunionGameState;
  outcome: AreaActionOutcome;
}

/**
 * Apply one player's action to the shared world.
 *
 * Serialization is the caller's job and the server does it by awaiting each
 * turn before starting the next — two simultaneous actions are two sequential
 * ones, which is what keeps a shared `rng` counter meaningful and stops a
 * once-only interaction firing twice.
 */
export function applyReunionAction(
  state: ReunionGameState,
  area: AreaSpec,
  role: ReunionRole,
  action: AreaAction,
): ReunionOutcome {
  const view = areaWithPartner(area, state, role);
  const outcome = applyAreaAction(projectPlayer(state, role), view, action);
  const next = stateFromOutcome(outcome);
  return { state: next ? mergePlayer(state, role, next) : state, outcome };
}

function stateFromOutcome(outcome: AreaActionOutcome): AreaGameState | undefined {
  switch (outcome.kind) {
    case "interaction":
      return outcome.outcome.state;
    case "convo":
      return outcome.outcome.state;
    case "portal":
      return outcome.outcome.state;
    case "moveTo":
    case "freeText":
    case "approach":
      return outcome.state;
  }
}

/** One step, for a client running the same rules optimistically. */
export function reunionMove(
  state: ReunionGameState,
  area: AreaSpec,
  role: ReunionRole,
  dir: Direction,
): ReunionGameState {
  const view = areaWithPartner(area, state, role);
  return mergePlayer(state, role, tryMove(projectPlayer(state, role), view, dir));
}

/**
 * Move the whole world into an area. Both players arrive — the Reunion has no
 * mechanism for one of them being somewhere else, and should not: the entire
 * point is that they are finally in the same room.
 */
export function enterReunionArea(
  state: ReunionGameState,
  area: AreaSpec,
): ReunionGameState {
  // Run the on-enter effects exactly once, through one player's projection,
  // then place both. Running them per-player would double every effect.
  const entered = enterArea(projectPlayer(state, "her"), area);
  const merged = mergePlayer(state, "her", entered);
  return {
    ...merged,
    her: { ...merged.her, pos: { ...area.playerSpawn }, facing: "down" },
    his: {
      ...merged.his,
      pos: spawnBeside(area, area.playerSpawn),
      facing: "down",
    },
  };
}

/**
 * A walkable tile next to the spawn for the second player. Falls back to the
 * spawn itself if the area is too tight — two players on one tile is ugly, but
 * a player who cannot be placed at all is a crash, and the always-playable
 * invariant decides that trade.
 */
function spawnBeside(area: AreaSpec, at: { x: number; y: number }): { x: number; y: number } {
  const candidates = [
    { x: at.x + 1, y: at.y },
    { x: at.x - 1, y: at.y },
    { x: at.x, y: at.y + 1 },
    { x: at.x, y: at.y - 1 },
  ];
  for (const c of candidates) {
    const tile = area.tiles[area.ground[c.y]?.[c.x] ?? -1];
    const blocked = area.entities.some(
      (e) => e.role !== "item" && e.pos.x === c.x && e.pos.y === c.y,
    );
    if (tile?.walkable && !blocked) return c;
  }
  return { ...at };
}

/** The starting state of a shared world, both players on the first area. */
export function initialReunionState(
  firstArea: AreaSpec,
  players: { her: string; his: string },
  seed = 1,
): ReunionGameState {
  const base: ReunionGameState = {
    currentAreaId: firstArea.id,
    her: {
      role: "her",
      name: players.her,
      pos: { ...firstArea.playerSpawn },
      facing: "down",
      sheet: STARTING_SHEET,
      connected: false,
    },
    his: {
      role: "his",
      name: players.his,
      pos: { ...firstArea.playerSpawn },
      facing: "down",
      sheet: STARTING_SHEET,
      connected: false,
    },
    flags: {},
    inventory: [],
    visitedAreaIds: [],
    usedInteractions: [],
    rng: { seed, counter: 0 },
    quests: [],
  };
  return enterReunionArea(base, firstArea);
}

/**
 * Reunion-specific integrity, on top of `validateAreaIntegrity`. The extra
 * rules are the ones a shared area can break that a solo one cannot.
 */
export function validateReunionArea(area: AreaSpec): string[] {
  const problems: string[] = [];
  if (area.path !== "reunion") {
    problems.push(`reunion area "${area.id}" has path "${area.path}", expected "reunion"`);
  }
  if (area.entities.some((e) => e.id === PARTNER_ENTITY_ID)) {
    problems.push(
      `entity id "${PARTNER_ENTITY_ID}" is reserved for the other player and cannot be authored`,
    );
  }
  // Both players spawn here, so there must be somewhere for the second one to
  // stand — an area that can only hold one of them is not a reunion.
  const beside = spawnBeside(area, area.playerSpawn);
  if (beside.x === area.playerSpawn.x && beside.y === area.playerSpawn.y) {
    problems.push(
      `no walkable tile beside playerSpawn (${area.playerSpawn.x}, ${area.playerSpawn.y}) — both players arrive here`,
    );
  }
  return problems;
}
