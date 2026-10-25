import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EXAMPLES } from "../examples";
import { RULE_DOCS } from "../lib/rules";
import { REPO_URL } from "../lib/site";
import { renderAt } from "../test/render";
import { DocsPage } from "./DocsPage";
import { ExamplesPage } from "./ExamplesPage";
import { HomePage } from "./HomePage";

describe("HomePage", () => {
  it("has the primary calls to action", () => {
    renderAt(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Catch Docker Compose issues");
    expect(screen.getByRole("link", { name: /Try the Playground/ })).toHaveAttribute("href", "/playground");
    expect(screen.getByRole("link", { name: /View on GitHub/ })).toHaveAttribute("href", REPO_URL);
  });

  it("labels the preview as real analyzer output", () => {
    renderAt(<HomePage />);
    expect(screen.getByText(/Actual output of Compose Doctor/)).toBeInTheDocument();
  });
});

describe("ExamplesPage", () => {
  it("links every example to the playground", () => {
    renderAt(<ExamplesPage />);
    for (const example of EXAMPLES) {
      expect(screen.getByRole("link", { name: `Open ${example.title} in the playground` })).toHaveAttribute(
        "href",
        `/playground?example=${example.id}`,
      );
    }
  });
});

describe("DocsPage", () => {
  it("documents every rule with an anchor", () => {
    renderAt(<DocsPage />);
    for (const rule of RULE_DOCS) {
      expect(document.getElementById(rule.id.toLowerCase())).toHaveTextContent(rule.title);
    }
  });

  it("uses the repository URL in install commands", () => {
    renderAt(<DocsPage />);
    expect(screen.getAllByText(new RegExp(`git clone ${REPO_URL}\\.git`)).length).toBeGreaterThan(0);
  });
});
