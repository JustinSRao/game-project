import { describe, expect, it } from "vitest";
import type { ThresholdEnding } from "@howeverfar/schema";
import { buildThresholdUser, checkThreshold, writeThreshold } from "../src/threshold.js";
import { FakeModelClient, makeArc, makeProfile } from "./helpers.js";

const closing =
  "You reach the gate at the top of the stair, and it is exactly what you were promised it would be: " +
  "a seam of light the width of a held breath, and behind it the smell of your mother's kitchen. " +
  "Kaede puts her shoulder under your arm and does not say the thing you can both hear her not saying. " +
  "The seam holds while someone stands on this side of it. That is the whole trick of it. " +
  "You have crossed a kingdom to learn that the door is not a door at all, it is a promise, and a promise " +
  "needs two people. You put your hand against the light. It is warm. It is not open. Somewhere on the " +
  "other side of it there is a boy who has not stopped looking for you, and you cannot tell him you are here.";

const ending = (over: Partial<ThresholdEnding> = {}): ThresholdEnding => ({
  title: "The Seam of Light",
  closingText: closing,
  threshold:
    "The gate opens only from both sides at once; she can hold it but cannot cross, and no one in this world can take the other end.",
  tone: "bittersweet",
  reunionSeeds: [
    { id: "kaede-swore-to-hold", statement: "Kaede swore to hold the gate open as long as she breathes." },
    { id: "ribbon-left-behind", statement: "Suzune's ribbon is still in his world, and it is the anchor." },
  ],
  ...over,
});

const ctx = {
  path: "her" as const,
  profile: makeProfile(),
  arc: makeArc(),
  facts: [],
  hint: "the way home",
  visitedAreaIds: ["shrine", "road", "gate"],
};

describe("checkThreshold", () => {
  it("accepts a real threshold", () => {
    expect(checkThreshold(ending(), "her")).toEqual([]);
  });

  it("rejects an ending that resolves the story", () => {
    const resolved = ending({
      closingText: closing.replace("It is not open.", "The door opens and they are together again."),
    });
    expect(checkThreshold(resolved, "her").join(" ")).toMatch(/threshold/i);
  });

  it("rejects a vague obstacle", () => {
    expect(checkThreshold(ending({ threshold: "She needs help." }), "her").join(" ")).toMatch(
      /name what the crossing/,
    );
  });

  it("rejects duplicate reunion seed ids", () => {
    const dup = ending({
      reunionSeeds: [
        { id: "same", statement: "One." },
        { id: "same", statement: "Two." },
      ],
    });
    expect(checkThreshold(dup, "her").join(" ")).toMatch(/duplicate/);
  });

  it("expects his threshold to be about not reaching her", () => {
    const wrong = ending({ threshold: "A locked cabinet in the records office." });
    expect(checkThreshold(wrong, "his").join(" ")).toMatch(/reach her/);
  });
});

describe("buildThresholdUser", () => {
  it("states the side's rule so the model cannot miss it", () => {
    expect(buildThresholdUser(ctx)).toContain("cannot cross alone");
    expect(buildThresholdUser({ ...ctx, path: "his" })).toContain("cannot reach her alone");
  });
});

describe("writeThreshold", () => {
  it("returns a valid ending first try", async () => {
    const model = new FakeModelClient();
    model.push(ending());
    const result = await writeThreshold(model, ctx);
    expect(result.title).toBe("The Seam of Light");
    expect(model.calls).toHaveLength(1);
  });

  it("feeds the rejection back and retries", async () => {
    const model = new FakeModelClient();
    model.push(ending({ threshold: "She needs help." }));
    model.push(ending());
    const result = await writeThreshold(model, ctx);
    expect(result.threshold).toContain("both sides");
    expect(model.calls[1]?.feedback.join(" ")).toMatch(/must NOT resolve/);
  });

  it("still closes the playthrough when retries are exhausted", async () => {
    const model = new FakeModelClient();
    const bad = ending({ threshold: "She needs help." });
    model.push(bad, bad, bad);
    const logs: string[] = [];
    // A player who reached the end must always get an ending, even a flawed one.
    const result = await writeThreshold(model, ctx, { log: (m) => logs.push(m) });
    expect(result).toBeTruthy();
    expect(logs.join(" ")).toMatch(/retries exhausted/);
  });
});
