import {
  Activity,
  Apple,
  Baby,
  Bone,
  Brain,
  Ear,
  Eye,
  HeartPulse,
  Pill,
  Smile,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

/**
 * Specialty slug → lucide icon for the directory (sky/brandHealth accent applied
 * by the caller). Slugs are the seed identifiers (migration 067); anything
 * unmapped falls back to Stethoscope, so a new specialty never breaks the UI.
 * Only icons confirmed to exist in lucide-react are referenced.
 */
const ICON_BY_SLUG: Record<string, LucideIcon> = {
  "dis-hekimi": Smile,
  "aile-hekimi": Stethoscope,
  psikolog: Brain,
  psikiyatr: Brain,
  dermatolog: Activity,
  kardiyolog: HeartPulse,
  "cocuk-doktoru": Baby,
  "kadin-dogum": Stethoscope,
  "goz-doktoru": Eye,
  kbb: Ear,
  ortopedi: Bone,
  norolog: Brain,
  urolog: Stethoscope,
  dahiliye: Stethoscope,
  endokrinolog: Activity,
  gastroenterolog: Pill,
  fizyoterapist: Activity,
  diyetisyen: Apple,
  "genel-cerrah": Stethoscope,
  radyolog: Activity,
};

export function specialtyIcon(slug: string): LucideIcon {
  return ICON_BY_SLUG[slug] ?? Stethoscope;
}
