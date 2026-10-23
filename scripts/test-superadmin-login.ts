import dotenv from "dotenv";
dotenv.config();

import { supabaseStore } from "../src/lib/db/supabaseStore";
import bcrypt from "bcryptjs";


async function main() {
  const user = await supabaseStore.getUserByEmail("admin@tamilnadusuppliers.com", true);
  console.log("Super Admin in Supabase:");
  console.log("  ID:", user?.id);
  console.log("  Email:", user?.email);
  console.log("  Username:", user?.username);
  console.log("  Role:", user?.role);
  console.log("  Status:", user?.status);
  console.log("  Has Password Hash:", !!user?.passwordHash);

  // Check passwords that were commonly used in tests/seeds
  const candidatePasswords = [
    "AdminTempPass2026!",
    "Admin123!",
    "SuperAdmin2026!",
    "admin123",
    "Admin@123",
  ];

  for (const pwd of candidatePasswords) {
    if (user?.passwordHash) {
      const match = await bcrypt.compare(pwd, user.passwordHash);
      if (match) {
        console.log(`  Matching Password Found: ${pwd}`);
        return;
      }
    }
  }

  console.log("  Password didn't match candidate list. Checking verifyCredentialsAsync with AdminTempPass2026!:");
  const verified = await supabaseStore.verifyCredentialsAsync("admin@tamilnadusuppliers.com", "AdminTempPass2026!");
  console.log("  Verified:", !!verified);
}

main().catch(console.error);
