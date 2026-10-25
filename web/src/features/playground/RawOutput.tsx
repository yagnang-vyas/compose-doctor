import { Download } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { CopyButton } from "../../components/ui/CopyButton";
import { downloadText } from "../../lib/download";

export interface RawFormat {
  id: "text" | "json" | "sarif";
  label: string;
  command: string;
  filename: string;
  mime: string;
  content: string;
}

export function RawOutput({ format }: { format: RawFormat }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 sm:px-5">
        <code className="min-w-0 truncate font-mono text-xs text-subtle">$ {format.command}</code>
        <div className="flex items-center gap-1">
          <CopyButton text={format.content} label={`Copy ${format.label} output`} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => downloadText(format.filename, format.content, format.mime)}
          >
            <Download aria-hidden="true" /> {format.filename}
          </Button>
        </div>
      </div>
      <pre
        tabIndex={0}
        aria-label={`${format.label} report`}
        className="min-h-0 flex-1 overflow-auto p-4 font-mono text-[12.5px] leading-relaxed text-fg sm:px-5"
      >
        {format.content}
      </pre>
    </div>
  );
}
