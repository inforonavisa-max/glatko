import { describe, it, expect } from "vitest";
import { deepMerge } from "@/i18n/deep-merge";

describe("deepMerge (i18n en-fallback)", () => {
  it("falls back to the base (English) value when the locale lacks a key", () => {
    const en = { founding: { badge: { tooltip: "EN tooltip" } }, other: "x" };
    const de = { other: "y" }; // de is missing founding.badge.tooltip
    const merged = deepMerge(en, de);
    expect(merged).toEqual({
      founding: { badge: { tooltip: "EN tooltip" } },
      other: "y",
    });
  });

  it("lets the locale override the base value when present", () => {
    const en = { founding: { badge: { tooltip: "EN" } } };
    const me = { founding: { badge: { tooltip: "ME native" } } };
    expect(deepMerge(en, me)).toEqual({
      founding: { badge: { tooltip: "ME native" } },
    });
  });

  it("merges nested namespaces key-by-key (partial locale coverage)", () => {
    const en = { ns: { a: "en-a", b: "en-b" } };
    const loc = { ns: { a: "loc-a" } }; // b only in en
    expect(deepMerge(en, loc)).toEqual({ ns: { a: "loc-a", b: "en-b" } });
  });

  it("does not mutate the inputs", () => {
    const en = { ns: { a: "1" } };
    const loc = { ns: { b: "2" } };
    deepMerge(en, loc);
    expect(en).toEqual({ ns: { a: "1" } });
    expect(loc).toEqual({ ns: { b: "2" } });
  });

  it("replaces arrays wholesale rather than merging them", () => {
    expect(deepMerge({ list: [1, 2, 3] }, { list: [9] })).toEqual({ list: [9] });
  });
});
