import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // This app fetches data via client-side `fetch` inside useEffect + apiCache
      // by design (no RSC/React Query). The React Compiler's set-state-in-effect
      // rule can't tell that benign post-fetch setState from the real anti-pattern,
      // so it false-positives on every data-loading page. Disabled project-wide.
      "react-hooks/set-state-in-effect": "off",
      // React Compiler diagnostics are too aggressive for this legacy UI code:
      // several drag/drop and inline helper components are intentional and the
      // app builds correctly without compiler optimization.
      "react-hooks/static-components": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react/no-unescaped-entities": "off",
      // ⭐ ตัวจับ "หน้าเว็บพังตอนรันแต่ทุกอย่างผ่านหมด" — ปิดอยู่โดยปริยายใน
      // eslint-config-next (เพราะฝั่ง TS มี type checker ทำหน้าที่นี้ ส่วนโปรเจกต์นี้
      // เป็น JS ล้วนจึงไม่มีใครตรวจเลย) · Turbopack ไม่ error ตอน import ชื่อที่
      // ไม่มีอยู่ และตัวแปรที่ไม่ถูก import จะพังตอน "render" เท่านั้น
      //
      // ของจริงที่เจอตอนเปิดกฎนี้ครั้งแรก (2026-07-29) — ทั้งหมดเป็นหน้าที่พังจริงบน prod:
      //   · sa/requests/[id] import ชื่อเก่า `askProgress` แต่เรียก `requestProgress`
      //     → หน้ารายละเอียดคำร้อง **เปิดไม่ได้เลยทั้งหน้า**
      //   · components/ui/Toast.js ใช้ `normalizeToast` โดยไม่ import (ToastProvider
      //     อยู่ใน root layout → toast ทุกตัวที่ยิงผ่าน provider พัง)
      //   · sa/projects/[id] + sahamit/po/[id] ใช้ `notifyToast` โดยไม่ import
      //     → ทางที่ error จะพังซ้อน error เดิม ผู้ใช้ไม่เห็นข้อความอะไรเลย
      "no-undef": "error",
    },
  },
]);

export default eslintConfig;
