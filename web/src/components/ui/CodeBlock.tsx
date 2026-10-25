import { cn } from "../../lib/cn";
import { CopyButton } from "./CopyButton";

interface CodeBlockProps {
  code: string;
  /** Prefix each line with a shell prompt (display only; copying omits it). */
  prompt?: boolean;
  label?: string;
  className?: string;
}

export function CodeBlock({ code, prompt = false, label, className }: CodeBlockProps) {
  return (
    <div className={cn("group relative rounded-xl border border-line bg-surface-2", className)}>
      {label && (
        <div className="flex items-center justify-between border-b border-line px-4 py-2 text-xs font-medium text-subtle">
          <span>{label}</span>
        </div>
      )}
      <pre className="overflow-x-auto px-4 py-3.5 pr-12 text-[13px] leading-6 text-fg">
        <code>
          {code.split("\n").map((line, index) => (
            <span key={index} className="block">
              {prompt && line && !line.startsWith("#") && (
                <span aria-hidden="true" className="select-none text-subtle">
                  ${" "}
                </span>
              )}
              <span className={line.startsWith("#") ? "text-subtle" : undefined}>{line || " "}</span>
            </span>
          ))}
        </code>
      </pre>
      <CopyButton
        text={code}
        label={label ? `Copy ${label.toLowerCase()}` : "Copy code"}
        className={cn("absolute right-2", label ? "top-11" : "top-2")}
      />
    </div>
  );
}
