"use client";

import { usePathname } from 'next/navigation';
import AppLayout from './AppLayout';
import IdleLogout from './IdleLogout';

export default function LayoutWrapper({ children }) {
  const pathname = usePathname();

  // The login page has no session yet — no layout, no idle timer.
  if (pathname === '/') {
    return <>{children}</>;
  }

  // The system-hub home page renders bare (no AppLayout chrome); every other
  // page gets the persistent AppLayout. Both are authenticated, so the idle
  // auto-logout watcher runs on top of either.
  const body = pathname === '/home' ? <>{children}</> : <AppLayout>{children}</AppLayout>;
  return (
    <>
      <IdleLogout />
      {body}
    </>
  );
}
