# Roadmap

Phases are cumulative; each ends with something playable. Don't start a phase's polish
before the previous phase's loop is proven.

> **2026-07-22 — the pivot (ADR-0009).** Phases 0–3 below were built for the original
> "genre-neutral adaptive novel" premise and are kept as the historical record. The
> systems they produced (schema/validation, deterministic engine, Director pipeline,
> canon ledger, profiling, art post-processing, server) are the foundation the pivot
> builds on. The old Phase 4 (public library) is cut per ADR-0012. New work starts at
> **Phase 4 — The Pivot**.

## Phase 0 — Foundation ✅ (pre-pivot)

- [x] Repo, docs, Claude skills, decision records
- [x] `packages/schema`: Scene DSL v0 (Zod); `packages/engine`: pure tested reducer;
      golden fixtures

## Phase 1 — The text loop ✅ (pre-pivot)

- [x] Anchor fixtures; Director v0 (Profiler + Scene Writer) with structured outputs,
      validation, regeneration; Canon Ledger v0; playable CLI
- [x] Go/no-go demo PASSED 2026-07-22: three play styles through one anchor produced
      three different games — **the core premise (play-shaped generation) is proven**,
      and that result carries over to the pivot unchanged

## Phase 2 — Whole-game coherence ✅ (pre-pivot)

- [x] Architect (Story Arc, act advancement, setups→payoffs, drift revision);
      Continuity Checker; endings; session persistence
- [ ] ~~Speculative generation + streaming~~ → moved to Phase 6 (latency work belongs to
      the real game client)

## Phase 3 — Presentation (text era) ✅ (pre-pivot)

- [x] `apps/server` HTTP API; React web client; pixel post-processing pipeline
      (pixelize/quantize/outline, content-hash cache, placeholder-first); style bibles
- Remaining items absorbed into Phases 4–5 below

---

## Phase 4 — The Pivot: story skeleton + a real game on screen

Goal: walk a character through a generated map in the Phaser client, on either path.

