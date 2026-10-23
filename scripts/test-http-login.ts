import dotenv from "dotenv";
dotenv.config();

async function testHttpLogin() {
  console.log("Testing POST http://localhost:3000/api/auth/login...");
  const res = await fetch("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "admin@tamilnadusuppliers.com",
      password: "AdminTempPass2026!",
    }),
  });

  const cookie = res.headers.get("set-cookie");
  const data = await res.json();
  console.log("Status:", res.status);
  console.log("Set-Cookie header received:", !!cookie);
  console.log("Response Body:", data);

  if (res.status === 200 && cookie) {
    console.log("Now testing authenticated request to GET /api/companies with the session cookie...");
    const compRes = await fetch("http://localhost:3000/api/companies", {
      headers: { cookie },
    });
    const compData = await compRes.json();
    console.log("Companies Status:", compRes.status);
    console.log("Companies count:", Array.isArray(compData) ? compData.length : compData);
    if (Array.isArray(compData)) {
      compData.forEach(c => console.log(`  - ${c.name} (${c.gstType})`));
    }
  }
}

testHttpLogin().catch(console.error);
