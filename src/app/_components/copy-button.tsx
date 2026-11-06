"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";

/** Copies `text` to the clipboard and shows a check mark for 1.5s. */
export function CopyButton({
  text,
  label = "Copy",
  compact = false,
}: {
  text: string;
  label?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      className={compact ? "icon-btn" : "btn btn-secondary"}
      aria-label={copied ? "Copied" : `Copy ${text}`}
      title={copied ? "Copied!" : "Copy to clipboard"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          // Clipboard can be blocked (non-HTTPS, permissions); fail quietly.
        }
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {!compact && <span>{copied ? "Copied" : label}</span>}
    </button>
  );
}
