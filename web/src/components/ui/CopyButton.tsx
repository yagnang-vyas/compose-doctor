import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../../lib/cn";
import { Button } from "./Button";

interface CopyButtonProps {
  text: string;
  label?: string;
  /** Show the label next to the icon; otherwise it is only the accessible name. */
  showLabel?: boolean;
  className?: string;
  size?: "sm" | "md";
}

export function CopyButton({ text, label = "Copy", showLabel = false, className, size = "sm" }: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1800);
  }

  const status = state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label;
  return (
    <Button
      variant="ghost"
      size={size}
      onClick={copy}
      aria-label={showLabel ? undefined : status}
      title={status}
      className={cn(!showLabel && "w-8 px-0", className)}
    >
      {state === "copied" ? <Check aria-hidden="true" className="text-success" /> : <Copy aria-hidden="true" />}
      {showLabel && <span>{status}</span>}
      <span className="sr-only" aria-live="polite">
        {state === "idle" ? "" : status}
      </span>
    </Button>
  );
}
