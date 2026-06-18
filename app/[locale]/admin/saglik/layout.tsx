import { notFound } from "next/navigation";
import { isHealthVerticalEnabled } from "@/lib/saglik/flags";

// Demir Kural 1: the health vertical ships dark. The parent admin layout only gates
// isAdminEmail, and `admin` is NOT in the middleware HEALTH_*_FIRST_SEGMENTS, so without
// this layout the whole /admin/saglik subtree (queue / detail / audit / consent /
// randevular / talepler) would be reachable by a logged-in admin with the flag OFF —
// reading + mutating live health data via the service-role RPCs. This flag guard 404s the
// entire subtree until launch (H11). The server actions in ./actions.ts are guarded
// independently (a server action is POST-invokable even if its page 404s).
export default function HealthAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isHealthVerticalEnabled()) notFound();
  return children;
}
