# Playtesting However Far (text-era prototype, pre-title "Unwritten")

How to run the game yourself, what should happen at each step, and how to tell whether
it's actually working. No prior knowledge of the codebase needed.

---

## 1. Setup (once)

You need **Node 20+** and an **OpenAI API key**.

**Everything below runs from the repo root** — the directory containing `package.json`,
`packages/`, and `apps/`. Note it's nested one level down:

```sh
cd C:\Users\jrao03\Documents\vscode\personal\Game_project\game-project
```

> If you see `npm error enoent Could not read package.json`, you're one directory too
> high. `Game_project` is just a container; the project is `Game_project\game-project`.

```sh
npm install
cp .env.example .env
```

Open `.env` and put your key on the `OPENAI_API_KEY=` line. That file is gitignored — the
key stays on your machine, is only ever read server-side, and the browser never sees it.

Check it works before playing:

```sh
npm run smoke -w @howeverfar/director
```

Two quick API calls, a fraction of a cent. You should see `Both tiers OK`. If it fails
here, nothing else will work — see [Troubleshooting](#troubleshooting).

---

## 2. Run it

### In the browser (recommended — this is the real client)

Two terminals, both from the repo root:

```sh
# terminal 1
npm start -w @howeverfar/server     # → "Server listening at http://0.0.0.0:3001"

# terminal 2
npm run dev -w @howeverfar/web      # → "Local: http://localhost:5173/"
```

Open **http://localhost:5173**. Leave both running while you play; the server holds your
key and does all the authoring.

### In the terminal (faster to iterate on)

One terminal, from the repo root:

```sh
npm start -w @howeverfar/play-cli
```

Pick choices by typing their **number**. Type **anything else** to act freely in your own
words. Type **`/quit`** to save and exit.

---

## 3. What should happen

### The Anchor — three fixed scenes, identical for everyone

Every playthrough opens with the same hand-written scenes. These are **free and
instant** — no model is called, nothing is generated yet.

| # | Scene | What you do |
|---|---|---|
| 1 | *The Road at Dawn* | You wake on a road with no memory. A stranger sits at a fire nearby, and there's a wooden box with **your name burned into the lid**. |
| 2 | *Tea With a Stranger* | The stranger is Marlow. There's bread, and talk of fires in the east that leave no bones. |
| 3 | *What the Box Holds* | The box opens. You take **one** of: a knife, a key, a compass, or a letter in your own handwriting. |

The game is reading you the whole time — whether you're aggressive or cautious, generous
or guarded, whether you talk or act, and above all **anything you type freely**. Free text
is the strongest signal it has.

> During the Anchor, free text gets acknowledged in-fiction but doesn't change the scene.
> That's deliberate: the opening is fixed so that every player's profile is measured
> against the same situation. It's recorded and it counts.

### Then the game gets written

The moment you take an item from the box, the Director wakes up:

```
  …the world is being written…
```

**This first turn is the slow one — expect 30–90 seconds.** Six model calls happen back to
back: it profiles you, designs a complete story arc with three acts and a planned ending,
picks the universe's colour palette, writes your first real scene, checks it against
established facts, and extracts new facts into the canon.

Every turn after that is one scene: writer, continuity check, fact extraction. Noticeably
quicker.

In the terminal you'll see the Director narrate its own decisions:

```
  [director] anchor complete — profiling player and designing arc
  [director] profile: gothic detective mystery · arc: On the Old Road, the player wakes…
```

---

## 4. What to look for

This is the part that matters. The system is working if:

**The genre fits how you played.** Play scene 2 by pressing Marlow about the fires and
examining things carefully, and you should land somewhere investigative. Play it armed and
blunt and you should get something harsher. It is *not* supposed to announce this — you
should never see the word "genre" in the fiction.

**Your Anchor carries forward.** Marlow, the box, the eastern smoke, and the bell should
all still exist and still matter, reinterpreted to fit. The item you took should turn out
to be *important*, not decorative.

**Nothing contradicts.** Someone established as dead stays dead; a burned thing stays
burned; names don't drift. If the story does change something established, it should change
it **in the fiction** — things burn, people lie — rather than quietly retconning it.

**Free text gets taken seriously.** Try something the choices didn't offer. Try something
strange. It should get a real consequence, not a deflection.

**Art appears after the genre is decided.** Small pixel-art panels show up in the browser
client once the universe has a look. They're procedural placeholders for now (a real image
model plugs into the same seam later), so judge whether the *palette and mood* fit the
genre, not whether the art is good.

