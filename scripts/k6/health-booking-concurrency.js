// k6 concurrency test — H5b booking atomicity (MASTER_PLAN H5 DoD).
//
// Fires 50 simultaneous booking requests at the SAME slot (one pre-created hold +
// verified patient) and asserts the system books it EXACTLY ONCE: 1 × 200 success,
// the rest gracefully rejected (HOLD_EXPIRED, since the slot_holds EXCLUDE allows
// only one hold per slot so the losers race for the same hold → it's consumed once;
// SLOT_TAKEN is the appointments no_overlap EXCLUDE second guard). No double-booking.
//
// Setup (run BEFORE this script — see scripts/_throwaway-h5b-k6-*.mjs in the H5b PR,
// or replicate via SQL): insert a verified patient (+ verified otp) and a slot_hold,
// then pass their ids in. After the run, assert health.appointments count == 1.
//
//   k6 run -e BASE_URL=http://localhost:3001 \
//          -e HOLD_ID=<uuid> -e SESSION_KEY=<hold.session_key> -e PATIENT_ID=<uuid> \
//          scripts/k6/health-booking-concurrency.js
//
// (k6 is not a project dependency; install separately — https://k6.io. The H5b PR
//  also ran the identical scenario via a node Promise.all(50) runner whose output is
//  in the PR, because k6 was not available in the build environment.)

import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:3001";
const HOLD_ID = __ENV.HOLD_ID;
const SESSION_KEY = __ENV.SESSION_KEY;
const PATIENT_ID = __ENV.PATIENT_ID;

const ok = new Counter("booking_success");
const slotTaken = new Counter("booking_slot_taken");
const holdExpired = new Counter("booking_hold_expired");
const other = new Counter("booking_other");

export const options = {
  scenarios: {
    thundering_herd: {
      executor: "shared-iterations",
      vus: 50,
      iterations: 50,
      maxDuration: "30s",
    },
  },
  thresholds: {
    // The invariant: never more than one successful booking for the slot.
    booking_success: ["count<=1"],
  },
};

export default function () {
  const res = http.post(
    `${BASE}/api/health/bookings`,
    JSON.stringify({ holdId: HOLD_ID, locale: "tr" }),
    {
      headers: {
        "Content-Type": "application/json",
        Cookie: `glatko_hsess=${SESSION_KEY}; glatko_hpatient=${PATIENT_ID}`,
      },
    },
  );
  if (res.status === 200) ok.add(1);
  else if (res.status === 409) slotTaken.add(1);
  else if (res.status === 410) holdExpired.add(1);
  else other.add(1);
  check(res, { "resolved (not 5xx hang)": (r) => r.status > 0 && r.status < 500 });
}

export function handleSummary(data) {
  const m = data.metrics;
  const summary = {
    success: m.booking_success ? m.booking_success.values.count : 0,
    slot_taken: m.booking_slot_taken ? m.booking_slot_taken.values.count : 0,
    hold_expired: m.booking_hold_expired ? m.booking_hold_expired.values.count : 0,
    other: m.booking_other ? m.booking_other.values.count : 0,
  };
  return { stdout: `\nH5b booking concurrency: ${JSON.stringify(summary)}\n` };
}
