import { IBM_Plex_Sans_Thai } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import LayoutWrapper from "@/components/LayoutWrapper";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";

// Render routes dynamically (not static) so the client Router Cache doesn't
// reuse stale page segments — pages always re-mount + refetch on navigation,
// so edits/deletes show up immediately (no 5-min stale window).
export const dynamic = "force-dynamic";

/* ⭐ **ตัวพิมพ์ตัวเดียวทั้งระบบ** (มติผู้ใช้ 2026-08-09) — เดิมโหลด IBM Plex Mono
   มาคู่กัน แต่ Plex Mono ไม่มีชุดไทย ⇒ ฿ (U+0E3F อยู่ในบล็อกไทย) และข้อความไทย
   ในกล่อง mono ตกไปใช้ฟอนต์ระบบ กลายเป็นฟอนต์ที่สาม/สี่บนจอโดยไม่มีใครสั่ง
   เหตุผลเต็มและข้อยกเว้นเดียว (กล่องวางข้อมูลดิบ) อยู่ที่ globals.css บนโทเคน
   `--font-mono` — อย่าเพิ่มฟอนต์ที่นี่โดยไม่แก้ที่นั่นด้วย */
const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  weight: ['400', '500', '600', '700'],
  subsets: ["thai", "latin"],
  variable: "--font-plex-sans",
});

export const metadata = {
  title: "ระบบ Scent and Sense",
  description: "ระบบจัดการทะเบียนสินค้า ลูกค้า ขออนุมัติและยื่นชำระภาษีสรรพสามิต",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th" className={ibmPlexSansThai.variable} suppressHydrationWarning>
      <body className="font-sans antialiased transition-colors duration-300">
        {/* Anti-FOUC theme script. next/script with beforeInteractive is injected
            into <head> and runs before hydration, so the theme is set before
            paint — no flash. Inline scripts require an id (Next.js tracks them). */}
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{
          __html: `
            try {
              if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
                document.documentElement.setAttribute('data-theme', 'dark');
              } else {
                document.documentElement.classList.remove('dark');
                document.documentElement.setAttribute('data-theme', 'light');
              }
            } catch (_) {}
          `,
        }} />
        <ToastProvider>
          <ConfirmProvider>
            <LayoutWrapper>
              {children}
            </LayoutWrapper>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}

