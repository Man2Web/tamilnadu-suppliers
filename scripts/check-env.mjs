// Safe production diagnostics. Run inside the Coolify "Terminal" of the app container:
//   node scripts/check-env.mjs                       (environment + live Supabase probes)
//   node scripts/check-env.mjs --user admin@x.com    (also checks that the account exists/is ACTIVE)
// Prints names, formats, HTTP statuses and Supabase error messages. NEVER prints key values or password hashes.
// Probes are read-only (a lock-status RPC for a dummy key and a one-row select).

import { collectEnvDiagnostics } from "../src/lib/diagnostics/envDiagnostics.mjs";

const diag = collectEnvDiagnostics(process.env);
console.log("== Environment seen by this process ==");
console.log(JSON.stringify({ ...diag, problems: undefined }, null, 2));
diag.problems.forEach((p) => console.log("PROBLEM:", p));

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, "");
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !key) {
  console.log("\nCannot run live probes: URL or service key missing.");
  process.exit(1);
}

async function probe(label, path, init = {}) {
  try {
    const res = await fetch(`${url}${path}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
    });
    let message = "";
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      message = body.message || body.hint || body.error || "";
    }
    console.log(`${res.ok ? "OK  " : "FAIL"} ${label}: HTTP ${res.status}${message ? ` - ${message}` : ""}`);
    return res;
  } catch (e) {
    console.log(`FAIL ${label}: network error (${e.cause?.code || e.message})`);
    return null;
  }
}

console.log("\n== Live probes (service-role key against the configured URL) ==");
await probe("rate-limit RPC login_rate_limit_status", "/rest/v1/rpc/login_rate_limit_status", {
  method: "POST",
  body: JSON.stringify({ p_key: "diagnostic-probe" }),
});
await probe("rate-limit RPC login_rate_limit_clear", "/rest/v1/rpc/login_rate_limit_clear", {
  method: "POST",
  body: JSON.stringify({ p_key: "diagnostic-probe" }),
});
await probe("users table readable", "/rest/v1/users?select=id&limit=1");

const userArgIdx = process.argv.indexOf("--user");
if (userArgIdx > -1 && process.argv[userArgIdx + 1]) {
  const ident = process.argv[userArgIdx + 1].trim().toLowerCase();
  const email = ident.includes("@") ? ident : `${ident}@tamilnadusuppliers.com`;
  const res = await fetch(`${url}/rest/v1/users?select=role,status,password_hash&email=eq.${encodeURIComponent(email)}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  }).catch(() => null);
  if (res?.ok) {
    const rows = await res.json();
    if (!rows.length) console.log(`\nUser lookup: NO account with that email (login would return 401 Invalid username or password).`);
    else {
      const u = rows[0];
      console.log(`\nUser lookup: found; role=${u.role}; status=${u.status}; has password hash=${Boolean(u.password_hash)}`);
      if (u.status !== "ACTIVE") console.log("  -> status is not ACTIVE: login will return 401.");
      if (!u.password_hash) console.log("  -> no password hash: login will return 401 (run `npm run setup:admin`).");
    }
  } else {
    console.log(`\nUser lookup failed: HTTP ${res?.status ?? "network error"}`);
  }
}
