import {
  BUNDLE_FORMAT_VERSION,
  DSL_VERSION,
  SessionSave,
  StoryArc,
  UniverseBundle,
  type SceneSpec,
} from "@unwritten/schema";
import { Director } from "@unwritten/director";

export class BundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleError";
  }
}

export interface ExportMeta {
  title: string;
  description: string;
  creator?: string;
}

/** Export a finished playthrough as a publishable Universe Bundle (ADR-0006). */
export function exportBundle(session: SessionSave, meta: ExportMeta): UniverseBundle {
  if (session.phase !== "ended") {
    throw new BundleError("only finished playthroughs can be exported");
  }
  if (!session.profile || !session.arc) {
    throw new BundleError("session is missing profile or arc");
  }
  const playedScenes = session.state.visitedSceneIds
    .map((id) => session.scenes[id])
    .filter((s): s is SceneSpec => !!s);
  return UniverseBundle.parse({
    manifest: {
      formatVersion: BUNDLE_FORMAT_VERSION,
      dslVersion: DSL_VERSION,
      title: meta.title,
      description: meta.description,
      createdAt: new Date().toISOString(),
      ...(meta.creator ? { creator: meta.creator } : {}),
    },
    profileAtAnchorExit: session.profile,
    arc: session.arc,
    canon: session.canon,
    ...(session.styleBible ? { styleBible: session.styleBible } : {}),
    playedScenes,
  });
}

/**
 * Reset a creator's arc so a new player can earn it: beats back to pending,
 * setups back to planted, story starts from act one. The arc's *content* —
 * premise, acts, beats, planned ending — is the universe's identity and is
 * never changed by a replay.
 */
export function prepareArcForReplay(arc: StoryArc): StoryArc {
  const first = arc.acts[0];
  if (!first) throw new BundleError("bundle arc has no acts");
  return {
    ...arc,
    currentActId: first.id,
    acts: arc.acts.map((a) => ({
      ...a,
      beats: a.beats.map((b) => ({ ...b, status: "pending" as const })),
    })),
    setups: arc.setups.map((s) => ({ ...s, status: "planted" as const })),
  };
}

/**
 * Start a replay session: the new player plays the Anchor themselves (their
 * signals still get recorded), but the universe's profile, arc, and canon are
 * loaded as fixed constraints — same story, their own playthrough.
 */
export function newReplaySession(
  bundle: UniverseBundle,
  id = `replay-${Date.now()}`,
): SessionSave {
  const base = Director.newSession(id);
  return {
    ...base,
    profile: bundle.profileAtAnchorExit,
    arc: prepareArcForReplay(bundle.arc),
    canon: [...bundle.canon],
    // The look is part of the universe's identity, not the playthrough.
    ...(bundle.styleBible ? { styleBible: bundle.styleBible } : {}),
    replayOfBundle: bundle.manifest.title,
  };
}
