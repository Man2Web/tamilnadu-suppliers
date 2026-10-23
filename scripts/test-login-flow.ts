import dotenv from "dotenv";
dotenv.config();

import { supabaseStore } from "../src/lib/db/supabaseStore";
import { createSessionToken } from "../src/lib/auth/session";

async function testLoginDirect() {
  try {
    const username = "admin@tamilnadusuppliers.com";
    const password = "AdminTempPass2026!";

    console.log("1. Verifying credentials...");
    const user = await supabaseStore.verifyCredentialsAsync(username, password);
    console.log("User verified:", user?.id, user?.email, user?.role);

    if (!user) {
      console.log("Credentials failed");
      return;
    }

    console.log("2. Creating session in Supabase...");
    const session = await supabaseStore.createSession({
      userId: user.id,
      ipAddress: "127.0.0.1",
      userAgent: "TestAgent",
    });
    console.log("Session created:", session.id, session.status);

    console.log("3. Creating JWT token...");
    const token = await createSessionToken(user, session.id);
    console.log("JWT Token created:", token ? "YES (length " + token.length + ")" : "NO");

    console.log("4. Recording audit log...");
    const log = await supabaseStore.recordAuditLog({
      entityType: "ACCOUNT",
      entityId: user.id,
      entityNumber: user.username || user.email,
      customerName: user.name,
      action: "SIGN_IN",
      actionLabel: "Successful Sign-In",
      actor: {
        id: user.id,
        name: user.name,
        username: user.username || user.email,
        role: user.role,
      },
      details: {
        summary: `${user.name} (${user.role}) signed in successfully`,
        sessionId: session.id,
        ipAddress: "127.0.0.1",
      },
      ipAddress: "127.0.0.1",
    });
    console.log("Audit log recorded:", log.id);

    console.log("Direct login simulation completed successfully!");
  } catch (err: any) {
    console.error("Direct login simulation failed with error:", err);
  }
}

testLoginDirect();
