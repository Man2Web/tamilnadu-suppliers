// The backend reports a GST company as "GST"; forms and older code use "GST_REGISTERED". Both must behave the same,
// and a Non-GST company must never be charged GST.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isGstRegistered, calculateDocumentFinancials } from "../src/lib/calculations/financial";

describe("GST vs Non-GST", () => {
  it("recognises both spellings of GST and nothing else", () => {
    assert.equal(isGstRegistered("GST"), true);
    assert.equal(isGstRegistered("GST_REGISTERED"), true);
    assert.equal(isGstRegistered("NON_GST"), false);
    assert.equal(isGstRegistered(undefined), false);
    assert.equal(isGstRegistered(null), false);
  });

  it("charges 18% (split CGST/SGST) for a GST company, whichever spelling it uses", () => {
    for (const taxType of ["GST", "GST_REGISTERED"] as const) {
      const f = calculateDocumentFinancials({ taxType: taxType as never, itemsSubtotal: 1000 });
      assert.equal(f.cgstAmount, 90);
      assert.equal(f.sgstAmount, 90);
      assert.equal(f.igstAmount, 0);
      assert.equal(f.totalTax, 180);
      assert.equal(f.grandTotal, 1180);
    }
  });

  it("charges inter-state GST as IGST", () => {
    const f = calculateDocumentFinancials({ taxType: "GST" as never, itemsSubtotal: 1000, isInterState: true });
    assert.equal(f.igstAmount, 180);
    assert.equal(f.cgstAmount + f.sgstAmount, 0);
  });

  it("never charges any GST for a Non-GST company, even with charges and inter-state set", () => {
    const f = calculateDocumentFinancials({
      taxType: "NON_GST",
      itemsSubtotal: 1000,
      transportCharges: 100,
      discountAmount: 50,
      isInterState: true,
    });
    assert.equal(f.totalTax, 0);
    assert.equal(f.cgstAmount + f.sgstAmount + f.igstAmount, 0);
    assert.equal(f.cgstRate + f.sgstRate + f.igstRate, 0);
    assert.equal(f.grandTotal, 1050);
  });
});
