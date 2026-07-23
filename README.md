# However Far

A **top-down 2D pixel-art RPG created in real time, by AI, as you play it** — built on a
fixed, hand-authored story.

Two high-school sweethearts, next-door neighbors, meant for each other. One day, on the
walk home, the girl disappears. The player chooses a path: play as **her** — summoned to
a fantasy world for her dormant power, fighting to escape home — or as **him** — the only
person on Earth who remembers she ever existed. The story's skeleton
([docs/STORY.md](docs/STORY.md)) is fixed forever; *everything between its beats* — the
maps, characters, quests, encounters, dialogue, and art — is authored live by an AI
Director in response to how you play. The true ending is a cross-platform multiplayer
reunion between one player from each path.

> **Status:** playable start to finish. The prologue, both solo paths, and the
> two-player **Reunion** finale are all in (ROADMAP Phases 0–7). The text-era prototype
> from before the pivot (ADR-0009) still runs and is what [PLAYTEST.md](PLAYTEST.md)
> covers; **[docs/REUNION.md](docs/REUNION.md)** covers the finale.

## The one rule that makes this work

> **The AI writes the game's *content*, never the game's *code*.**

At runtime the AI Director emits structured, schema-validated data (scenes, entities,
dialogue, choices, rules, art requests). A fixed, deterministic engine renders that data.
The game can therefore never "break" from a bad generation — invalid content is rejected
and regenerated, and the player only ever sees valid game states.

## Documentation map

| Doc | What it covers |
|---|---|
| [docs/VISION.md](docs/VISION.md) | The product vision, player experience, and non-negotiables |
| [docs/STORY.md](docs/STORY.md) | The fixed story skeleton — both paths, the Reunion, the rules |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design: engine, Director, canon, art pipeline, Asset Studio |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phased plan from text prototype to the multiplayer Reunion |
| [docs/REUNION.md](docs/REUNION.md) | The shared finale: how two players pair, and how to host one |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Architecture Decision Records (why things are the way they are) |
| [PLAYTEST.md](PLAYTEST.md) | How to run the text-era prototype and what to look for |
| [CLAUDE.md](CLAUDE.md) | Instructions for AI coding agents working on this repo |

## Repository layout

```
packages/
  schema/      Zod schemas — Area DSL, mechanics, profile, arc, canon, the Reunion
  engine/      Deterministic pure rules (zero AI deps) — solo and two-player
  content/     The Prologue and STORY.md's seeds — the only hand-authored areas
  director/    The AI Director: Profiler, Architect, World Writer, Threshold, Reunion
  library/     Persistence: saves, the asset database, calls and shared worlds
  art/         Pixel-art pipeline: provider seam, palette-lock post-processing, cache
  entitlement/ Offline licence keys for the Reunion DLC (ADR-0024)
apps/
  game/        The Phaser 3 RPG client — the actual game
  server/      HTTP + WebSocket API over the Director (holds the API key; clients never do)
  asset-studio/ The asset gate: validate, normalize, import, generate, catalog
  web/         React client for the pre-pivot text prototype
  play-cli/    Terminal client for the pre-pivot text prototype
docs/          Vision, story, architecture, roadmap, the Reunion, decision records
.claude/       Skills and instructions for AI-assisted development
```

## Play it

```sh
npm install
cp .env.example .env                    # then put your OPENAI_API_KEY in it
```

`.env` is gitignored — the key never leaves your machine and is only ever read
server-side. The Director works against either OpenAI (default) or Anthropic; see
[ADR-0008](docs/DECISIONS.md).

The game — two terminals:

```sh
npm start -w @howeverfar/server          # API on :3001 (the key lives here, not in the browser)
npm run dev -w @howeverfar/game          # the RPG client, proxying /api to the server
```

Walk the prologue, choose a door at the crossing, and the Director writes the rest.
Without a server the prologue still plays and generate-doors show the "unwritten" veil.

### The Reunion

A solo path ends at a **threshold**, not a resolution — she reaches the way home and
cannot cross alone; he learns the truth and cannot reach her alone. The game is beaten by
two players, one who finished each side, playing the last act together. One of them hosts:

```sh
OPENAI_API_KEY=... HOWEVERFAR_LICENSE_SECRET=... npm start -w @howeverfar/server
```

Finish a path, choose **reach for them**, and give the name and address of the player you
want to finish it with. They do the same, for you. When both calls answer each other, the
shared world opens. Full instructions, the fiction behind it, and the licensing:
**[docs/REUNION.md](docs/REUNION.md)**.

### The pre-pivot text prototype

```sh
npm start -w @howeverfar/play-cli                    # new playthrough
npm start -w @howeverfar/play-cli -- --sessions      # list saves · --resume <id> to continue
npm start -w @howeverfar/play-cli -- --library       # published universes · --replay <path>
```

Finish a game and you'll be offered to publish it to your local library, where it can be
replayed — same world and story arc, freshly generated moment-to-moment.

Full walkthrough, including what each step should look like: **[PLAYTEST.md](PLAYTEST.md)**.

## Development

```sh
npm install
npm run typecheck                    # all workspaces
npm test                             # all workspaces — no API key needed, the Director
                                     # is tested through a fake model client
npm run models -w @howeverfar/director  # list models your key can actually reach
npm run eval -w @howeverfar/play-cli    # live go/no-go demo (costs real tokens)
```
