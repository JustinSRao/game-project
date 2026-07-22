import { useState, type FormEvent, type ReactElement } from "react";
import { ApiError, publishSession } from "../api.js";

export interface EndingScreenProps {
  sessionId: string;
  summary: string;
  onRestart: () => void;
}

export function EndingScreen({ sessionId, summary, onRestart }: EndingScreenProps): ReactElement {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creator, setCreator] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishedPath, setPublishedPath] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  async function submitPublish(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!title.trim() || !description.trim() || publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const { path } = await publishSession(sessionId, {
        title: title.trim(),
        description: description.trim(),
        ...(creator.trim() ? { creator: creator.trim() } : {}),
      });
      setPublishedPath(path);
    } catch (err) {
      setPublishError(err instanceof ApiError ? err.message : "Could not publish this universe.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="ending">
      <div className="ending__rule" aria-hidden="true" />
      <p className="ending__summary">{summary}</p>
      <p className="ending__closer">
        The story is over. <span className="dim">It never existed until you played it.</span>
      </p>

      {publishedPath ? (
        <div className="ending__published">
          <p>Published: {publishedPath}</p>
          <button type="button" onClick={onRestart}>
            Back to start
          </button>
        </div>
      ) : (
        <form className="ending__publish" onSubmit={submitPublish}>
          <h2>Publish this universe</h2>
          <label>
            Title
            <input
              type="text"
              value={title}
              maxLength={120}
              disabled={publishing}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="An Untitled Road"
            />
          </label>
          <label>
            Description
            <textarea
              value={description}
              maxLength={1000}
              disabled={publishing}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A road that remembered someone."
            />
          </label>
          <label>
            Creator (optional)
            <input
              type="text"
              value={creator}
              maxLength={80}
              disabled={publishing}
              onChange={(e) => setCreator(e.target.value)}
            />
          </label>
          {publishError ? <p className="banner banner--error">{publishError}</p> : null}
          <div className="ending__actions">
            <button type="submit" disabled={publishing || !title.trim() || !description.trim()}>
              {publishing ? "Publishing…" : "Publish"}
            </button>
            <button type="button" className="link-button" onClick={onRestart}>
              Skip — back to start
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
