import { defineCliConfig } from "sanity/cli";

/**
 * Standalone studio CLI config. projectId/dataset are hardcoded (public,
 * stable) because this package runs `sanity dev/build/deploy` outside the
 * Next app, so the app's NEXT_PUBLIC_* env isn't present here.
 *
 * `studioHost: "glatko"` deploys to https://glatko.sanity.studio.
 */
export default defineCliConfig({
  api: {
    projectId: "txobbpuq",
    dataset: "production",
  },
  studioHost: "glatko",
});
