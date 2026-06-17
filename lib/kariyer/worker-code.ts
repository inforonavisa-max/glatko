/**
 * Glatko Kariyer — anonymized worker-code format (career-vertical-plan-v1.md
 * PART 2/PART 3: e.g. `MNE-CW-0427`). The worker code is the ONLY public
 * identifier shown on anonymized pool cards / detail pages — never the name.
 *
 * Server-safe constant (no `server-only`, no Node built-ins): both the route
 * layer and client components import WORKER_CODE_RE to validate the
 * `[workerCode]` segment and to render/format a code consistently.
 *
 * Shape: <COUNTRY>-<CATEGORY>-<SEQUENCE>
 *  - COUNTRY:  3-letter ISO-ish region prefix, e.g. MNE (Montenegro).
 *  - CATEGORY: 2-letter trade/sector code, e.g. CW (construction worker).
 *  - SEQUENCE: zero-padded numeric id (min 4 digits), e.g. 0427.
 */

/** Anchored matcher for a full worker code (uppercase). Use `.test()` on input. */
export const WORKER_CODE_RE = /^[A-Z]{3}-[A-Z]{2}-\d{4,}$/;

/** Default region prefix (Montenegro) when a caller doesn't pass one. */
export const WORKER_CODE_COUNTRY = "MNE" as const;

/** Minimum zero-padding width for the numeric sequence. */
export const WORKER_CODE_SEQ_WIDTH = 4;

/**
 * Build a canonical worker code from its parts, e.g.
 * formatWorkerCode("CW", 427) → "MNE-CW-0427".
 * `category` is upper-cased and the sequence is zero-padded to at least
 * WORKER_CODE_SEQ_WIDTH digits. `country` defaults to MNE.
 */
export function formatWorkerCode(
  category: string,
  sequence: number,
  country: string = WORKER_CODE_COUNTRY,
): string {
  const cat = category.trim().toUpperCase();
  const seq = String(Math.trunc(Math.abs(sequence))).padStart(WORKER_CODE_SEQ_WIDTH, "0");
  return `${country.toUpperCase()}-${cat}-${seq}`;
}

/** True iff `code` is a well-formed worker code. */
export function isWorkerCode(code: string): boolean {
  return typeof code === "string" && WORKER_CODE_RE.test(code);
}
