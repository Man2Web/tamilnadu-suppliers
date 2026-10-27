import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatNumberDisplay } from "../../src/components/ui/NumberInput";
import { APP_SHORTCUTS } from "../../src/components/layout/useGlobalShortcuts";
import { round2 } from "../../src/lib/calculations/financial";

describe("amount display formatting and shortcut routes", () => {
  it("formats with Indian grouping for display only", () => {
    assert.equal(formatNumberDisplay("1234.5", 2), "1,234.50");
    assert.equal(formatNumberDisplay("1234567", 2), "12,34,567.00");
    assert.equal(formatNumberDisplay("1500", 0), "1,500");
    assert.equal(formatNumberDisplay("", 2), "");
    assert.equal(formatNumberDisplay(".", 2), ".");
  });

  it("formatted text is never what gets stored: the plain value round-trips", () => {
    const plain = "98765.43";
    const shown = formatNumberDisplay(plain, 2);
    assert.equal(shown, "98,765.43");
    assert.equal(Number(shown.replace(/,/g, "")), Number(plain));
  });

  it("money arithmetic stays exact to 2 decimals", () => {
    assert.equal(round2(0.1 + 0.2), 0.3);
    assert.equal(round2(1.005), 1.01);
  });

  it("shortcuts point at the real routes with the permissions those pages use", () => {
    assert.deepEqual(
      APP_SHORTCUTS.map((s) => [s.key, s.href, s.permission]),
      [["b", "/bills/create", "bills:create"], ["q", "/quotations/create", "quotations:create"], ["c", "/customers", "customers:view"]]
    );
  });
});
