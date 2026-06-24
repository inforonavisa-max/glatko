import { describe, it, expect } from "vitest";
import { serializeJsonLd, jsonLdScriptProps } from "./jsonld";

const LS = String.fromCharCode(0x2028); // U+2028 LINE SEPARATOR
const PS = String.fromCharCode(0x2029); // U+2029 PARAGRAPH SEPARATOR

describe("serializeJsonLd", () => {
  it("neutralizes a </script> breakout payload in a user-controlled field", () => {
    const out = serializeJsonLd({
      "@type": "Review",
      reviewBody: "</script><script>alert(document.domain)</script>",
    });
    // The literal closing-script sequence must NOT survive into the markup,
    // otherwise the HTML parser would terminate the ld+json <script> early.
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("\\u003c/script\\u003e");
  });

  it("escapes <, >, & and JS line separators but stays valid JSON", () => {
    const evil = {
      name: "A < B & C > D",
      sep: `x${LS}y${PS}z`,
    };
    const out = serializeJsonLd(evil);
    expect(out).not.toMatch(/[<>&\u2028\u2029]/);
    // Round-trips back to the original object — escaping is lossless.
    expect(JSON.parse(out)).toEqual(evil);
  });

  it("leaves benign content structurally identical to JSON.stringify", () => {
    const plain = { "@type": "LocalBusiness", name: "Marko Vodoinstalater", rating: 5 };
    expect(serializeJsonLd(plain)).toBe(JSON.stringify(plain));
  });

  it("jsonLdScriptProps emits the escaped html and ld+json type", () => {
    const props = jsonLdScriptProps({ name: "</script>" });
    expect(props.type).toBe("application/ld+json");
    expect(props.dangerouslySetInnerHTML.__html).not.toContain("</script>");
  });
});
