import type { Metadata } from "next";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { isHealthVerticalEnabled } from "@/lib/saglik/flags";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  // Server-only flag → prop. The Appointments tab is a health-vertical surface; with the
  // vertical off (prod) it must not appear (the client nav can't read the flag itself).
  const showAppointments = isHealthVerticalEnabled();
  return (
    // pt-16 clears the fixed 64px GlatkoHeader (h-16) once, for the whole
    // settings subtree — so SettingsNav (the first in-flow element) is no longer
    // overlapped by the header. Child pages therefore use normal top spacing
    // (not their own header-clearing pt-28) to avoid a double offset.
    <div className="pt-16">
      <SettingsNav showAppointments={showAppointments} />
      {children}
    </div>
  );
}
