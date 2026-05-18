#!/usr/bin/env bash
set -uo pipefail

# verify-seo-canonical.sh
#
# Sanity-check canonical + hreflang counts on a running server. Defaults to
# the local dev server (http://localhost:3001); pass a base URL as $1 to point
# at production or a Vercel preview, e.g.:
#   bash scripts/verify-seo-canonical.sh https://glatko.app
#
# Each probed page must emit:
#   - EXACTLY 1 `<link rel="canonical">`
#   - EXACTLY 10 hreflang alternates (9 locales + x-default)
#
# IMPORTANT: The locale → path-word maps below MUST be kept in sync with
# i18n/routing.ts `pathnames`. If you add a route or rename a localized slug
# in routing.ts, mirror it here and rerun: npm run verify:seo
# This intentional duplication keeps the script CI-portable (no ts-node dep,
# no Next.js runtime needed — just bash + curl + grep).
#
# Bash 3.2 compatible (no associative arrays) so it runs on stock macOS.

BASE="${1:-http://localhost:3001}"

LOCALES=(tr en de it ru uk sr me ar)

# Source of truth: i18n/routing.ts pathnames.
services_slug() {
  case "$1" in
    tr) echo "hizmetler" ;;
    en) echo "services" ;;
    de) echo "dienstleistungen" ;;
    it) echo "servizi" ;;
    ru) echo "uslugi" ;;
    uk) echo "posluhy" ;;
    sr|me) echo "usluge" ;;
    ar) echo "al-khadamat" ;;
  esac
}

about_slug() {
  case "$1" in
    tr) echo "hakkimizda" ;;
    en) echo "about" ;;
    de) echo "ueber-uns" ;;
    it) echo "chi-siamo" ;;
    ru) echo "o-nas" ;;
    uk) echo "pro-nas" ;;
    sr|me) echo "o-nama" ;;
    ar) echo "man-nahnu" ;;
  esac
}

contact_slug() {
  case "$1" in
    tr) echo "iletisim" ;;
    en) echo "contact" ;;
    de) echo "kontakt" ;;
    it) echo "contatti" ;;
    ru|uk) echo "kontakty" ;;
    sr|me) echo "kontakt" ;;
    ar) echo "ittasil-bina" ;;
  esac
}

PASS=0
FAIL=0

probe() {
  local label="$1"
  local url="$2"
  local exp_can="$3"
  local exp_hre="$4"

  local html
  html=$(curl -sL -A "Mozilla/5.0 verify-seo" "$url" 2>/dev/null || true)
  if [ -z "$html" ]; then
    echo "❌ $label  URL unreachable: $url"
    FAIL=$((FAIL + 1))
    return
  fi

  local can hre
  can=$(printf '%s' "$html" | grep -oE 'rel="canonical"' | wc -l | tr -d ' ')
  hre=$(printf '%s' "$html" | grep -oE 'hrefLang="[^"]+"' | wc -l | tr -d ' ')

  if [ "$can" = "$exp_can" ] && [ "$hre" = "$exp_hre" ]; then
    printf '✅ %-60s canonical=%s hreflang=%s\n' "$label" "$can" "$hre"
    PASS=$((PASS + 1))
  else
    printf '❌ %-60s canonical=%s (exp %s) hreflang=%s (exp %s)  %s\n' \
      "$label" "$can" "$exp_can" "$hre" "$exp_hre" "$url"
    FAIL=$((FAIL + 1))
  fi
}

echo "🔍 SEO canonical/hreflang verify against $BASE"
echo "================================================================"

# Locale homepages — every page must have 1 canonical + 10 hreflang.
echo "--- homepages ---"
for l in "${LOCALES[@]}"; do
  probe "/${l}" "${BASE}/${l}" 1 10
done

# /services index per locale.
echo "--- /services index ---"
for l in "${LOCALES[@]}"; do
  s=$(services_slug "$l")
  probe "/${l}/${s}" "${BASE}/${l}/${s}" 1 10
done

# /services/[slug] per locale — sample slug `airbnb-management` seeded P0.
echo "--- /services/[slug] (sample: airbnb-management) ---"
for l in "${LOCALES[@]}"; do
  s=$(services_slug "$l")
  probe "/${l}/${s}/airbnb-management" "${BASE}/${l}/${s}/airbnb-management" 1 10
done

# /about per locale (per-locale path).
echo "--- /about ---"
for l in "${LOCALES[@]}"; do
  a=$(about_slug "$l")
  probe "/${l}/${a}" "${BASE}/${l}/${a}" 1 10
done

# /contact per locale (per-locale path).
echo "--- /contact ---"
for l in "${LOCALES[@]}"; do
  c=$(contact_slug "$l")
  probe "/${l}/${c}" "${BASE}/${l}/${c}" 1 10
done

echo "================================================================"
echo "TOTAL: PASS=${PASS}  FAIL=${FAIL}"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
