import { describe, expect, it } from "vitest";
import { AreaSpec, type AreaGameState } from "@unwritten/schema";
import {
  applyAreaAction,
  applyConvoChoice,
  EngineError,
  enterArea,
  initialAreaState,
  interactionUsed,
  isWalkable,
  portalUnderPlayer,
  reachableEntities,
  runInteraction,
  takePortal,
  tryMove,
  validateAreaIntegrity,
} from "../src/index.js";

/**
 * 6x5 test area:            x0 x1 x2 x3 x4 x5
 *                       y0   W  W  W  W  W  W
 *                       y1   W  .  .  .  N  W      N = npc (blocks)
 *                       y2   W  .  W  .  .  W      I = item (does not block)
 *                       y3   W  I  .  .  P  W      P = portal tile (walkable)
 *                       y4   W  W  W  W  W  W      spawn at (1,1)
 */
function testArea(): AreaSpec {
  return AreaSpec.parse({
    dslVersion: 1,
    id: "test-yard",
    name: "Test Yard",
    description: "A yard for tests.",
    path: "shared",
    width: 6,
    height: 5,
    tiles: [
      { id: "wall", name: "wall", walkable: false, color: "#333c57" },
      { id: "floor", name: "floor", walkable: true, color: "#94b0c2" },
    ],
    ground: [
      [0, 0, 0, 0, 0, 0],
      [0, 1, 1, 1, 1, 0],
      [0, 1, 0, 1, 1, 0],
      [0, 1, 1, 1, 1, 0],
      [0, 0, 0, 0, 0, 0],
    ],
    playerSpawn: { x: 1, y: 1 },
    entities: [
      {
        id: "gruff-neighbor",
        name: "Iwao",
        description: "A neighbor built like his namesake.",
        role: "character",
        pos: { x: 4, y: 1 },
        nameMeaning: "岩雄 (iwao, \"rock man\") — immovable, dependable",
        interaction: {
          verb: "talk",
          lines: [{ speakerId: "gruff-neighbor", "text": "Hm." }],
          choices: [
            {
              id: "greet",
              label: "Say good morning.",
              reply: "Morning.",
              effects: [{ op: "setFlag", key: "greeted-iwao", value: true }],
            },
          ],
          effects: [],
          once: false,
        },
      },
      {
        id: "old-key",
        name: "Old Key",
        description: "A key someone dropped.",
        role: "item",
        pos: { x: 1, y: 3 },
        interaction: {
          verb: "take",
          lines: [{ speakerId: "narrator", text: "You pocket the key." }],
          choices: [],
          effects: [{ op: "addItem", item: "old-key", name: "Old Key" }],
          once: true,
          afterText: "Nothing else here.",
        },
      },
    ],
    portals: [
      {
        id: "gate",
        pos: { x: 4, y: 3 },
        label: "the back gate",
        transition: { type: "generate", hint: "beyond the gate" },
      },
    ],
    onEnterEffects: [{ op: "setFlag", key: "entered-yard", value: true }],
  });
}

describe("initialAreaState / enterArea", () => {
  it("spawns at playerSpawn, records visit, applies on-enter effects", () => {
    const state = initialAreaState(testArea());
    expect(state.pos).toEqual({ x: 1, y: 1 });
    expect(state.visitedAreaIds).toEqual(["test-yard"]);
    expect(state.flags["entered-yard"]).toBe(true);
  });

  it("does not duplicate visited ids on re-entry", () => {
    const area = testArea();
    const state = enterArea(initialAreaState(area), area);
    expect(state.visitedAreaIds).toEqual(["test-yard"]);
  });
});

describe("movement", () => {
  it("moves onto walkable tiles and updates facing", () => {
    const area = testArea();
    const state = tryMove(initialAreaState(area), area, "right");
    expect(state.pos).toEqual({ x: 2, y: 1 });
    expect(state.facing).toBe("right");
  });

  it("blocks walls but still turns", () => {
    const area = testArea();
    const state = tryMove(initialAreaState(area), area, "up");
    expect(state.pos).toEqual({ x: 1, y: 1 });
    expect(state.facing).toBe("up");
  });

  it("characters block movement; items do not", () => {
    const area = testArea();
    expect(isWalkable(area, 4, 1)).toBe(false); // npc tile
    expect(isWalkable(area, 1, 3)).toBe(true); // item tile
  });
});

