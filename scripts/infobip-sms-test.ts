/**
 * Infobip SMS pipe test — proves sender ID + API-key scope + base URL work
 * end-to-end WITHOUT touching Supabase auth.
 *
 *   npx tsx scripts/infobip-sms-test.ts +38269XXXXXX
 *
 * Reads INFOBIP_* from .env.local and sends exactly one SMS through the same
 * lib/sms/infobip.ts module the Send SMS hook uses (single source), then prints
 * the structured result (messageId + status on success, or the Infobip error
 * text on failure — handy for diagnosing trial-mode / scope issues). Holds no
 * secrets of its own.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { sendSms } from "../lib/sms/infobip";

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error("Usage: npx tsx scripts/infobip-sms-test.ts +38269XXXXXX");
    process.exit(1);
  }

  const missing = [
    "INFOBIP_API_KEY",
    "INFOBIP_BASE_URL",
    "INFOBIP_SMS_SENDER",
  ].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing env in .env.local: ${missing.join(", ")}`);
    process.exit(1);
  }

  console.log(
    `Sending test SMS to ${to} via sender "${process.env.INFOBIP_SMS_SENDER}" …`,
  );
  const result = await sendSms({
    to,
    text: "Glatko Infobip pipe test. Please disregard.",
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
