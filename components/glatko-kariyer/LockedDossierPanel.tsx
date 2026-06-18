import { Lock } from "lucide-react";
import { ExpressInterestButton } from "@/components/glatko-kariyer/ExpressInterestButton";

/**
 * Worker-detail RIGHT column (Spec 06 §"RIGHT column"). SYNC server-render — the
 * only client island it hosts is <ExpressInterestButton>. This is the resting
 * LOCKED state of the dossier: identity/docs stay hidden until RoNa Legal
 * approval + fee (there is NO in-page unlocked variant — the unlocked dossier
 * renders in the EMPLOYER DASHBOARD, never here).
 *
 * No identity ever flows through this component: it renders only the locked copy
 * + the labels of the fields that WILL be revealed, never their values. The
 * showcase types carry no name/phone/email/passport field by construction (R8 #1).
 *
 * Accent is amber / brandCareer (swaps health's sky/brandHealth). The container
 * mirrors health's neutral aside fallback box
 * (`lg:sticky lg:top-24 rounded-2xl border bg-white ... shadow-premium-sm`); the
 * Lock header glyph + lock list glyphs use amber to signal "unlock path", not
 * red/danger.
 */
export function LockedDossierPanel({
  workerCode,
  requisitionId,
  isEmployer,
  alreadyExpressed,
  locale,
  labels,
}: {
  workerCode: string;
  requisitionId?: string;
  isEmployer: boolean;
  alreadyExpressed: boolean;
  locale: string;
  labels: {
    title: string;
    body: string;
    lockedItemsTitle: string;
    itemFullName: string;
    itemContact: string;
    itemLocation: string;
    itemPassport: string;
    itemDocuments: string;
    itemPhotos: string;
  };
}) {
  // Locked-fields list — labels only, never values (the showcase data layer
  // carries none of these). Each row gets an amber lock glyph (Spec 06 §RIGHT).
  const lockedItems = [
    labels.itemFullName,
    labels.itemContact,
    labels.itemLocation,
    labels.itemPassport,
    labels.itemDocuments,
    labels.itemPhotos,
  ];

  return (
    <div className="lg:sticky lg:top-24 rounded-2xl border border-gray-200 bg-white p-5 shadow-premium-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brandCareer-50 text-brandCareer-700 dark:bg-brandCareer/15 dark:text-brandCareer">
          <Lock className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {labels.title}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-white/50">
            {labels.body}
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-gray-100 pt-4 dark:border-white/5">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-white/40">
          {labels.lockedItemsTitle}
        </p>
        <ul className="mt-3 space-y-2">
          {lockedItems.map((item) => (
            <li
              key={item}
              className="flex items-center gap-2 text-sm text-gray-600 dark:text-white/60"
            >
              <Lock className="h-3.5 w-3.5 shrink-0 text-brandCareer-700 dark:text-brandCareer" />
              <span className="truncate">{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Conversion event — the only client island on this surface. Identity/role
          is resolved server-side and passed as props (R1); the worker is never
          charged (R7 — no fee/price UI here). */}
      <div className="mt-5">
        <ExpressInterestButton
          workerCode={workerCode}
          requisitionId={requisitionId}
          isEmployer={isEmployer}
          alreadyExpressed={alreadyExpressed}
          locale={locale}
        />
      </div>
    </div>
  );
}
