import { Monitor, Moon, Sun } from "lucide-react";

import { cn } from "../../lib/cn";
import { type ThemePreference, useTheme } from "../../lib/theme";

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light theme", Icon: Sun },
  { value: "system", label: "System theme", Icon: Monitor },
  { value: "dark", label: "Dark theme", Icon: Moon },
];

export function ThemeToggle() {
  const { preference, choose } = useTheme();
  return (
    <div role="radiogroup" aria-label="Color theme" className="flex items-center rounded-lg border border-line p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          aria-label={label}
          title={label}
          onClick={() => choose(value)}
          className={cn(
            "grid size-7 place-items-center rounded-md transition-colors",
            preference === value ? "bg-surface-3 text-fg" : "text-subtle hover:text-fg",
          )}
        >
          <Icon aria-hidden="true" className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
