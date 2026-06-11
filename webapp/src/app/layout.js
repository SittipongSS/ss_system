import { IBM_Plex_Sans_Thai, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import LayoutWrapper from "@/components/LayoutWrapper";

// Render routes dynamically (not static) so the client Router Cache doesn't
// reuse stale page segments — pages always re-mount + refetch on navigation,
// so edits/deletes show up immediately (no 5-min stale window).
export const dynamic = "force-dynamic";

const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  weight: ['400', '500', '600', '700'],
  subsets: ["thai", "latin"],
  variable: "--font-plex-sans",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ['400', '500', '600'],
  subsets: ["latin"],
  variable: "--font-plex-mono",
});

export const metadata = {
  title: "ระบบ Scent and Sense",
  description: "ระบบจัดการทะเบียนสินค้า ลูกค้า ขออนุมัติและยื่นชำระภาษีสรรพสามิต",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th" className={`${ibmPlexSansThai.variable} ${ibmPlexMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
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
      </head>
      <body className="font-sans antialiased transition-colors duration-300">
        <LayoutWrapper>
          {children}
        </LayoutWrapper>
      </body>
    </html>
  );
}