**Two playthroughs diverge.** The strongest test: play the Anchor two very different ways
and compare. This is the thing the whole project rests on.

### Things worth trying to break

- Refuse to cooperate. Say you're leaving, or do nothing.
- Reference something from the Anchor much later and see if it's remembered.
- Try to end the story early — the game should give the attempt real weight and then turn
  you back toward the work the arc still owes. Endings only unlock in the final act.
- Type something absurd and see whether the world absorbs it or breaks character.

---

## 5. Saving, ending, publishing

Your progress saves **after every turn**, automatically. Nothing is lost if you close the
window or hit `/quit`.

Everything lives in `~/.however-far/` (`C:\Users\<you>\.however-far\` on Windows):

```
sessions/   one JSON file per playthrough
bundles/    published universes
assets/     cached art
```

To resume:

```sh
npm start -w @howeverfar/play-cli -- --sessions        # list them
npm start -w @howeverfar/play-cli -- --resume <id>
```

In the browser, saved sessions appear on the start screen under **Resume**.

**Reaching an ending takes a while** — the arc is designed for roughly 20–40 scenes. When
you do finish, you'll be offered to publish the universe to your local library. Publishing
it lets you (or anyone, eventually) **replay the same world and story arc while the
moment-to-moment scenes are written fresh** — that's the library concept, testable locally
today via `--library` and `--replay`, or the Library section of the start screen.

If you want to reach an ending quickly for testing rather than playing 40 scenes, say so
and I'll add a debug flag to jump the arc to its final act.

---

## 6. Cost

The Anchor is free. After that, roughly:

- **Anchor exit:** 6 calls (1 turn)
- **Each later turn:** 3 calls — one on the strong model, two on the cheap one

A short test session is cents. A full playthrough to an ending is dollars, not tens of
dollars. `/quit` any time; nothing is charged for a session you don't continue.

Models are set in `packages/director/src/config.ts` and overridable from `.env`:

```sh
npm run models -w @howeverfar/director    # what your key can actually reach
```

---

## Troubleshooting

**`No model API key configured`** — `.env` isn't being found or the line is malformed. It
must sit at the repo root next to `package.json`, and read `OPENAI_API_KEY=sk-...` with no
quotes and no spaces around the `=`.

**Browser shows a 503 when starting a game** — the *server* has no key. It's the server
process that needs `.env`, not the browser. Restart terminal 1 after editing `.env`;
environment variables are read at startup.

**Browser start screen loads but every action errors** — the server probably isn't
running, or isn't on 3001. Check terminal 1. The web client proxies `/api` to
`localhost:3001` (configured in `apps/web/vite.config.ts`).

**First turn seems frozen** — give it 90 seconds. Six sequential model calls, several
using reasoning. If the terminal is printing `[director]` lines, it's working.

**`model output was cut off`** — a role hit its token ceiling. Raise `maxTokens` for that
role in `packages/director/src/config.ts`.

**Schema validation errors in the log, but play continues** — working as designed. Invalid
output is rejected and regenerated with the errors fed back, up to twice. You should never
see a broken scene; you may see the retry.

**`npm error enoent Could not read package.json`** — wrong directory. Run from
`Game_project\game-project`, not `Game_project`.

**`cp` is not recognized** (Windows PowerShell) — use `copy .env.example .env`, or just
copy the file in Explorer.

**Something else** — run `npm test` from the root. 101 tests, no API key needed. If those
pass, the problem is configuration or the API, not the game logic.

---

## Reporting what you find

Most useful to capture:

1. **What you did** — which Anchor choices, and anything you typed freely.
2. **What the game became** — the `[director] profile:` line names the genre it picked.
3. **Where it broke or felt wrong** — contradictions, forgotten details, generic prose,
   scenes that ignored what you did, or pacing that dragged.

The session file in `~/.however-far/sessions/` contains the whole playthrough — profile,
arc, canon, and every scene — so pointing at one is often faster than describing it.
