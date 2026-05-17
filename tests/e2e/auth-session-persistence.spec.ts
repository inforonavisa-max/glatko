import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";

const TEST_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD;

if (!TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error(
    "TEST_USER_EMAIL / TEST_USER_PASSWORD missing. Run: node --env-file=.env.local scripts/create-test-user.mjs",
  );
}

const PROTECTED_PATH = "/en/dashboard";
const LOGIN_PATH = "/en/login";
const HOME_PATH = "/en";

const STORAGE_DIR = path.join(__dirname, "..", "..", ".playwright-state");
const STATE_PATH = path.join(STORAGE_DIR, "auth.json");

const BASE64_PREFIX = "base64-";
const MAX_CHUNK_SIZE = 3180; // matches @supabase/ssr utils/chunker.ts

function projectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL not set in test env");
  const match = url.match(/https?:\/\/([^.]+)\./);
  if (!match) throw new Error("Could not parse Supabase project ref from URL");
  return match[1];
}

async function loginViaUI(page: Page) {
  await page.goto(LOGIN_PATH);
  await page.locator("#email").fill(TEST_EMAIL!);
  await page.locator("#password").fill(TEST_PASSWORD!);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 }),
    page.locator('form button[type="submit"]').click(),
  ]);
}

async function expectLoggedIn(page: Page, label: string) {
  // The middleware (supabase/middleware.ts) is the only thing that redirects
  // on missing user, so a protected route is the cleanest auth-state probe.
  await page.goto(PROTECTED_PATH);
  await expect(page, label).not.toHaveURL(/\/login(\?|$)/);
}

async function expectLoggedOut(page: Page, label: string) {
  await page.goto(PROTECTED_PATH);
  await expect(page, label).toHaveURL(/\/login(\?|$)/);
}

