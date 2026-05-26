import {
  DocumentTextIcon,
  EarthGlobeIcon,
  HashIcon,
  StarIcon,
  TagIcon,
  UserIcon,
} from "@sanity/icons";
import type { StructureBuilder } from "sanity/structure";

/**
 * Custom desk structure for the Glatko Studio.
 *
 * The default Sanity structure lists every document type alphabetically;
 * this structure groups by editor intent: Articles (with Featured /
 * By language quick filters), then the supporting documents (Authors,
 * Blog Categories, Tags). Pattern lifted from RoNa's structure.
 */
export const structure = (S: StructureBuilder) =>
  S.list()
    .title("Content")
    .items([
      S.listItem()
        .title("All articles")
        .icon(DocumentTextIcon)
        .child(
          S.documentTypeList("post")
            .title("All articles")
            .defaultOrdering([{ field: "publishedAt", direction: "desc" }]),
        ),

      S.listItem()
        .title("Featured")
        .icon(StarIcon)
        .child(
          S.documentList()
            .title("Featured articles")
            .filter('_type == "post" && featured == true')
            .defaultOrdering([{ field: "publishedAt", direction: "desc" }]),
        ),

      S.listItem()
        .title("By language")
        .icon(EarthGlobeIcon)
        .child(
          S.list()
            .title("Articles by language")
            .items([
              langItem(S, "me", "Crnogorski"),
              langItem(S, "tr", "Türkçe"),
              langItem(S, "en", "English"),
              langItem(S, "ru", "Русский"),
              langItem(S, "de", "Deutsch"),
              langItem(S, "it", "Italiano"),
              langItem(S, "sr", "Srpski"),
              langItem(S, "ar", "العربية"),
              langItem(S, "uk", "Українська"),
            ]),
        ),

      S.divider(),

      S.listItem()
        .title("Authors")
        .icon(UserIcon)
        .child(S.documentTypeList("author").title("Authors")),

      S.listItem()
        .title("Blog categories")
        .icon(TagIcon)
        .child(
          S.documentTypeList("category")
            .title("Blog categories")
            .defaultOrdering([{ field: "order", direction: "asc" }]),
        ),

      S.listItem()
        .title("Tags")
        .icon(HashIcon)
        .child(S.documentTypeList("tag").title("Tags")),
    ]);

function langItem(S: StructureBuilder, locale: string, label: string) {
  return S.listItem()
    .title(label)
    .child(
      S.documentList()
        .title(`${label} articles`)
        .filter(
          `_type == "post" && defined(slug.${locale}.current) && length(coalesce(title.${locale}, "")) > 0`,
        )
        .defaultOrdering([{ field: "publishedAt", direction: "desc" }]),
    );
}
