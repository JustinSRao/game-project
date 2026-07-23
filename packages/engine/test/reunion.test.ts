import { describe, expect, it } from "vitest";
import type { AreaSpec } from "@howeverfar/schema";
import { projectPlayer } from "@howeverfar/schema";
import {
  applyReunionAction,
  areaWithPartner,
  enterReunionArea,
  initialReunionState,
  PARTNER_ENTITY_ID,
  reunionMove,
  validateReunionArea,
} from "../src/reunion.js";

function area(overrides: Partial<AreaSpec> = {}): AreaSpec {
  return {
    dslVersion: 1,
    id: "the-threshold",
    name: "The Threshold",
    description: "Two worlds, pressed together until the seam shows.",
    path: "reunion",
    width: 6,
    height: 5,
    tiles: [
      { id: "void", name: "void", walkable: false, color: "#0b0c12" },
      { id: "stone", name: "stone", walkable: true, color: "#94b0c2" },
    ],
    ground: [
      [0, 0, 0, 0, 0, 0],
      [0, 1, 1, 1, 1, 0],
      [0, 1, 1, 1, 1, 0],
      [0, 1, 1, 1, 1, 0],
      [0, 0, 0, 0, 0, 0],
    ],
    playerSpawn: { x: 1, y: 1 },
    entities: [
      {
        id: "the-lantern",
        name: "a lantern left burning",
        description: "Someone meant it to be found.",
        role: "item",
        pos: { x: 3, y: 2 },
        interaction: {
          verb: "take",
          lines: [{ speakerId: "narrator", text: "You lift it. It is still warm." }],
          choices: [],
          effects: [{ op: "addItem", item: "lantern", name: "a lantern left burning" }],
          once: true,
        },
      },
    ],
    portals: [
      {
        id: "onward",
        pos: { x: 4, y: 3 },
        label: "the far side",
        transition: { type: "generate", hint: "Together, at last." },
      },
    ],
    onEnterEffects: [],
    quests: [],
    ...overrides,
  };
}

function start() {
  return initialReunionState(area(), { her: "Suzune", his: "Itsuki" });
}

describe("the reunion engine", () => {
  it("places both players, side by side, on entry", () => {
    const state = start();
    expect(state.her.pos).toEqual({ x: 1, y: 1 });
    expect(state.his.pos).not.toEqual(state.her.pos);
    expect(state.currentAreaId).toBe("the-threshold");
  });

  it("keeps position and sheet private, and the world shared", () => {
    let state = start();
    state = { ...state, her: { ...state.her, connected: true }, his: { ...state.his, connected: true } };

    // She walks; he does not move.
    const before = state.his.pos;
    state = reunionMove(state, area(), "her", "down");
    expect(state.her.pos).toEqual({ x: 1, y: 2 });
    expect(state.his.pos).toEqual(before);

    // He takes the lantern; it is in BOTH their inventories, because there is
    // one world and one lantern.
    state = { ...state, his: { ...state.his, pos: { x: 3, y: 3 } } };
    const taken = applyReunionAction(state, area(), "his", {
      type: "interact",
      entityId: "the-lantern",
    });
    expect(taken.state.inventory.map((i) => i.item)).toContain("lantern");
    expect(projectPlayer(taken.state, "her").inventory.map((i) => i.item)).toContain(
      "lantern",
    );
  });

  it("does not let a once-only interaction fire twice, once for each player", () => {
    let state = start();
    state = {
      ...state,
      her: { ...state.her, pos: { x: 3, y: 3 } },
      his: { ...state.his, pos: { x: 2, y: 2 } },
    };
    const first = applyReunionAction(state, area(), "her", {
      type: "interact",
      entityId: "the-lantern",
    });
    const second = applyReunionAction(first.state, area(), "his", {
      type: "interact",
      entityId: "the-lantern",
    });
    expect(second.outcome.kind).toBe("interaction");
    if (second.outcome.kind === "interaction") {
      expect(second.outcome.outcome.kind).toBe("afterText");
    }
    expect(second.state.inventory).toHaveLength(1);
  });

  it("makes the partner solid — you cannot walk through the person you crossed for", () => {
    let state = start();
    state = {
      ...state,
      her: { ...state.her, pos: { x: 2, y: 2 }, connected: true },
      his: { ...state.his, pos: { x: 3, y: 2 }, connected: true },
    };
    const moved = reunionMove(state, area(), "her", "right");
    expect(moved.her.pos).toEqual({ x: 2, y: 2 });
    // Facing still turns: she looked at him.
    expect(moved.her.facing).toBe("right");
  });

  it("only makes a partner solid while they are actually connected", () => {
    let state = start();
    state = {
      ...state,
      her: { ...state.her, pos: { x: 2, y: 2 }, connected: true },
      his: { ...state.his, pos: { x: 3, y: 2 }, connected: false },
    };
    // A player whose client dropped must not become a wall the other cannot
    // get past — that would strand someone in front of a door.
    expect(reunionMove(state, area(), "her", "right").her.pos).toEqual({ x: 3, y: 2 });
  });

  it("injects the partner as furniture only — never as something to talk to", () => {
    const state = { ...start(), his: { ...start().his, connected: true } };
    const view = areaWithPartner(area(), state, "her");
    const injected = view.entities.find((e) => e.id === PARTNER_ENTITY_ID);
    expect(injected).toBeDefined();
    expect(injected?.interaction).toBeUndefined();
  });

  it("rejects a shared area that cannot hold two people", () => {
    const cramped = area({
      ground: [
        [0, 0, 0, 0, 0, 0],
        [0, 1, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
      ],
      portals: [
        {
          id: "onward",
          pos: { x: 1, y: 1 },
          label: "the far side",
          transition: { type: "generate", hint: "Together." },
        },
      ],
      entities: [],
    });
    expect(validateReunionArea(cramped).join(" ")).toContain("no walkable tile beside");
  });

  it("rejects a reunion area on the wrong path, or one that names the partner", () => {
    expect(validateReunionArea(area({ path: "her" })).join(" ")).toContain('expected "reunion"');
    const impostor = area({
      entities: [
        {
          id: PARTNER_ENTITY_ID,
          name: "not really them",
          description: "An area trying to author the other player.",
          role: "character",
          pos: { x: 2, y: 2 },
        },
      ],
    });
    expect(validateReunionArea(impostor).join(" ")).toContain("reserved");
  });

  it("moves the whole world into a new area — nobody is left behind", () => {
    const next = area({ id: "the-far-side", playerSpawn: { x: 2, y: 2 } });
    const state = enterReunionArea(start(), next);
    expect(state.currentAreaId).toBe("the-far-side");
    expect(state.her.pos).toEqual({ x: 2, y: 2 });
    expect(state.his.pos).not.toEqual(state.her.pos);
    expect(state.visitedAreaIds).toContain("the-far-side");
  });

  it("applies an area's on-enter effects once, not once per player", () => {
    const flagged = area({
      id: "the-far-side",
      onEnterEffects: [
        { op: "adjustResource", resource: "vigor", delta: -1 },
        { op: "setFlag", key: "arrived-together", value: true },
      ],
    });
    const state = enterReunionArea(start(), flagged);
    expect(state.flags["arrived-together"]).toBe(true);
    const before = start().her.sheet.resources["vigor"]?.current ?? 0;
    expect(state.her.sheet.resources["vigor"]?.current).toBe(before - 1);
  });
});