- [x] STORY.md story bible; docs/ADRs updated for the pivot (this change)
- [x] **DSL v1:** `AreaSpec` family (`dslVersion: 1`) — tile-grid maps with collision,
      placed entities (characters/props/items) with talk/examine/use/take interactions,
      convo choices, portals with generate/area/ending transitions, `AreaGameState` +
      `AreaAction`. Legacy v0 SceneSpec stays valid until the text-era apps retire (the
      pivot's "migration": both spec families coexist during the transition)
- [x] `packages/engine` v1: pure area rules — movement legality, collision (characters
      block, items don't), reachability, interaction execution with once-semantics,
      portals, `validateAreaIntegrity`. Fully unit-tested, zero AI/network dependencies
- [x] `apps/game`: Phaser 3 client (ADR-0010) — renders AreaSpecs, grid movement,
      interaction prompts, dialogue/choice UI, HUD, the "unwritten" veil at generate
      portals. Local prologue playthrough works today; server connection pending
- [x] **Prologue v1:** five hand-authored areas (Aozora Lane → the river road → the
      underpass → the vanishing → the crossing with the two path doors), with profiling
      probes designed into choices/interactions. *Streaming the probe signals into the
      Profiler happens with the server wiring below*
- [x] Director v1 core: **World Writer** — `writeArea` generation/validation/repair loop
      (structured output → engine integrity → continuity check → feedback retries →
      degrade), path registers (her adventure / his drama), ADR-0014 naming baked into
      the prompt, STORY.md path seeds as loadable canon (`PATH_SEED_CANON`)
- [x] Server session flow v1: area-based sessions over `apps/server`
      (`/api/world-sessions` create/resume/list/action, WorldDirector behind them,
      disk persistence), and the game client opens a server session on boot with
      graceful local fallback
- [x] Playable demo — **the Phase 4 go/no-go: PASSED 2026-07-22** against the live API
      (`npm run eval:world -w @howeverfar/director`). A scripted affectionate prologue
      (took her hand, promised to find her, held on in the underpass) profiled as
      "romantic portal fantasy — earnest, intimate"; the Architect planned her path
      inside the rails (vowthread magic — binding bonds into force; the threshold
      ending needs the ribbon left in his world; a Maru-echo companion from a whisker
      on her sleeve) and the World Writer opened on a 16x14 "Ruined Moon Shrine" —
      integrity clean, named characters carrying kanji nameMeanings. Crossing latency
      ~3min with strong models — the Phase 6 speculative-generation item is the answer
- [x] Post-demo polish: free-text input UI in the game client (press T — signals
      flow now; generation response to free text arrives with streaming, Phase 6),
      and an in-client path for resuming a saved session (boot menu lists the
      three newest saves; resume falls back to new, then to local play)

## Phase 5 — Asset Studio + the asset database

Goal: a large, coherent, growing pixel-art database, operable by agents (ADR-0011).

- [x] `apps/asset-studio` CLI: `validate` / `normalize` / `import` / `sprite` /
      `generate` / `variant` / `catalog` / `preview` / `credits` — every asset passes
      `processArt` + checks (dimensions, palette, transparency, frame consistency)
      before entering the DB. Agent-operable throughout (non-interactive, exit codes,
      `--json`, `--db` for scratch databases), and the human web UI (`npm run studio`)
      now reaches the database too: gate a PNG, name it, record where it came from,
      and it's filed — owner directive (usable without an agent) intact
- [x] Asset database in `packages/library`: content-addressed blobs + queryable
      catalog (kind, tags, path/style, size, source, license, `derivedFrom`). Blobs
      dedup by hash; catalog records are keyed by logical identity, so the same pixels
      can be two entries (one asset in both worlds) without one destroying the other
- [x] CC0 ingestion: `import --source cc0` refuses without pack/author/url, `slice`
      cuts packed spritesheets (how most packs ship), `variant` recolors and restyles
      with attribution chaining via `derivedFrom`, `credits` renders the shipping
      notice from the catalog. **27 CC0 assets curated and committed** from Kenney's
      Tiny Town (her world) and RPG Urban Pack (his world) — owner directive: CC0
      only, and every pack's bundled License.txt was read before ingesting. Raw pack
      files live in `apps/asset-studio/imports/<pack>/raw/` with a `manifest.json`
      carrying attribution; `npm run seed` re-gates them, so the database stays a
      derived artifact and the outline is never applied twice
- [x] Sprite-as-data: `SpriteData` schema (palette-indexed rows, `.` transparent,
      base-32 indices), deterministic `renderSpriteData`, validated like any other
      asset. Committed specs in `apps/asset-studio/sprites/`, `npm run seed` rebuilds
      the DB from them; three starter tiles for the prologue's real world
- [x] `gpt-image-2` provider behind the existing `ImageProvider` seam — deterministic
      prompt from request+style (so the asset cache works), border-flood chroma-key,
      no post-processing inside the provider, every call recorded in the cost ledger
      before any failure path returns. `generate` refuses to spend without `--yes`
- [x] Agent workflow: `asset-studio` skill updated with the command surface,
      sprite-as-data authoring guidance, the catalog-vs-blob keying rule, and the
      instruction to actually look at the preview before declaring success
- [x] Animation support: frame-sequence assets validated as a set (`validateFrameSet`,
      `validate --frames`, `import --frames --frame-ms`), stored as ordered frame
      hashes on one catalog record

- [x] Draft palettes rebuilt as 32-colour tonal ramps per path (ADR-0020), after the
      first CC0 batch exposed that her world had no brown and his had no green, and
      that both pinned their path to a single mood. Still drafts — **locking them
      against real gameplay is the owner's call**, and stays cheap because every art
      source is committed, so a swap is one `npm run seed`

## Phase 6 — The living RPG

Goal: both paths playable start → threshold ending, feeling like a real game.

- [x] Mechanics per path (ADR-0021): **one ruleset, emphasized per path** — a character
      sheet (might/wits/heart, vigor/focus, standings) and a single `check` primitive
      that is combat on her side and investigation on his. Seeded per session so a
      playthrough replays identically. DSL + pure engine rules + client HUD; the World
      Writer prompt teaches it, including "failure must be interesting"
- [x] Quest structure: `QuestDef` on an area (title, summary, 2-5 objectives, reward
      effects) plus a log in game state. Declaring is not starting, so a job can be
      offered and declined; the engine auto-completes and pays out when the last
      objective lands, ignores repeats so rewards cannot be farmed, and writes status
      before rewards so a reward looping back to its own quest terminates. Integrity
      validation catches quest references anywhere in an area, including inside check
      branches. Quest log in the client HUD
- [x] Recurring characters: a session-level registry records everyone met, with their
      appearance **frozen at first sighting** — later areas are handed the registry and
      must reuse id, name and description verbatim. Because `characterArtRequest` is a
      pure function of that frozen string, the asset cache key is stable: same
      character, same art, forever. First appearance always wins, so no later area can
      silently repaint someone the player already knows
- [x] Latency: **speculative generation** — the client announces when the player
      walks within 4 tiles of a generate-portal (`approach` action), and the Director
      starts writing what is beyond it; stepping through reuses the work instead of
      waiting. Approach-triggered rather than speculate-every-portal because every
      unused speculation is money spent on an area nobody reads (ADR-0013); capped per
      session via `HOWEVERFAR_MAX_SPECULATIONS`, asked once per door, never during the
      prologue, and never recorded as a play signal. Failed speculations fall back to
      writing for real. **Streaming + in-fiction masking (ADR-0022):** a streaming twin
      of the action route emits `stage` events as the Director works and `chunk` events
      for prose as it is written, and the client covers the wait with the
      **Interstitial** — hand-authored per-path passages shown a line at a time, picked
      from the door being opened so the same door always opens with the same words. No
      spinner exists anywhere in the game. `streamText` is optional on `ModelClient`
      with a structured-call fallback, so nothing branches on provider support
- [x] **The Improviser:** free text is answered at last. After the crossing, typing
      something gets narration written for it, streamed as it arrives. Hard boundary:
      it returns **narration, never data** — no flags, items, doors, or quest progress,
      so a player cannot type their way into a state the engine did not authorize
      (ADR-0001). The prologue keeps its fixed acknowledgement: that evening is
      hand-authored and stays exactly as written
- [x] **Path B meta-effects (`metaFx`, ADR-0015):** a CLOSED four-effect vocabulary —
      `forgetName` (a character's name renders as static everywhere), `renameArea`,
      `relabelSave` (the save list itself lies), `hudWhisper`. **The engine enforces
      Path B only**, not the prompt and not the client: her path silently drops them
      and integrity validation rejects them, including inside a check's failure
      branch. Cosmetic by construction — a test pins that sheet, inventory, quests and
      position are untouched, so the always-playable invariant holds
- [x] Path endings: a **Threshold Writer** stage authors the finale instead of echoing
      the portal's hint — climax plus threshold in 200-500 words, a specifically named
      obstacle, and `reunionSeeds` appended to canon. STORY.md's rule is enforced with
      retries-on-rejection: a solo path ends at a **threshold, not a resolution**, and
      an ending that reads as a reunion is sent back. Retries exhausted still closes
      the playthrough — a player who reached the end always gets an ending
- [x] Cost guardrails: a **soft** per-session USD budget
      (`HOWEVERFAR_SESSION_BUDGET_USD`, default $3) tracked on the save via an
      in-process cost counter over the ADR-0018 ledger. Soft is the design — going
      over cuts the optional spend (speculation stops first, since an area nobody
      walked into is the only spend that buys nothing) and never blocks the area a
      player is standing at a door waiting for. The always-playable invariant
      outranks the budget

## Phase 7 — The Reunion (multiplayer "DLC")

Goal: the game can be beaten. See **docs/REUNION.md** for the fiction and how to run one.

- [x] Canon merge: `PlaythroughExport` — profile, arc, canon, characters, final sheet,
      the path ending with its `reunionSeeds`, and the road as prose. Not the save file:
      full AreaSpecs are tile grids the finale has no use for. Both sides' canon merges
      **side-keyed and unreconciled** — two accounts of the same weeks from opposite
      sides are supposed to disagree about what was visible, and flattening that would
      erase what the finale exists to reassemble
- [x] Pairing by mutual call (ADR-0023): both players give a name and an address for
      themselves and for whoever they are reaching for; two calls pair when each names
      the other's address, from opposite paths. Nobody is dragged across. In fiction
      her side rings the bell toward a name and his writes a name back into the register
      that erased her — the same four fields, because both gestures need them. A call
      nobody answered waits and costs nothing
- [x] Realtime sync through `apps/server` (WebSocket, `@fastify/websocket`): one socket
      per player, the role stamped from the URL so neither can act as the other, turns
      serialized per world so a shared dice counter stays meaningful and a once-only
      interaction cannot fire twice. Self-hosted — one of the two players runs the server
- [x] Two players, one world, **no second ruleset**: a player is projected into the
      ordinary single-player shape, the existing engine decides, the result is merged
      back. Position and sheet are private; the world is shared. The partner is injected
      as a blocking entity, and stops blocking the moment their client drops
- [x] The finale: a shared arc planned from both histories, areas that must need both of
      them, and **the only ending in the game allowed to resolve**. Its guard is the
      mirror of the Threshold Writer's — that one rejects an ending that resolves, this
      one rejects an ending that pays off only one side's seeds
- [x] Paid DLC (ADR-0024): offline HMAC licence keys bound to the buyer's email — the
      address the Call already needed. Works with no internet and no service, mintable
      by any storefront that can send a receipt, and **both** players are checked.
      Fails closed when unconfigured. It is a receipt, not a lock, and says so
- [ ] *Not decided:* which storefront takes the money. All of them deliver a key string,
      so all of them fit; this is an owner call, not a code change

## Phase 8 — Platforms & distribution (long-term)

- [ ] Capacitor builds: iOS, Android
- [ ] Tauri builds: Windows, macOS
- [ ] Distribution from the project owner's website (domain: owner-approved spend,
      ADR-0013); Apple Developer Program already paid by the owner. Google Play's fee
      not yet approved — ask when Android distribution becomes real

## Open questions (revisit each phase)

- How much mechanical depth does the DSL support vs. narrative resolution? (Answered
  for now by ADR-0021: one check primitive, no bespoke systems. Revisit if play proves
  it too thin.)
- ~~Do the two paths share one engine ruleset with different emphasis, or grow
  path-specific rule modules?~~ **Answered: one ruleset (ADR-0021), for the Reunion's
  sake.**
- ~~Reunion matchmaking: how do two players find each other?~~ **Answered: friends-first,
  by mutual call on email addresses (ADR-0023).** No lobby, no accounts, no strangers.
- ~~Multiplayer hosting under the zero-spend rule~~ **Answered: self-hosted (ADR-0023/0024).**
  One of the two players runs the server; the guest's finished playthrough travels inside
  their Call, so it does not matter which machine it was lived on. No service, so nothing
  to pay for and nothing to keep running.
- Does the Reunion need its own art pass? Both worlds' palettes meet in one area for the
  first time (ADR-0020 built them as two separate tonal ramps).
