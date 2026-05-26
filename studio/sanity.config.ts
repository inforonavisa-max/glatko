/**
 * Sanity Studio configuration for Glatko.
 *
 * Standalone studio: its own React-19 package in `studio/`, deployed to
 * glatko.sanity.studio via `sanity deploy`. Two top-nav tools:
 *   - structureTool with the custom desk hierarchy from
 *     ./structure/structure.ts (All / Featured / By language / Authors /
 *     Categories / Tags)
 *   - visionTool for ad-hoc GROQ query testing.
 *
 * G-CMS-1 v1: no singletons yet (siteSettings/legalPage are RoNa-specific
 * and add complexity we don't need on day one). When/if Glatko grows a
 * site-settings document, lift the `document.actions` filter pattern from
 * RoNa's config.
 */

import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";

import schemas from "./schemas";
import { structure } from "./structure/structure";

const SANITY_API_VERSION = "2025-02-19";

export default defineConfig({
  name: "glatko",
  title: "Glatko Content",
  projectId: "txobbpuq",
  dataset: "production",
  plugins: [
    structureTool({ structure }),
    visionTool({ defaultApiVersion: SANITY_API_VERSION }),
  ],
  schema: { types: schemas },
});
