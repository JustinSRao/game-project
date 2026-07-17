import { describe, expect, it } from "vitest";
import { validateSceneIntegrity, initialState, applyAction } from "@unwritten/engine";
import { ANCHOR_ENTRY_ID, getAnchorScenes, isAnchorScene } from "../src/index.js";

describe("the Anchor", () => {
  const scenes = getAnchorScenes();

  it("has an entry scene", () => {
    expect(scenes.has(ANCHOR_ENTRY_ID)).toBe(true);
    expect(isAnchorScene(ANCHOR_ENTRY_ID)).toBe(true);
    expect(isAnchorScene("not-a-scene")).toBe(false);
  });

  it("every scene passes schema + integrity validation", () => {
    for (const scene of scenes.values()) {
      expect(validateSceneIntegrity(scene)).toEqual([]);
    }
  });

  it("every scene transition resolves inside the Anchor", () => {
    for (const scene of scenes.values()) {
      for (const choice of scene.choices) {
        if (choice.transition.type === "scene") {
          expect(scenes.has(choice.transition.sceneId)).toBe(true);
        }
      }
    }
  });

  it("exactly one scene exits to generation, and every exit is a generate transition", () => {
    const exitScenes = [...scenes.values()].filter((s) =>
      s.choices.some((c) => c.transition.type === "generate"),
    );
    expect(exitScenes).toHaveLength(1);
    const exit = exitScenes[0]!;
    for (const choice of exit.choices) {
      expect(choice.transition.type).toBe("generate");
    }
  });

  it("free text is enabled everywhere (it is the richest profiling signal)", () => {
    for (const scene of scenes.values()) {
      expect(scene.freeText.enabled).toBe(true);
    }
  });

  it("is playable end to end through the engine", () => {
    const entry = scenes.get(ANCHOR_ENTRY_ID)!;
    let state = initialState(entry);
    // waking → fire
    let outcome = applyAction(state, entry, { type: "choice", choiceId: "join-fire" });
    if (outcome.kind !== "transition" || outcome.transition.type !== "scene")
      throw new Error("expected scene transition");
    const fire = scenes.get(outcome.transition.sceneId)!;
    state = outcome.state;

    // fire → box
    state = structuredClone(state);
    state.currentSceneId = fire.id;
    outcome = applyAction(state, fire, { type: "choice", choiceId: "share-bread" });
    if (outcome.kind !== "transition" || outcome.transition.type !== "scene")
      throw new Error("expected scene transition");
    const box = scenes.get(outcome.transition.sceneId)!;
    state = outcome.state;

    // box → generate (anchor exit)
    state = { ...state, currentSceneId: box.id };
    outcome = applyAction(state, box, { type: "choice", choiceId: "take-compass" });
    if (outcome.kind !== "transition") throw new Error("expected transition");
    expect(outcome.transition.type).toBe("generate");
    expect(outcome.state.inventory.some((i) => i.item === "brass-compass")).toBe(true);
  });
});
