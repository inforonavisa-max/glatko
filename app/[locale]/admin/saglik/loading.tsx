/**
 * H10 — loading skeleton for the admin health section (parity with the patient/
 * provider trees). Neutral pulse blocks (metric cards + list rows) while the
 * service-role admin reads resolve.
 */
export default function HealthAdminLoading() {
  return (
    <div>
      <div className="animate-pulse">
        <div className="mb-6">
          <div className="h-8 w-48 rounded-lg bg-gray-200 dark:bg-white/10" />
          <div className="mt-3 h-3 w-64 rounded bg-gray-200 dark:bg-white/10" />
        </div>
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-gray-200 dark:bg-white/10" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-gray-200 dark:bg-white/10" />
          ))}
        </div>
      </div>
    </div>
  );
}
