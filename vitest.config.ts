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
      "@": path.resolve(__dirname),
    },
  },
  test: {
    include: ["lib/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
  },
});