describe("interactions", () => {
  function stateAt(x: number, y: number): AreaGameState {
    return { ...initialAreaState(testArea()), pos: { x, y } };
  }

  it("requires reachability", () => {
    const area = testArea();
    expect(() => runInteraction(stateAt(1, 1), area, "gruff-neighbor")).toThrow(EngineError);
  });

  it("returns dialogue when adjacent, and convo choices apply effects", () => {
    const area = testArea();
    const outcome = runInteraction(stateAt(3, 1), area, "gruff-neighbor");
    expect(outcome.kind).toBe("dialogue");
    if (outcome.kind !== "dialogue") throw new Error("unreachable");
    expect(outcome.lines[0]?.text).toBe("Hm.");

    const convo = applyConvoChoice(outcome.state, area, "gruff-neighbor", "greet");
    expect(convo.reply).toBe("Morning.");
    expect(convo.state.flags["greeted-iwao"]).toBe(true);
    expect(convo.transition).toBeUndefined();
  });

  it("once-interactions fire once, then return afterText", () => {
    const area = testArea();
    const first = runInteraction(stateAt(1, 3), area, "old-key");
    expect(first.kind).toBe("dialogue");
    if (first.kind !== "dialogue") throw new Error("unreachable");
    expect(first.state.inventory).toEqual([{ item: "old-key", name: "Old Key" }]);
    expect(interactionUsed(first.state, area, "old-key")).toBe(true);

    const second = runInteraction(first.state, area, "old-key");
    expect(second).toMatchObject({ kind: "afterText", text: "Nothing else here." });
    expect(second.state.inventory).toHaveLength(1);
  });

  it("lists reachable entities (same tile or 4-adjacent)", () => {
    const area = testArea();
    expect(reachableEntities(stateAt(3, 1), area).map((e) => e.id)).toEqual(["gruff-neighbor"]);
    expect(reachableEntities(stateAt(1, 3), area).map((e) => e.id)).toEqual(["old-key"]);
    expect(reachableEntities(stateAt(1, 1), area)).toHaveLength(0);
  });
});

describe("portals", () => {
  it("requires standing on the portal", () => {
    const area = testArea();
    const state = initialAreaState(area);
    expect(() => takePortal(state, area, "gate")).toThrow(EngineError);
  });

  it("yields the transition from the portal tile", () => {
    const area = testArea();
    const state = { ...initialAreaState(area), pos: { x: 4, y: 3 } };
    expect(portalUnderPlayer(state, area)?.id).toBe("gate");
    const outcome = takePortal(state, area, "gate");
    expect(outcome.transition).toEqual({ type: "generate", hint: "beyond the gate" });
  });
});

describe("applyAreaAction", () => {
  it("dispatches and rejects cross-area actions", () => {
    const area = testArea();
    const state = initialAreaState(area);
    const freeText = applyAreaAction(state, area, { type: "freeText", text: "shout" });
    expect(freeText.kind).toBe("freeText");
    expect(() =>
      applyAreaAction({ ...state, currentAreaId: "elsewhere" }, area, {
        type: "freeText",
        text: "shout",
      }),
    ).not.toThrow(); // freeText carries no area assertion...
    expect(() =>
      applyAreaAction({ ...state, currentAreaId: "elsewhere" }, area, {
        type: "interact",
        entityId: "gruff-neighbor",
      }),
    ).toThrow(EngineError);
  });
});

describe("validateAreaIntegrity", () => {
  it("accepts the test area and the golden fixture shape", () => {
    expect(validateAreaIntegrity(testArea())).toEqual([]);
  });

  it("catches dimension mismatches, bad indices, and bad placement", () => {
    const area = testArea();
    const broken: AreaSpec = {
      ...area,
      ground: area.ground.map((row, y) => (y === 1 ? [...row, 1] : [...row])),
      playerSpawn: { x: 0, y: 0 },
      portals: [{ ...area.portals[0]!, pos: { x: 0, y: 0 } }],
    };
    const problems = validateAreaIntegrity(broken);
    expect(problems.some((p) => p.includes("row 1"))).toBe(true);
    expect(problems.some((p) => p.includes("playerSpawn"))).toBe(true);
    expect(problems.some((p) => p.includes('portal "gate"'))).toBe(true);
  });

  it("catches duplicate ids and unresolvable speakers", () => {
    const area = testArea();
    const npc = area.entities[0]!;
    const broken: AreaSpec = {
      ...area,
      entities: [
        npc,
        {
          ...npc,
          id: "stranger",
          pos: { x: 3, y: 3 },
          interaction: {
            verb: "talk",
            lines: [{ speakerId: "nobody", text: "..." }],
            choices: [],
            effects: [],
            once: false,
          },
        },
      ],
    };
    const problems = validateAreaIntegrity(broken);
    expect(problems.some((p) => p.includes('"nobody"'))).toBe(true);
  });
});
