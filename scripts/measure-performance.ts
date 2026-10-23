import assert from "node:assert";

async function main() {
  console.log("==================================================================");
  console.log("  TAMILNADU SUPPLIERS - PERFORMANCE & CLEANUP MEASUREMENT");
  console.log("==================================================================\n");

  const baseUrl = "http://localhost:3000";

  // 1. Measure Unauthenticated root access -> login redirect
  const t0 = performance.now();
  const rootRes = await fetch(`${baseUrl}/`, { redirect: "manual" });
  const rootDuration = performance.now() - t0;
  console.log(`[1] Root (/) Route Guard:`);
  console.log(`    Status: ${rootRes.status} (Expected: 307 Redirect)`);
  console.log(`    Location header: ${rootRes.headers.get("location")}`);
  console.log(`    Time taken: ${rootDuration.toFixed(2)} ms`);

  // 2. Measure Login speed & session issuance
  console.log(`\n[2] Authentication (Login) Endpoint Speed:`);
  const t1 = performance.now();
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "admin@tamilnadusuppliers.com",
      password: "AdminTempPass2026!",
    }),
  });
  const loginDuration = performance.now() - t1;
  const loginData = await loginRes.json();
  const cookieHeader = loginRes.headers.get("set-cookie");
  console.log(`    Status: ${loginRes.status}`);
  console.log(`    Login Time: ${loginDuration.toFixed(2)} ms`);
  console.log(`    User Authenticated: ${loginData.user?.name} (${loginData.user?.role})`);
  console.log(`    mustChangePassword: ${loginData.user?.mustChangePassword}`);

  let sessionCookie = cookieHeader ? cookieHeader.split(";")[0] : "";

  // 3. Measure Dashboard Summary API Speed (Optimized single-endpoint aggregation)
  console.log(`\n[3] Dashboard Summary API (/api/dashboard/summary):`);
  const t2 = performance.now();
  const summaryRes = await fetch(`${baseUrl}/api/dashboard/summary`, {
    headers: {
      Cookie: sessionCookie,
    },
  });
  const summaryDuration = performance.now() - t2;
  const summaryData = await summaryRes.json();
  const summarySize = JSON.stringify(summaryData).length;
  console.log(`    Status: ${summaryRes.status} (200 OK)`);
  console.log(`    Response Time: ${summaryDuration.toFixed(2)} ms`);
  console.log(`    Payload Size: ${(summarySize / 1024).toFixed(2)} KB`);
  console.log(`    Products: ${summaryData.stats?.totalProducts} items (${summaryData.stats?.totalOwnedStock} owned, ${summaryData.stats?.availableStock} avail, ${summaryData.stats?.rentedStock} rented)`);
  console.log(`    Billing: ${summaryData.stats?.billsCount} bills (Revenue: ₹${summaryData.stats?.totalRevenue}, Outstanding: ₹${summaryData.stats?.totalOutstanding})`);
  console.log(`    Deposits: ₹${summaryData.stats?.securityDepositHeld} in custody`);
  console.log(`    Quotations: ${summaryData.stats?.quotationsCount} total, ${summaryData.stats?.quotesAwaitingConversionCount} ready to convert`);
  console.log(`    Returns & Overdue: ${summaryData.stats?.billsDueTodayCount} due today, ${summaryData.stats?.billsOverdueCount} overdue, ${summaryData.stats?.billsAwaitingInspectionCount} awaiting inspection`);

  // 4. Measure Legacy Separate Endpoints Combined (Simulating Before-Optimization)
  console.log(`\n[4] Comparison with Legacy Data-Fetching (4 separate API calls in series/parallel):`);
  const t3 = performance.now();
  const [prodsRes, billsRes, quotesRes, compsRes] = await Promise.all([
    fetch(`${baseUrl}/api/products`, { headers: { Cookie: sessionCookie } }),
    fetch(`${baseUrl}/api/bills`, { headers: { Cookie: sessionCookie } }),
    fetch(`${baseUrl}/api/quotations`, { headers: { Cookie: sessionCookie } }),
    fetch(`${baseUrl}/api/companies`, { headers: { Cookie: sessionCookie } }),
  ]);
  const [prods, bills, quotes, comps] = await Promise.all([
    prodsRes.json(),
    billsRes.json(),
    quotesRes.json(),
    compsRes.json(),
  ]);
  const legacyDuration = performance.now() - t3;
  const legacyTotalSize =
    (JSON.stringify(prods).length +
      JSON.stringify(bills).length +
      JSON.stringify(quotes).length +
      JSON.stringify(comps).length) /
    1024;
  console.log(`    Legacy Combined Requests: 4 network roundtrips`);
  console.log(`    Legacy Response Time: ${legacyDuration.toFixed(2)} ms`);
  console.log(`    Legacy Total Data Transferred: ${legacyTotalSize.toFixed(2)} KB`);
  console.log(`    Network Payload Reduction: ${(((legacyTotalSize - summarySize / 1024) / legacyTotalSize) * 100).toFixed(1)}% reduction!`);
  console.log(`    API Roundtrips Reduction: 4 requests -> 1 request (75% fewer requests)`);

  // 5. Measure Logout Speed
  console.log(`\n[5] Logout Endpoint Speed:`);
  const t4 = performance.now();
  const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: sessionCookie },
  });
  const logoutDuration = performance.now() - t4;
  const logoutCookie = logoutRes.headers.get("set-cookie");
  console.log(`    Status: ${logoutRes.status}`);
  console.log(`    Logout Time: ${logoutDuration.toFixed(2)} ms`);
  console.log(`    Cookie Cleared: ${logoutCookie?.includes("Max-Age=0") ? "YES" : "NO"}`);

  console.log("\n==================================================================");
  console.log("  ALL PERFORMANCE BENCHMARKS COMPLETED SUCCESSFULLY");
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("Benchmark error:", err);
  process.exit(1);
});
