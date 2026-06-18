import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Users,
} from "lucide-react";

import { createAdminClient } from "@/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ locale: string }> | { locale: string };
}

// One UN-anonymized unlock row as projected by career_admin_list_unlocks (076).
// Worker is identified by CODE only — NEVER name/contact (R7/R8 #9). employerCompany
// is the only employer-side field and is not rendered on this read-only dashboard.
interface AdminUnlock {
  id: string;
  requisitionId: string;
  workerCode: string;
  employerCompany: string | null;
  interestAt: string | null;
  ownerApproved: boolean;
  paymentStatus: "unpaid" | "invoiced" | "paid" | string;
  feeInvoiceId: string | null;
  unlockedAt: string | null;
}

// A derived "lifecycle state" for the recent-activity badge — computed from the
// unlock's (ownerApproved, paymentStatus) pair, not a raw DB column.
type UnlockState = "pending" | "approved" | "unlocked";

interface RecentActivity {
  id: string;
  workerCode: string;
  state: UnlockState;
  at: string | null;
}

// An unlock is in the owner's action queue when it is NOT yet fully released:
// awaiting approval, or approved but not yet paid (mirrors the spec gate criterion).
function isPendingUnlock(u: AdminUnlock): boolean {
  return !u.ownerApproved || u.paymentStatus !== "paid";
}

function unlockState(u: AdminUnlock): UnlockState {
  if (u.ownerApproved && u.paymentStatus === "paid") return "unlocked";
  if (u.ownerApproved) return "approved";
  return "pending";
}

/**
 * Count-only / payload-derived owner-console stats. Every metric is read via the
 * service-role admin client (R1 N/A — admin/service path is the intended caller).
 *
 * SOURCES (see Spec 23 GAP — `career.*` base tables are NOT PostgREST-exposed, so
 * `.from("career.requisitions")` cannot work; only the PUBLIC showcase VIEW and the
 * public `career_admin_*` SECURITY DEFINER RPCs are reachable from supabase-js):
 *  - showcasedWorkers → head:true count on the PUBLIC `career_worker_showcase` VIEW
 *    (the VIEW already filters is_showcased = true; never touches the private base table).
 *  - pendingUnlocks + recentActivity → derived from the `career_admin_list_unlocks`
 *    RPC payload (PII-light: worker_code + state only).
 *  - openRequisitions → KNOWN GAP: migration 076 exposes NO count-only or list RPC for
 *    `career.requisitions`, and the base table is not PostgREST-reachable. Until such an
 *    RPC lands (coordinate with the migration owner — R15, no prod apply without go) this
 *    renders 0 via the same default-to-zero degradation as every other count, so the page
 *    never blanks.
 *
 * Each source is independently guarded: a failed/empty result defaults to 0 / [] (never
 * blanks the whole page); only an unexpected throw bubbles to the admin error boundary.
 */
async function getDashboardStats() {
  const admin = createAdminClient();

  const [showcasedRes, unlocksRes] = await Promise.all([
    // PUBLIC view — count-only, no rows pulled (head:true).
    admin
      .from("career_worker_showcase")
      .select("worker_code", { count: "exact", head: true }),
    // PII-light owner unlock list (076). null filter = all payment statuses.
    admin.rpc("career_admin_list_unlocks", { p_status: null }),
  ]);

  const unlocks: AdminUnlock[] = unlocksRes.error
    ? []
    : ((unlocksRes.data ?? []) as AdminUnlock[]);

  const pendingUnlocks = unlocks.filter(isPendingUnlock).length;

  const recentActivity: RecentActivity[] = unlocks
    .slice(0, 10)
    .map((u) => ({
      id: u.id,
      workerCode: u.workerCode,
      state: unlockState(u),
      at: u.unlockedAt ?? u.interestAt ?? null,
    }));

  return {
    // KNOWN GAP (see above): no requisitions count RPC yet → 0.
    openRequisitions: 0,
    pendingUnlocks,
    showcasedWorkers: showcasedRes.count ?? 0,
    recentActivity,
  };
}

export default async function AdminCareerDashboardPage({ params }: Props) {
  await Promise.resolve(params); // setRequestLocale already called in the admin layout
  const stats = await getDashboardStats();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white md:text-3xl">
          Kariyer — Yönetim
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-white/50">
          İş &amp; Kariyer dikey genel durumu
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          icon={
            <ClipboardList className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          }
          label="Açık Talepler"
          value={stats.openRequisitions}
        />
        <KpiCard
          icon={<Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
          label="Bekleyen Açılımlar"
          value={stats.pendingUnlocks}
          subtitle={
            stats.pendingUnlocks > 0 ? "Onay/ödeme bekliyor" : undefined
          }
          subtitleAccent={stats.pendingUnlocks > 0}
        />
        <KpiCard
          icon={<Users className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
          label="Vitrindeki İşçiler"
          value={stats.showcasedWorkers}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Son Aktivite</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentActivity.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500 dark:text-white/50">
              Henüz kariyer aktivitesi yok
            </div>
          ) : (
            <div className="space-y-2">
              {stats.recentActivity.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm font-medium text-gray-900 dark:text-white">
                      {item.workerCode}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-white/50">
                      {item.at ? new Date(item.at).toLocaleString("tr") : "—"}
                    </div>
                  </div>
                  <ActivityStateBadge state={item.state} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  subtitle,
  subtitleAccent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  subtitle?: string;
  subtitleAccent?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white/50">
          {label}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-gray-900 dark:text-white">
          {value}
        </div>
        {subtitle ? (
          <div
            className={cn(
              "mt-1 text-xs",
              subtitleAccent
                ? "font-medium text-amber-600 dark:text-amber-400"
                : "text-gray-500 dark:text-white/50",
            )}
          >
            {subtitle}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ActivityStateBadge({ state }: { state: UnlockState }) {
  const map: Record<
    string,
    { label: string; className: string; Icon: typeof Clock }
  > = {
    pending: {
      label: "Onay bekliyor",
      className:
        "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
      Icon: Clock,
    },
    approved: {
      label: "Onaylandı",
      className:
        "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
      Icon: AlertCircle,
    },
    unlocked: {
      label: "Açıldı",
      className:
        "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
      Icon: CheckCircle2,
    },
  };
  const cfg = map[state] ?? map.pending;
  const { Icon } = cfg;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        cfg.className,
      )}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}
