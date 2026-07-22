import { useEffect, useState } from "react";

export interface TypewriterResult {
  shown: string;
  done: boolean;
}

/**
 * Progressive reveal for narration — a nice-to-have atmospheric touch, not
 * load-bearing. Ticks in fixed-size chunks so long and short narration both
 * finish in roughly the same wall-clock time.
 */
export function useTypewriter(text: string, active: boolean): TypewriterResult {
  const [shown, setShown] = useState<string>(active ? "" : text);

  useEffect(() => {
    if (!active) {
      setShown(text);
      return;
    }
    setShown("");
    let i = 0;
    const totalTicks = 90;
    const chunk = Math.max(1, Math.ceil(text.length / totalTicks));
    const id = window.setInterval(() => {
      i += chunk;
      setShown(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, 16);
    return () => window.clearInterval(id);
  }, [text, active]);

  return { shown, done: shown.length >= text.length };
}
