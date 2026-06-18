import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Unit-test runner for pure logic (H4 availability engine et al). Next/Jest are not
 * involved. `server-only` is aliased to an empty stub so modules that carry the
 * spec-mandated `import "server-only"` marker (e.g. lib/saglik/availability.ts) still
 * import cleanly under Node/vitest — the marker only guards against client bundling,
 * and the engine itself holds no secrets.
 */
export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
      // next-intl's createNavigation imports `next/navigation` (no extension); Vite's
      // ESM resolver needs the explicit file. Pin it so @/i18n/navigation (used by the
      // H6 reminder URL formatter) imports cleanly under vitest.
      "next/navigation": path.resolve(__dirname, "node_modules/next/navigation.js"),
      "@": path.resolve(__dirname),
    },
  },
  // Vite 8 transforms with oxc (not esbuild). The automatic JSX runtime lets the
  // transform handle the .tsx React-Email templates pulled in transitively by
  // lib/saglik/reminders-dispatch (H6) without a JSX pragma.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  // Inline next-intl so its `next/navigation` (extensionless) import is transformed by
  // vitest and picks up the resolve.alias above (otherwise it's treated as an external
  // bare import and Node's ESM resolver rejects the missing extension).
  ssr: {
    noExternal: ["next-intl"],
  },
  test: {
    include: ["lib/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
  },
});
