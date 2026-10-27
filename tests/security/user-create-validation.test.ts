import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./helpers"; // safe test env variables
import { SupabaseStore } from "../../src/lib/db/supabaseStore";

// createUser is the single place that creates accounts (New Account page, API and setup script).
describe("createUser server-side validation", () => {
  let store: SupabaseStore;
  let inserted: any[];
  let insertError: { code?: string; message: string } | null;
  let existing: { email?: string; username?: string } | null;

  beforeEach(() => {
    store = new SupabaseStore();
    inserted = [];
    insertError = null;
    existing = null;
    const lookup = (col: string) => ({
      limit: () => ({
        maybeSingle: async () => ({ data: existing && existing[col as "email" | "username"] ? { id: "u-existing" } : null, error: null }),
      }),
    });
    const mock = {
      from() {
        return {
          select: () => ({
            eq: (col: string, val: string) => lookup(col === "email" && existing?.email === val ? "email" : "none"),
            ilike: (col: string, val: string) => lookup(col === "username" && existing?.username === val ? "username" : "none"),
          }),
          insert(row: any) {
            inserted.push(row);
            return {
              select: () => ({
                single: async () =>
                  insertError ? { data: null, error: insertError } : { data: { ...row, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, error: null },
              }),
            };
          },
        };
      },
    };
    Object.defineProperty(store, "supabase", { get: () => mock, configurable: true });
  });

  const ok = { name: "Test Person", email: "Person@Example.com", password: "secret1", role: "BILLING" };

  it("rejects a missing name, missing login, bad email, bad role and short password with clear messages", async () => {
    await assert.rejects(store.createUser({ ...ok, name: " " }, "SUPER_ADMIN"), /Full name is required/);
    await assert.rejects(store.createUser({ name: "A", password: "secret1" }, "SUPER_ADMIN"), /Email or username is required/);
    await assert.rejects(store.createUser({ ...ok, email: "not-an-email" }, "SUPER_ADMIN"), /Email address is not valid/);
    await assert.rejects(store.createUser({ ...ok, role: "GOD" }, "SUPER_ADMIN"), /Role must be/);
    await assert.rejects(store.createUser({ ...ok, password: "123" }, "SUPER_ADMIN"), /at least 6 characters/);
    await assert.rejects(store.createUser({ ...ok, password: undefined }, "SUPER_ADMIN"), /at least 6 characters/);
    assert.equal(inserted.length, 0, "nothing may reach the database when validation fails");
  });

  it("never leaks a raw TypeError when fields are missing", async () => {
    for (const body of [{}, { name: "x" }, { username: "u" }]) {
      await assert.rejects(store.createUser(body, "SUPER_ADMIN"), (e: Error) => !/Cannot read properties/.test(e.message));
    }
  });

  it("only the Super Admin may create accounts", async () => {
    await assert.rejects(store.createUser(ok, "ADMIN"), /Only Super Administrator/);
  });

  it("creates an account with a lower-cased email, a hashed password and the role preset permissions", async () => {
    const user = await store.createUser(ok, "SUPER_ADMIN");
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].email, "person@example.com");
    assert.notEqual(inserted[0].password_hash, "secret1");
    assert.match(String(inserted[0].password_hash), /^\$2[aby]\$/);
    assert.equal(user.role, "BILLING");
    assert.equal(inserted[0].must_change_password, true, "new accounts must change the temporary password at first login");
    assert.ok(Array.isArray(inserted[0].permissions) && inserted[0].permissions.length > 0);
  });

  it("accepts a username-only account (the New Account page allows email OR username)", async () => {
    await store.createUser({ name: "Counter Staff", username: "Counter1", password: "secret1" }, "SUPER_ADMIN");
    assert.equal(inserted[0].username, "counter1");
    assert.equal(inserted[0].email, "counter1@tamilnadusuppliers.com"); // what the login lookup expects for a bare username
  });

  it("refuses an email or username that already exists (exact match only)", async () => {
    existing = { email: "person@example.com" };
    await assert.rejects(store.createUser(ok, "SUPER_ADMIN"), /already exists/);
    existing = { username: "counter1" };
    await assert.rejects(store.createUser({ name: "C", username: "Counter1", password: "secret1" }, "SUPER_ADMIN"), /already exists/);
    existing = { username: "administrator" };
    await store.createUser({ name: "A", username: "adm", password: "secret1" }, "SUPER_ADMIN"); // "adm" is not "administrator"
    assert.equal(inserted.length, 1);
  });

  it("turns a duplicate-key database error into a friendly message", async () => {
    insertError = { code: "23505", message: 'duplicate key value violates unique constraint "users_email_key"' };
    await assert.rejects(store.createUser(ok, "SUPER_ADMIN"), /already exists/);
  });
});
