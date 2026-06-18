/**
 * Loading skeleton for the gated career pages (landing / sectors / pool).
 * Neutral placeholder blocks while the server-side read-RPC resolves — shown by
 * Next's Suspense boundary during navigation/ISR. No data, no accent noise.
 */
export default function CareerLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-32">
      <div className="animate-pulse space-y-6">
        <div className="mx-auto h-8 w-48 rounded-lg bg-gray-200 dark:bg-white/10" />
        <div className="mx-auto h-12 w-3/4 rounded-lg bg-gray-200 dark:bg-white/10" />
        <div className="mx-auto h-4 w-2/3 rounded bg-gray-200 dark:bg-white/10" />
        <div className="h-12 w-full rounded-xl bg-gray-200 dark:bg-white/10" />
        <div className="grid grid-cols-2 gap-3 pt-6 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-gray-200 dark:bg-white/10"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
