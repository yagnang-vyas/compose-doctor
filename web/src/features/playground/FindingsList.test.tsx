import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { JsonReport } from "../../analyzer/types";
import snapshot from "../../generated/analyzer-snapshot.json";
import { RULES_BY_ID } from "../../lib/rules";
import { renderAt } from "../../test/render";
import { FindingsList } from "./FindingsList";

// Real analyzer output for the landing-page preview file: 2 errors, 3 warnings, 1 note.
const report = { ...snapshot.preview.report, suppressed: [] } as JsonReport;

describe("FindingsList", () => {
  it("groups findings by severity and filters them", async () => {
    const user = userEvent.setup();
    renderAt(<FindingsList report={report} rules={RULES_BY_ID} onGoTo={() => {}} />);
    expect(screen.getAllByRole("button", { name: /Go to line/ })).toHaveLength(6);
    expect(screen.getByRole("region", { name: "Errors" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Errors/ }));
    expect(screen.getAllByRole("button", { name: /Go to line/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /^Errors/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("expands a finding to show why it matters and how to fix it", async () => {
    const user = userEvent.setup();
    renderAt(<FindingsList report={report} rules={RULES_BY_ID} onGoTo={() => {}} />);
    const toggle = screen.getByRole("button", { name: /PostgreSQL container port 5432/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const details = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(details).not.toBeNull();
    expect(within(details as HTMLElement).getByText(RULES_BY_ID.get("CD005")?.rationale ?? "")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText(/ignore CD005/)).toBeInTheDocument();
  });

  it("jumps to a finding's line", async () => {
    const user = userEvent.setup();
    const onGoTo = vi.fn();
    renderAt(<FindingsList report={report} rules={RULES_BY_ID} onGoTo={onGoTo} />);
    await user.click(screen.getByRole("button", { name: "Go to line 5, column 9 in the editor" }));
    expect(onGoTo).toHaveBeenCalledWith(5, 9);
  });

  it("groups by service", async () => {
    const user = userEvent.setup();
    renderAt(<FindingsList report={report} rules={RULES_BY_ID} onGoTo={() => {}} />);
    await user.selectOptions(screen.getByLabelText("Group by"), "service");
    expect(screen.getByRole("region", { name: "db" })).toBeInTheDocument();
  });
});
