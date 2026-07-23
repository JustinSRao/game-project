import type { ConvoChoice, DialogueLine } from "@howeverfar/schema";

/**
 * DOM overlay for narration, dialogue, choices, HUD, and the "unwritten"
 * veil. Pure presentation: it renders what it is given and reports which key
 * the player pressed; all consequences are decided by the engine (ADR-0010).
 */

const panel = document.getElementById("panel") as HTMLDivElement;
const veil = document.getElementById("veil") as HTMLDivElement;
const hudArea = document.getElementById("hud-area") as HTMLSpanElement;
const hudPrompt = document.getElementById("hud-prompt") as HTMLSpanElement;
const say = document.getElementById("say") as HTMLDivElement;
const sayInput = document.getElementById("say-input") as HTMLInputElement;

export type PanelState =
  | { mode: "closed" }
  | { mode: "narration"; text: string }
  | {
      mode: "dialogue";
      lines: DialogueLine[];
      index: number;
      choices: ConvoChoice[];
      speakerNames: Map<string, string>;
      entityId: string;
    }
  | { mode: "choices"; choices: ConvoChoice[]; entityId: string }
  | { mode: "reply"; speaker: string; text: string };

let state: PanelState = { mode: "closed" };

export function panelState(): PanelState {
  return state;
}

export function setHud(areaName: string, prompt: string): void {
  hudArea.textContent = areaName;
  hudPrompt.textContent = prompt;
}

function render(): void {
  panel.classList.toggle("open", state.mode !== "closed");
  panel.innerHTML = "";
  if (state.mode === "closed") return;

  const add = (cls: string, text: string): HTMLDivElement => {
    const el = document.createElement("div");
    el.className = cls;
    el.textContent = text;
    panel.appendChild(el);
    return el;
  };

  if (state.mode === "narration") {
    add("line", state.text);
    add("hint", "space · continue");
    return;
  }
  if (state.mode === "reply") {
    add("speaker", state.speaker);
    add("line", state.text);
    add("hint", "space · continue");
    return;
  }
  if (state.mode === "dialogue") {
    const line = state.lines[state.index];
    if (!line) return;
    add(
      "speaker",
      line.speakerId === "narrator"
        ? ""
        : (state.speakerNames.get(line.speakerId) ?? line.speakerId),
    );
    add("line", line.text);
    add(
      "hint",
      state.index < state.lines.length - 1 || state.choices.length > 0
        ? "space · continue"
        : "space · close",
    );
    return;
  }
  // choices
  const wrap = document.createElement("div");
  wrap.className = "choices";
  state.choices.forEach((choice, i) => {
    const el = document.createElement("div");
    el.className = "choice";
    const key = document.createElement("span");
    key.className = "key";
    key.textContent = String(i + 1);
    el.appendChild(key);
    el.appendChild(document.createTextNode(choice.label));
    wrap.appendChild(el);
  });
  panel.appendChild(wrap);
  add("hint", "1–" + String(state.choices.length) + " · choose");
}

export function showNarration(text: string): void {
  state = { mode: "narration", text };
  render();
}

export function showDialogue(
  lines: DialogueLine[],
  choices: ConvoChoice[],
  speakerNames: Map<string, string>,
  entityId: string,
): void {
  if (lines.length === 0 && choices.length > 0) {
    state = { mode: "choices", choices, entityId };
  } else if (lines.length === 0) {
    state = { mode: "closed" };
  } else {
    state = { mode: "dialogue", lines, index: 0, choices, speakerNames, entityId };
  }
  render();
}

export function showReply(speaker: string, text: string): void {
  state = { mode: "reply", speaker, text };
  render();
}

export function closePanel(): void {
  state = { mode: "closed" };
  render();
}

/** Advance on space. Returns the choices to offer when lines run out mid-dialogue. */
export function advancePanel(): { openChoices?: { choices: ConvoChoice[]; entityId: string } } {
  if (state.mode === "narration" || state.mode === "reply") {
    closePanel();
    return {};
  }
  if (state.mode === "dialogue") {
    if (state.index < state.lines.length - 1) {
      state = { ...state, index: state.index + 1 };
      render();
      return {};
    }
    if (state.choices.length > 0) {
      const next = { choices: state.choices, entityId: state.entityId };
      state = { mode: "choices", ...next };
      render();
      return { openChoices: next };
    }
    closePanel();
    return {};
  }
  return {};
}

/** The choice at a number key (1-based), if the panel is offering choices. */
export function choiceAt(n: number): { choice: ConvoChoice; entityId: string } | undefined {
  if (state.mode !== "choices") return undefined;
  const choice = state.choices[n - 1];
  return choice ? { choice, entityId: state.entityId } : undefined;
}

/**
 * The free-text line: the player speaking in their own words. Keystrokes stop
 * here (never reach Phaser) while it is open; Enter submits, Escape cancels.
 */
let sayCallback: ((text: string) => void) | undefined;

sayInput.addEventListener("keydown", (event) => {
  event.stopPropagation();
  if (event.key === "Enter") {
    const text = sayInput.value.trim();
    if (text.length === 0) return;
    const submit = sayCallback;
    closeSay();
    submit?.(text);
  } else if (event.key === "Escape") {
    closeSay();
  }
});

export function openSay(onSubmit: (text: string) => void): void {
  sayCallback = onSubmit;
  sayInput.value = "";
  say.classList.add("open");
  sayInput.focus();
}

export function closeSay(): void {
  sayCallback = undefined;
  say.classList.remove("open");
  sayInput.blur();
}

export function sayOpen(): boolean {
  return say.classList.contains("open");
}

/** A keyed menu on the veil (boot screen: continue a save / start fresh). */
export function showMenu(
  title: string,
  body: string,
  options: readonly { key: string; label: string }[],
): void {
  showVeil(title, body, "");
  const inner = veil.querySelector(".inner");
  if (!inner) return;
  const wrap = document.createElement("div");
  wrap.className = "options";
  for (const option of options) {
    const el = document.createElement("div");
    el.className = "option";
    const key = document.createElement("span");
    key.className = "key";
    key.textContent = option.key;
    el.appendChild(key);
    el.appendChild(document.createTextNode(option.label));
    wrap.appendChild(el);
  }
  const hint = inner.querySelector(".hint");
  inner.insertBefore(wrap, hint);
}

export function showVeil(title: string, body: string, hint: string): void {
  veil.classList.add("open");
  veil.innerHTML = "";
  const inner = document.createElement("div");
  inner.className = "inner";
  const h = document.createElement("h1");
  h.textContent = title;
  const p = document.createElement("p");
  p.textContent = body;
  const small = document.createElement("div");
  small.className = "hint";
  small.textContent = hint;
  inner.append(h, p, small);
  veil.appendChild(inner);
}

export function hideVeil(): void {
  veil.classList.remove("open");
}

export function veilOpen(): boolean {
  return veil.classList.contains("open");
}
