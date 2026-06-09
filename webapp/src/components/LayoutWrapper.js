"use client";

import { usePathname } from 'next/navigation';
import AppLayout from './AppLayout';

export default function LayoutWrapper({ children }) {
  const pathname = usePathname();
  
  // Do not apply AppLayout to the login page or the system-hub home page
  if (pathname === '/' || pathname === '/home') {
    return <>{children}</>;
  }
  
  // Apply persistent AppLayout to all other pages
  return <AppLayout>{children}</AppLayout>;
}
