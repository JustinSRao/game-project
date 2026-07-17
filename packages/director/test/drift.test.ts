import { describe, expect, it } from "vitest";
import { Director } from "../src/director.js";
import {
  FakeModelClient,
  makeArc,
  makeProfile,
  makeWriterOutput,
} from "./helpers.js";

describe("arc drift revision", () => {
  it("revises the arc after three beat-less scenes, then resets the counter", async () => {
    const fake = new FakeModelClient();
    const d = new Director({ model: fake });
    await d.handleAction({ type: "choice", choiceId: "join-fire" });
    await d.handleAction({ type: "choice", choiceId: "share-bread" });

    // Anchor exit (scene 1 advances no beat → counter 1)
    fake.push(makeProfile(), makeArc(), makeWriterOutput("gen-one"), { ok: true }, { facts: [] });
    await d.handleAction({ type: "choice", choiceId: "take-knife" });
    expect(d.getSession().scenesSinceBeatProgress).toBe(1);

    // Scene 2, no beat → counter 2
    fake.push(makeWriterOutput("gen-two"), { ok: true }, { facts: [] });
    await d.handleAction({ type: "choice", choiceId: "go-on" });
    expect(d.getSession().scenesSinceBeatProgress).toBe(2);

    // Scene 3, no beat → drift threshold: writer, checker, extractor, REVISER
    const revised = makeArc();
    revised.premise = "REVISED: the road goes where the player goes.";
    fake.push(makeWriterOutput("gen-three"), { ok: true }, { facts: [] }, revised);
    await d.handleAction({ type: "choice", choiceId: "go-on" });

    const s = d.getSession();
    expect(s.arc?.premise).toContain("REVISED");
    expect(s.scenesSinceBeatProgress).toBe(0);
  });

  it("beat progress resets the drift counter without revision", async () => {
    const fake = new FakeModelClient();
    const d = new Director({ model: fake });
    await d.handleAction({ type: "choice", choiceId: "join-fire" });
    await d.handleAction({ type: "choice", choiceId: "share-bread" });

    fake.push(makeProfile(), makeArc(), makeWriterOutput("gen-one"), { ok: true }, { facts: [] });
    await d.handleAction({ type: "choice", choiceId: "take-knife" });

    fake.push(
      makeWriterOutput("gen-two", { advancesBeatId: "beat-bell" }),
      { ok: true },
      { facts: [] },
    );
    await d.handleAction({ type: "choice", choiceId: "go-on" });
    expect(d.getSession().scenesSinceBeatProgress).toBe(0);
    // No reviser call queued or consumed: queue is empty and nothing threw.
    expect(fake.queue).toHaveLength(0);
  });
});
