import { useEffect, useState, type ReactElement } from "react";
import {
  fetchLibrary,
  fetchSessions,
  type BundleInfo,
  type CreateSessionRequest,
  type SessionInfo,
} from "../api.js";

export interface StartScreenProps {
  busy: boolean;
  error: string | null;
  onStart: (req: CreateSessionRequest) => void;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function StartScreen({ busy, error, onStart }: StartScreenProps): ReactElement {
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [library, setLibrary] = useState<BundleInfo[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSessions()
      .then((s) => {
        if (!cancelled) setSessions(s);
      })
      .catch((err: unknown) => {
        if (!cancelled) setListError(err instanceof Error ? err.message : String(err));
      });
    fetchLibrary()
      .then((b) => {
        if (!cancelled) setLibrary(b);
      })
      .catch((err: unknown) => {
        if (!cancelled) setListError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="start">
      <div className="start__masthead">
        <h1 className="start__title">However Far</h1>
        <p className="start__tagline">A game authored in real time, as you play it.</p>
      </div>

      {error ? <p className="banner banner--error">{error}</p> : null}
      {listError ? <p className="banner banner--error">{listError}</p> : null}

      <button
        type="button"
        className="choice-button choice-button--primary"
        disabled={busy}
        onClick={() => onStart({ mode: "new" })}
      >
        New Game
      </button>

      <section className="start__section">
        <h2>Resume</h2>
        {sessions === null ? (
          <p className="dim">loading…</p>
        ) : sessions.length === 0 ? (
          <p className="dim">No saved sessions yet.</p>
        ) : (
          <ul className="start__list">
            {sessions.map((s) => (
              <li key={s.id} className="start__row">
                <div>
                  <div className="start__row-title">{s.id}</div>
                  <div className="dim">
                    {s.phase} · {s.scenesPlayed} scenes · {formatWhen(s.updatedAt)}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onStart({ mode: "resume", id: s.id })}
                >
                  Resume
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="start__section">
        <h2>Library</h2>
        {library === null ? (
          <p className="dim">loading…</p>
        ) : library.length === 0 ? (
          <p className="dim">The library is empty — finish a game to publish one.</p>
        ) : (
          <ul className="start__list">
            {library.map((b) => (
              <li key={b.path} className="start__row">
                <div>
                  <div className="start__row-title">
                    {b.title}
                    {b.creator ? <span className="dim"> by {b.creator}</span> : null}
                  </div>
                  <div className="dim">{b.description}</div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onStart({ mode: "replay", bundlePath: b.path })}
                >
                  Replay
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
