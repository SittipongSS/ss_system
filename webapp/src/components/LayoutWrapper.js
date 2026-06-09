"use client";

import { usePathname } from 'next/navigation';
import AppLayout from './AppLayout';

export default function LayoutWrapper({ children }) {
  const pathname = usePathname();
  
  // Do not apply AppLayout to the login page
  if (pathname === '/') {
    return <>{children}</>;
  }
  
  // Apply persistent AppLayout to all other pages
  return <AppLayout>{children}</AppLayout>;
}
