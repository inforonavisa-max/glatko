/**
 * Sanity schema registry for Glatko.
 *
 * Object schemas first (locale primitives + composites), then documents.
 * Sanity resolves forward references lazily but ordering helps editors
 * read the file. Pattern mirrors RoNa Legal's registry for consistency
 * (see /Users/Shared/dev/ronalegal/sanity/schemas/index.ts).
 */

import type { SchemaTypeDefinition } from "sanity";

// objects — locale primitives
import localeString from "./objects/localeString";
import localeText from "./objects/localeText";
import localeSlug from "./objects/localeSlug";
// objects — Portable Text wrapper (depends on locale primitives)
import localeRichText from "./objects/localeRichText";
// objects — composites
import seoMeta from "./objects/seoMeta";
// objects — body blocks (embedded in localeRichText)
import faqBlock from "./objects/faqBlock";

// documents
import author from "./documents/author";
import category from "./documents/category";
import tag from "./documents/tag";
import post from "./documents/post";

const schemas: SchemaTypeDefinition[] = [
  // objects
  localeString,
  localeText,
  localeSlug,
  localeRichText,
  seoMeta,
  faqBlock,
  // documents
  author,
  category,
  tag,
  post,
];

export default schemas;
