/**
 * H10 — route-group loading skeleton for the provider tree (parity with the
 * patient (gated) tree, which already has one). Neutral pulse blocks, no accent —
 * shown by Next's Suspense boundary while a provider page's server reads resolve.
 */
export default function SaglikProLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-32">
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-56 rounded-lg bg-gray-200 dark:bg-white/10" />
        <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-white/10" />
        <div className="space-y-3 pt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-gray-200 dark:bg-white/10" />
          ))}
        </div>
      </div>
    </div>
  );
}
