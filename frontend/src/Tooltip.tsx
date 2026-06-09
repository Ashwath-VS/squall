import type { ReactNode } from "react";

/** Lightweight CSS hover tooltip. `pos` nudges placement near screen edges. */
export function Tooltip(
  { text, children, pos = "top", block = false }:
  { text: string; children: ReactNode; pos?: "top" | "right"; block?: boolean }
) {
  return (
    <span className={`tip${block ? " tip-block" : ""}`}>
      {children}
      <span className={`tip-box tip-${pos}`}>{text}</span>
    </span>
  );
}

/** Small "?" hint marker to make a tooltip discoverable. */
export function HintMark() {
  return <span className="hint">?</span>;
}
