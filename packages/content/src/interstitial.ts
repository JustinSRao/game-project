import type { StoryPath, TurnStage } from "@howeverfar/schema";

/**
 * The Interstitial — what the player reads while the world is being written
 * (Phase 6 latency, the in-fiction half).
 *
 * A generate-portal can take minutes. Speculation removes that wait when the
 * player walks at a door; when it cannot, something has to be on the screen,
 * and a spinner would be the only place in the game that admits there is a
 * machine behind it. So this is authored content, in the game's own voice,
 * shown one line at a time — the wait dressed as the moment it actually is:
 * standing on a threshold with the far side not yet decided.
 *
 * Hand-written, never generated (CLAUDE.md invariant 4 in spirit: what the
 * player reads at the seams of the game is ours, not the model's). Lines are
 * chosen deterministically from the area id, so a given door always says the
 * same thing — a wait that reads differently on a retry looks like a glitch.
 */

export interface Interstitial {
  /** The heading held for the whole wait. */
  readonly title: string;
  /** Shown in order, one at a time, looping if the wait outlasts them. */
  readonly lines: readonly string[];
}

const CROSSING: Interstitial = {
  title: "The crossing",
  lines: [
    "You have chosen. The evening behind you closes like a book someone else is holding.",
    "Somewhere, a bell is being rung for the second time.",
    "What comes next has never happened to anyone. It is being decided out of what you did tonight — the things you looked at, the things you said, the hand you took or did not take.",
    "Hold still. This part takes as long as it takes.",
  ],
};

const HER_WRITING: Interstitial = {
  title: "Beyond the door",
  lines: [
    "The far side has not decided what it is yet.",
    "There is a sound like a held breath, and under it, faintly, a bell — the one that only you can hear.",
    "Ground arrives first. Then the light, deciding what hour it wants to be.",
    "Somewhere ahead, people who have never met you are being given reasons to.",
    "You have been in stranger rooms than the one that is about to exist. Not many.",
    "It is still further than it was this morning. It is still not far enough that you would stop.",
  ],
};

const HIS_WRITING: Interstitial = {
  title: "The next thing that happens",
  lines: [
    "You go on, because the alternative is standing still in a world that has already moved on without her.",
    "The street rearranges itself very slightly while you are not looking at it. It has been doing that for a while now.",
    "You check your pocket. The ribbon is there. It is always there. It is the only thing that agrees with you.",
    "Somewhere a record is being amended. A name is being taken out of a list it was never on.",
    "You are the last place she still exists. That is a heavy thing to be, and you are carrying it anyway.",
    "Keep going. She would.",
  ],
};

const HER_CLOSING: Interstitial = {
  title: "The last of it",
  lines: [
    "Everything you did is being counted now — every ally, every road, every thing it cost.",
    "This is where it has all been going.",
  ],
};

const HIS_CLOSING: Interstitial = {
  title: "The last of it",
  lines: [
    "Everything you found is being laid out in order, the way you always meant to lay it out for someone who would believe you.",
    "This is where it has all been going.",
  ],
};

const IMPROVISING: Interstitial = {
  title: "",
  lines: ["The world takes a moment with what you did."],
};

/** Fallback for a stage nobody dressed — never shown empty. */
const PLAIN: Interstitial = {
  title: "A moment",
  lines: ["The story is deciding."],
};

export function interstitialFor(path: StoryPath, stage: TurnStage): Interstitial {
  switch (stage) {
    case "profiling":
    case "planning":
      return CROSSING;
    case "writing":
    case "arriving":
      if (path === "her") return HER_WRITING;
      if (path === "his") return HIS_WRITING;
      return CROSSING;
    case "closing":
      return path === "her" ? HER_CLOSING : HIS_CLOSING;
    case "improvising":
      return IMPROVISING;
    default:
      return PLAIN;
  }
}

/**
 * Where in an interstitial's lines to start, from the id of the area being
 * left. Same door, same opening line, every time.
 */
export function interstitialStart(seed: string, length: number): number {
  if (length <= 0) return 0;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return (h >>> 0) % length;
}
