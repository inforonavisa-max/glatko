#!/usr/bin/env node
/**
 * One-off helper to provision the Playwright auth-persistence test user.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local
 * via Node's --env-file flag. Generates a strong random password, calls the
 * Supabase Auth Admin API to create (or fetch) the user, then writes the
 * credentials to .env.test.local (gitignored). Never prints the password.
 *
 * Usage:
 *   node --env-file=.env.local scripts/create-test-user.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";

const TEST_EMAIL = "test+playwright-auth@glatko.app";

// Padded metadata pushes the serialized session cookie past the @supabase/ssr
// MAX_CHUNK_SIZE (3180 bytes) so refresh produces 2 chunks. That is the only
// reliable way to exercise the deprecated-set-callback bug in
// supabase/middleware.ts:60 from an E2E test — without chunking, setAll is
// called with a single cookie and the response-reassignment race doesn't
// surface. The bloat is harmless static data and is only attached to the
// is_test_account=true row.
const METADATA_BLOAT = "x".repeat(4096);
const TEST_METADATA = {
  is_test_account: true,
  purpose: "e2e-auth-persistence",
  // Field name is intentionally explicit so anyone auditing the user can see
  // why the row has 4 KB of padding.
  e2e_chunking_bloat: METADATA_BLOAT,
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function generatePassword() {
  // 32 alnum chars — enough entropy, no shell-special chars to leak through env files.
  return randomBytes(24).toString("base64url").slice(0, 32);
}

async function findExistingUser(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

const existing = await findExistingUser(TEST_EMAIL);
const password = generatePassword();

if (existing) {
  // Reset password so .env.test.local stays authoritative; preserve everything else.
  const { error } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
    user_metadata: { ...(existing.user_metadata ?? {}), ...TEST_METADATA },
  });
  if (error) {
    console.error("Failed to reset existing test user:", error.message);
    process.exit(1);
  }
  console.log(`Reset password for existing test user (id=${existing.id})`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password,
    email_confirm: true,
    user_metadata: TEST_METADATA,
  });
  if (error) {
    console.error("Failed to create test user:", error.message);
    process.exit(1);
  }
  console.log(`Created test user (id=${data.user?.id})`);
}

const envPath = ".env.test.local";
const body =
  `# Playwright auth-persistence test credentials (gitignored).\n` +
  `# Regenerate with: node --env-file=.env.local scripts/create-test-user.mjs\n` +
  `TEST_USER_EMAIL=${TEST_EMAIL}\n` +
  `TEST_USER_PASSWORD=${password}\n`;
writeFileSync(envPath, body, { mode: 0o600 });
console.log(
  `Wrote ${envPath} (mode 0600). ${existing ? "Updated" : "Created"} successfully.`,
);
if (existsSync(envPath)) {
  // Sanity: confirm gitignore status (don't print contents).
  console.log("Remember to keep .env.test.local out of version control.");
}
