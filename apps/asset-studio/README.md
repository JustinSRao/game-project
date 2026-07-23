# Asset Studio

The Asset Studio is how art gets into *However Far*. Every image in the game —
characters, tiles, portraits, items — has to look like it belongs to one game, even
though it comes from different places (free asset packs, AI generation, hand-drawn
pixels). The Studio makes that happen: you feed it any PNG, and it forces the image
onto the game's pixel grid and color palette, then checks it against the rules.
That process is called **"the gate"**, and nothing gets into the game without
passing it.

You don't need to know anything about the code to use it.

## Using the Studio (the easy way — in your browser)

**1. Start it.** Open a terminal in the project folder (`game-project/`) and run:

```sh
npm run studio -w @howeverfar/asset-studio
```

(First time on a new machine? Run `npm install` once before this.)

**2. Open it.** Go to **http://localhost:5175** in your browser. The page keeps
working as long as that terminal stays open; press `Ctrl+C` in the terminal to
stop it.

**3. Pick your settings** at the top of the page:

- **Style bible** — which world the art belongs to. Each world has its own locked
  color palette and pixel size, shown as little color swatches under the dropdown.
  Choose *her-world* for the fantasy world, *his-world* for the real world.
- **Asset kind** — what the image is:
  | Kind | Means | Special rule |
  |---|---|---|
  | sprite | a character | must have a transparent background |
  | tile | a ground/wall square | must be exactly the grid size, e.g. 32×32 |
  | portrait | a face close-up | must have a transparent background |
  | item | a pickup object | must have a transparent background |
- **Validate only** — leave this OFF normally. Turn it ON only if your image has
  already been through the gate before and you just want to re-check it.

**4. Drop PNG files onto the dashed box** (or click it to browse). You can drop
several at once. Each file gets a card showing:

- **Before / after** — your original next to the gated version (shrunk to the
  pixel grid, every color snapped to the palette). The checkered background shows
  which parts are transparent.
- **PASS or FAIL** — whether the result follows the rules, with each problem
  explained in plain terms. Warnings (yellow) mean "look at this, might be fine";
  errors (red) mean it can't go in the game as-is.
- **A download button** — saves the gated PNG to your computer. That downloaded
  file is the game-ready version.

**Typical fixes when something FAILs:**

- *"has no transparent background"* — the image is a full rectangle of pixels.
  Sprites/portraits/items need the area around the subject erased to transparent
  (any image editor can do this, or ask Claude to chroma-key it).
- *"tile must be exactly NxN"* — tiles have to be perfectly square at the grid
  size; crop or resize the source image to a square first.
- *"colors outside the palette"* — only appears in validate-only mode; run it
  through normally and the gate will snap the colors for you.

## Using the Studio from the command line (for scripts and AI agents)

The same gate, no browser — this is what Claude Code / Codex use, and it works in
shell scripts too:

```sh
# Normalize raw art onto the grid + palette:
npm start -w @howeverfar/asset-studio -- normalize raw/*.png \
  --style styles/her-world.draft.json --out normalized/

# Check finished art against the rules:
npm start -w @howeverfar/asset-studio -- validate normalized/*.png \
  --style styles/her-world.draft.json --kind sprite --json
```

Exit codes: `0` pass · `1` failed validation · `2` bad arguments or unreadable file.
Add `--json` for machine-readable output.

You can also just ask Claude in a session: *"make me a village tileset for her
world"* — the agent will ask clarifying questions, generate or import the art, and
run this same gate before showing you anything. (Playbook: `.claude/skills/asset-studio`.)

## What the gate actually does (in order)

1. **Pixelize** — shrinks the image so its longer side equals the style's grid
   size (e.g. 32 pixels), keeping hard pixel edges.
2. **Palette lock** — recolors every visible pixel to the nearest color in the
   world's palette (max 32 colors). This is the step that makes art from wildly
   different sources look like one game.
3. **Outline** — adds a 1-pixel dark outline around the subject if the style
   calls for it.
4. **Validate** — checks size, palette compliance, transparency, and how much of
   the canvas the subject fills.

## Style bibles

The files in `styles/` define each world's look: its palette, grid size, and
outline rule. They are currently **drafts** (her-world starts from the free
Sweetie-16 palette) — final palettes get locked when real art production starts,
and locking is a recorded decision. If an asset should exist in both worlds, it
goes through the gate once per world.

## Coming next (ROADMAP Phase 5)

Importing free CC0 asset packs (with license bookkeeping), a browsable catalog of
everything that has passed the gate, AI sprite generation, and the gpt-image-2
provider — all through this same gate, and every AI generation recorded in the
cost ledger (ADR-0018).
