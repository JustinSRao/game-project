import type { ReactElement } from "react";
import type { ArtRequest } from "@unwritten/schema";

export interface ArtSlotProps {
  request: ArtRequest;
  label?: string;
}

/**
 * The art pipeline (image model → pixelize/palette-lock → content-hash
 * cache, see docs/ARCHITECTURE.md §4) is a separate workstream. Wherever a
 * SceneSpec carries an ArtRequest, this renders a clearly-marked placeholder
 * box naming the request's subject instead of an image. Swap the body for an
 * <img src={assetUrl(request)}> once the pipeline exists — the rest of the
 * layout (sizing, placement) is meant to already be correct.
 */
export function ArtSlot({ request, label }: ArtSlotProps): ReactElement {
  return (
    <div
      className={`art-slot art-slot--${request.sizeClass} art-slot--${request.kind}`}
      title={`art request — ${request.kind}: ${request.mood}`}
    >
      <span className="art-slot__kind">{request.kind}</span>
      <span className="art-slot__subject">{label ?? request.subject}</span>
    </div>
  );
}
