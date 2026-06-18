"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, ShieldCheck, Trash2, Download } from "lucide-react";

/**
 * Glatko Sağlık — H10 data-subject rights request (Client Component).
 *
 * Rendered on the manage page (the patient already proved identity with the
 * manage_token). Lets the patient request deletion or an export of their data
 * (PDPL 15-day SLA). POSTs {token, type} to /api/health/data-request — the server
 * resolves the patient from the token (never trusts a client id) and files a queue
 * row the admin actions out-of-band. No PII is collected or shown here; the token
 * is passed straight through to the rate-limited, flag-gated endpoint.
 */

type RequestType = "delete" | "export";
type State = "idle" | "confirm" | "busy" | "done" | "error";

export function DataRightsRequest({ token }: { token: string }) {
  const t = useTranslations("healthVertical.dataRequest");

  const [pending, setPending] = useState<RequestType | null>(null);
  const [state, setState] = useState<State>("idle");

  async function submit(type: RequestType) {
    setState("busy");
    try {
      const res = await fetch("/api/health/data-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, type }),
      });
      const payload: { ok?: boolean } = await res.json().catch(() => ({}));
      setState(res.ok && payload.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  function ask(type: RequestType) {
    setPending(type);
    setState("confirm");
  }

  if (state === "done") {
    return (
      <section className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-5 dark:border-teal-500/30 dark:bg-teal-500/10">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t("doneTitle")}</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-white/70">{t("doneBody")}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-premium-sm dark:border-white/10 dark:bg-white/5">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t("title")}</h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-white/70">{t("intro")}</p>

      {state === "error" && (
        <p role="alert" aria-live="assertive" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {t("error")}
        </p>
      )}

      {state === "confirm" && pending ? (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
          <p className="text-sm text-gray-700 dark:text-white/80">
            {pending === "delete" ? t("confirmDelete") : t("confirmExport")}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => submit(pending)}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40"
            >
              {t("confirmCta")}
            </button>
            <button
              type="button"
              onClick={() => setState("idle")}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/15 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
            >
              {t("cancelCta")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => ask("export")}
            disabled={state === "busy"}
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
          >
            {state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" aria-hidden />}
            {t("exportCta")}
          </button>
          <button
            type="button"
            onClick={() => ask("delete")}
            disabled={state === "busy"}
            className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {t("deleteCta")}
          </button>
        </div>
      )}
    </section>
  );
}
