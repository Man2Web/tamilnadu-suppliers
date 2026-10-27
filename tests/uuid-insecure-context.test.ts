// Regression: on plain http:// browsers have no crypto.randomUUID, and the New Bill / New Quotation pages crashed.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateUuid } from "../src/lib/utils/uuid";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("generateUuid", () => {
  it("returns a valid v4 UUID", () => {
    assert.match(generateUuid(), UUID_V4);
  });

  it("works when crypto.randomUUID is missing (insecure http:// page)", () => {
    const original = globalThis.crypto.randomUUID;
    // @ts-expect-error simulate an insecure context where the function does not exist
    globalThis.crypto.randomUUID = undefined;
    try {
      const ids = new Set(Array.from({ length: 500 }, () => generateUuid()));
      assert.equal(ids.size, 500, "ids must be unique");
      for (const id of ids) assert.match(id, UUID_V4);
    } finally {
      globalThis.crypto.randomUUID = original;
    }
  });

  it("still works when crypto is entirely unavailable", () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    try {
      assert.match(generateUuid(), UUID_V4);
    } finally {
      if (desc) Object.defineProperty(globalThis, "crypto", desc);
    }
  });
});
