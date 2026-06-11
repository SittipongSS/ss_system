"use client";

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AppLayout from './AppLayout';
import IdleLogout from './IdleLogout';

export default function LayoutWrapper({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  // On a hard page refresh (F5/reload), always land on the home hub instead of
  // staying on the current deep page. This effect runs once per document load
  // (LayoutWrapper lives in the root layout and does NOT remount on in-app
  // navigation), so a reload is the only thing that triggers it — clicking
  // around the app is unaffected. We skip the login page and the hub itself.
  useEffect(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav?.type === 'reload' && pathname !== '/' && pathname !== '/home') {
      router.replace('/home');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