async function snapshotAuthChunks(
  context: BrowserContext,
): Promise<{ name: string; value: string }[]> {
  const prefix = `sb-${projectRef()}-auth-token`;
  return (await context.cookies())
    .filter((c) => c.name === prefix || c.name.startsWith(`${prefix}.`))
    .map((c) => ({ name: c.name, value: c.value }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/**
 * Forge an expired `expires_at` in the sb-<ref>-auth-token cookie so the next
 * middleware request triggers @supabase/ssr's refresh path. This is what
 * exposes the chunked-cookie bug in supabase/middleware.ts:60 — the deprecated
 * `set` callback reassigns `response = NextResponse.next(...)` per call, which
 * clobbers earlier chunks during multi-cookie refresh.
 */
async function expireAccessToken(context: BrowserContext) {
  const prefix = `sb-${projectRef()}-auth-token`;
  const all = await context.cookies();
  const chunks = all
    .filter((c) => c.name === prefix || c.name.startsWith(`${prefix}.`))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
  if (chunks.length === 0) {
    throw new Error(
      `No ${prefix} cookies found in context — did login complete?`,
    );
  }

  const combined = chunks.map((c) => c.value).join("");
  if (!combined.startsWith(BASE64_PREFIX)) {
    throw new Error(`Unexpected cookie payload (missing ${BASE64_PREFIX} prefix)`);
  }

  const jsonStr = Buffer.from(
    combined.slice(BASE64_PREFIX.length),
    "base64url",
  ).toString("utf8");
  const session = JSON.parse(jsonStr) as {
    access_token: string;
    expires_at?: number;
    expires_in?: number;
    refresh_token: string;
  };

  session.expires_at = Math.floor(Date.now() / 1000) - 100;
  if (typeof session.expires_in === "number") session.expires_in = -100;

  const newPayload =
    BASE64_PREFIX +
    Buffer.from(JSON.stringify(session)).toString("base64url");

  type NewCookie = Parameters<BrowserContext["addCookies"]>[0][number];
  const newCookies: NewCookie[] = [];
  const template = chunks[0];
  const baseAttrs: Omit<NewCookie, "name" | "value"> = {
    domain: template.domain,
    path: template.path,
    expires: template.expires,
    httpOnly: template.httpOnly,
    secure: template.secure,
    sameSite: template.sameSite,
  };

  if (newPayload.length <= MAX_CHUNK_SIZE) {
    newCookies.push({ ...baseAttrs, name: prefix, value: newPayload });
  } else {
    let pos = 0;
    let i = 0;
    while (pos < newPayload.length) {
      newCookies.push({
        ...baseAttrs,
        name: `${prefix}.${i}`,
        value: newPayload.slice(pos, pos + MAX_CHUNK_SIZE),
      });
      pos += MAX_CHUNK_SIZE;
      i += 1;
    }
  }

  // Wipe every existing chunk before re-seeding so we never leave stale chunks
  // around from the previous payload size.
  for (const c of chunks) {
    await context.clearCookies({ name: c.name });
  }
  await context.addCookies(newCookies);
}

test.describe.serial("auth session persistence", () => {
  test.beforeAll(async () => {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  });

  test("1. login then page reload keeps the session", async ({ page }) => {
    await loginViaUI(page);
    await page.reload();
    await expectLoggedIn(page, "still logged in after reload");
  });

  test("2. login then new page in same context keeps the session", async ({
    context,
    page,
  }) => {
    await loginViaUI(page);
    await page.close();
    const fresh = await context.newPage();
    await expectLoggedIn(fresh, "still logged in in a new tab");
  });

  test("3. login then storageState restore in new context survives middleware-triggered refresh", async ({
    browser,
    page,
  }) => {
    await loginViaUI(page);
    await page.context().storageState({ path: STATE_PATH });
    await page.close();

    const restoredContext = await browser.newContext({ storageState: STATE_PATH });
    try {
      // Simulate "user comes back after access_token expired" — this is what
      // the production complaint maps to: idle → return → middleware refresh
      // path runs → must NOT corrupt cookies.
      const before = await snapshotAuthChunks(restoredContext);
      expect(before.length, "test prerequisite: cookies must be chunked").toBeGreaterThanOrEqual(2);

      await expireAccessToken(restoredContext);
      const restored = await restoredContext.newPage();

      // Count Set-Cookie chunks the middleware actually wrote on the
      // refresh-triggering response. The deprecated set callback in
      // supabase/middleware.ts reassigned `response` per call, so the bug
      // surfaces as "the browser only received the last chunk's Set-Cookie".
      const authChunkSetCookies = new Set<string>();
      restored.on("response", async (resp) => {
        const url = new URL(resp.url());
        if (url.pathname !== PROTECTED_PATH) return;
        for (const h of await resp.headersArray()) {
          if (h.name.toLowerCase() !== "set-cookie") continue;
          const m = h.value.match(/^(sb-[\w-]+-auth-token(?:\.\d+)?)=/);
          if (m) authChunkSetCookies.add(m[1]);
        }
      });

      // First hit: middleware notices expiry, performs refresh, writes new cookies.
      await restored.goto(PROTECTED_PATH);
      await expect(
        restored,
        "first hit after expiry must succeed (refresh)",
      ).not.toHaveURL(/\/login(\?|$)/);

      const sentChunks = Array.from(authChunkSetCookies);
      expect(
        sentChunks.length,
        `middleware must rewrite every chunk during a chunked-cookie refresh; only ${sentChunks.length} Set-Cookie chunk(s) sent: ${sentChunks.join(", ") || "(none)"}. Pre-fix bug clobbered the response per set() call — see supabase/middleware.ts.`,
      ).toBeGreaterThanOrEqual(before.length);

      // Second hit: browser sends the cookies set by the previous response.
      // If the middleware clobbered chunks, those cookies are corrupt and the
      // user is bounced to /login here.
      await expectLoggedIn(
        restored,
        "second hit after refresh must stay logged in (chunked-cookie regression)",
      );
    } finally {
      await restoredContext.close();
    }
  });

  test("4. explicit logout via header signs the user out", async ({ page }) => {
    await loginViaUI(page);
    await page.goto(HOME_PATH, { waitUntil: "networkidle" });
    // GlatkoHeader.tsx:213 — the desktop avatar button is the only header
    // button containing a User svg. md:flex hides it on mobile but the test
    // viewport is Desktop Chrome (1280×720), so it's interactive.
    const avatar = page.locator("header button:has(svg.lucide-user)").first();
    await avatar.waitFor({ state: "visible", timeout: 15_000 });
    await avatar.click();
    const logoutBtn = page.getByRole("button", {
      name: /sign out|log out|logout|çıkış/i,
    });
    await logoutBtn.waitFor({ state: "visible", timeout: 5_000 });
    await logoutBtn.click();
    // handleLogout (GlatkoHeader.tsx:65) calls supabase.auth.signOut() then
    // hard-navigates with window.location.href. Wait for the sb-* cookies to
    // be wiped before probing the protected route.
    await page.waitForFunction(
      () => !document.cookie.split(";").some((c) => c.trim().startsWith("sb-")),
      undefined,
      { timeout: 15_000 },
    );
    await expectLoggedOut(page, "must be logged out after clicking Sign Out");
  });
});
