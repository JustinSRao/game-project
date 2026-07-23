# REUNION.md — the shared finale

The Reunion is the endgame described in [STORY.md](STORY.md): a solo playthrough of
either path ends at a **threshold, not a resolution**, and the only way past it is a
player who finished the other side. This file is the part STORY.md leaves open — *how
two people find each other, and what happens when they do.*

> **Owner note.** STORY.md is sacred and was not touched. Everything here is authored
> content sitting next to it, written to fit its rails, and it is the owner's to keep,
> rewrite, or cut. Two things in particular are inferences rather than STORY.md facts,
> and are flagged inline below: **the seam is the railway underpass**, and **the bell is
> a call that can be made in either direction**.

---

## The Call

Two players have to reach for each other. Neither can drag the other across.

Mechanically this is a mutual invitation keyed on email addresses. In the fiction it is
the same gesture from both sides, wearing each path's clothes:

**Her side — ring it.** She has reached the way home and it will not open for one pair
of hands. But the bell that summoned her was never a summons: it was a *call*, and a
call can be made in the other direction. She rings it toward a name.

*(Inference: STORY.md fixes that Suzune heard a bell only she could hear, and that her
name — 鈴音, "bell-sound" — is why. That the bell is directional, and can be rung back,
is this document's addition.)*

**His side — write her back in.** Everything that erased her worked through records: a
name struck off one list, then every list, until they all agreed with each other and not
with him. So he puts one back — a name, and an address that has to acknowledge it. If
she is writing his down at the same moment, the two entries contradict, and something
has to give.

Both sides are asked for exactly four things, because both gestures need exactly the
same four:

| The form asks | Why the fiction needs it | Why the mechanism needs it |
|---|---|---|
| The name they know you by | Who is ringing / who signed the entry | Display name in the shared world |
| Where you can be reached | Where an answer would arrive | Your identity for matching |
| Who you are reaching for | The name in the bell / on the register | Display only |
| Where they can be reached | Where it is rung toward | Their identity for matching |

Two calls **answer** each other when each names the other's address and they come from
opposite paths (`callsAnswer`, `packages/schema/src/reunion.ts`). Names are shown and
never matched on — people spell each other's names however they like, and a reunion
should not fail on a missing accent. Two players who both finished her path have nothing
to cross toward, and a call to yourself is refused.

A call that nobody has answered **waits**, costs nothing, and can be replaced by a newer
one from the same address (a fixed typo, a second playthrough). The world is not planned,
and the first area is not written, until both sides have reached.

## What crosses

Not the save file. A `PlaythroughExport` — profile, arc, canon, the people met, the
final character sheet, the path ending with its `reunionSeeds`, and the road as prose.
Small enough to travel over any channel, and it is what the Call carries.

Both playthroughs' canon is merged **side-keyed and unreconciled**. Two histories of the
same weeks from opposite sides are *supposed* to disagree about what was visible;
flattening that would erase the thing the finale exists to put back together. The
Reunion's prompts are told both are true.

## The finale

- One shared arc, planned from both histories: two acts, roughly 5–9 areas.
- Every area must need both of them. A scene either could have solved alone is a failed
  scene, and the prompt says so.
- The interface stops lying. `metaFx` (ADR-0015) is Path B only and the engine enforces
  it, so the Reunion — which is neither path — is where the erasure ends.
- The ending **resolves**. It is the only one in the game that is allowed to, and the
  guard on it is the mirror of the Threshold Writer's: that one rejects an ending that
  resolves, this one rejects an ending that pays off only one side's seeds.

*(Inference: the shared world opens at **the seam** — the railway underpass on his side,
whatever her world made of the same place on hers. STORY.md fixes only that she vanished
there.)*

## Running it — self-hosted

One of the two players hosts. There is no service, and under
[ADR-0013](DECISIONS.md#adr-0013-zero-spend-rule--owner-approved-exceptions-for-distribution)
there is not going to be one.

```bash
# On the host's machine
OPENAI_API_KEY=...                  # the finale is written live
HOWEVERFAR_LICENSE_SECRET=...       # the key authority (see below)
npm run start -w @howeverfar/server
```

The other player points their client at the host's address. Both need to reach it — a
LAN, a VPN, or a tunnel; whatever the two of them can arrange. The guest's finished
playthrough travels inside their Call, so it does not matter which machine it was played
on.

Then, from either client, after finishing a path:

1. The ending offers **reach for them**.
2. Fill in the Call. Send it.
3. When the other side sends theirs, the world opens for both.

A shared world in progress appears at the top of the boot menu, so either player can
step back in.

## The DLC

The Reunion is the paid chapter ([ADR-0024](DECISIONS.md#adr-0024-the-reunion-is-paid-for-and-the-licence-is-a-receipt-not-a-lock)).
Both players are checked, not just the host: one purchase does not buy two seats.

Keys are minted offline from the buyer's email address:

```bash
HOWEVERFAR_LICENSE_SECRET=... npm run mint -w @howeverfar/entitlement -- buyer@example.com
```

Whatever storefront takes the money only has to put that string in the receipt. Set
`HOWEVERFAR_REUNION_UNLOCKED=1` to play the finale without a key while developing; a
build with no secret configured **refuses** rather than gives the DLC away.

**This is a receipt, not a lock**, and the code says so out loud: anyone hosting their
own server can read the secret out of their own build. It is proportionate to a
two-player finale that both people have to finish an entire playthrough to reach.
