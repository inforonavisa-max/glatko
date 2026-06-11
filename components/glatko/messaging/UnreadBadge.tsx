"use client";

import { useCallback, useEffect, useState } from "react";
import { getUnreadMessageCountAction } from "@/app/[locale]/messages/actions";

/** Header unread badge for /messages — thread-only count (G-DEADCODE). */
export function UnreadBadge() {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    const n = await getUnreadMessageCountAction();
    setCount(n);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 45_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  if (count < 1) return null;

  return (
    <span className="ml-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white tabular-nums shadow-sm shadow-rose-500/30">
      {count > 99 ? "99+" : count}
    </span>
  );
}
