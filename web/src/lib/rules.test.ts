import { describe, expect, it } from "vitest";

import { RULE_DOCS, ruleCategory, rulesIn } from "./rules";

describe("rule categories", () => {
  it("place every rule in exactly one category", () => {
    const total = rulesIn("security").length + rulesIn("reliability").length + rulesIn("configuration").length;
    expect(total).toBe(RULE_DOCS.length);
    expect(ruleCategory("CD000")).toBe("configuration");
  });
});
