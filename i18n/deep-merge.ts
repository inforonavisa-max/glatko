/**
 * Deep-merge `override` onto `base`: recurses into plain objects, and `override`
 * wins for scalars, arrays, and null. Returns a new object (inputs untouched).
 *
 * Used by i18n/request.ts to layer the active locale on top of the English
 * dictionary, so any key missing from a non-English locale resolves to the
 * English value instead of leaking the raw message key to the user.
 */
export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const prev = out[key];
    if (
      value != null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      prev != null &&
      typeof prev === "object" &&
      !Array.isArray(prev)
    ) {
      out[key] = deepMerge(
        prev as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      out[key] = value;
    }
  }
  return out;
}
