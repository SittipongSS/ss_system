"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseBrowser";
import { apiCache } from "@/lib/apiCache";
import Modal from "@/components/Modal";

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Auto-logout after a period of inactivity. Mounted once (in LayoutWrapper) on
// every authenticated page. A warning modal appears WARN_BEFORE_MS before the
// cut-off; any real activity (mouse/keyboard/touch/scroll) resets the clock and
// dismisses the warning, so an active user is never logged out.
//
// No-op when Supabase isn't configured (local dev) — there's no real session to
// end, and redirecting to "/" would just bounce back via the dev fallback.
const IDLE_LIMIT_MS = 60 * 60 * 1000; // 1 hour
const WARN_BEFORE_MS = 60 * 1000; // show the warning for the final minute

export default function IdleLogout() {
  const router = useRouter();
  const lastActivityRef = useRef(0);
  const loggingOutRef = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState(null); // non-null => warning visible

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return;
    lastActivityRef.current = Date.now(); // start the idle clock on mount

    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, markActivity, { passive: true }));

    const logout = async () => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      try {
        await createClient().auth.signOut();
      } catch {}
      apiCache.clear(); // don't leak the outgoing user's cached data to the next login
      router.replace("/");
    };

    const tick = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= IDLE_LIMIT_MS) {
        logout();
      } else if (idle >= IDLE_LIMIT_MS - WARN_BEFORE_MS) {
        setSecondsLeft(Math.ceil((IDLE_LIMIT_MS - idle) / 1000));
      } else {
        setSecondsLeft((prev) => (prev === null ? prev : null));
      }
    }, 1000);

    return () => {
      clearInterval(tick);
      events.forEach((e) => window.removeEventListener(e, markActivity));
    };
  }, [router]);

  const stayActive = () => {
    lastActivityRef.current = Date.now();
    setSecondsLeft(null);
  };

  if (secondsLeft === null) return null;

  return (
    <Modal open onClose={stayActive} title="กำลังจะออกจากระบบ" size="sm" dismissible={false}>
      <div className="p-2">
        <p className="text-[var(--text-2)]">
          คุณไม่ได้ใช้งานมาสักพัก ระบบจะออกจากระบบอัตโนมัติใน{" "}
          <span className="font-semibold text-[var(--text)]">{secondsLeft}</span> วินาที
        </p>
        <div className="flex justify-end gap-2 mt-8 pt-6 border-t border-[var(--border)]">
          <button onClick={stayActive} className="btn btn-primary px-8">
            ใช้งานต่อ
          </button>
        </div>
      </div>
    </Modal>
  );
}
