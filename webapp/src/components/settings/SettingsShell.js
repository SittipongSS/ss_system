"use client";

/* ── เปลือกของหน้าตั้งค่า: แถบรายการค้างซ้าย + เนื้อหน้าทางขวา ─────────────
 *
 * ⭐ มติผู้ใช้ 2026-08-20: ทุกหน้าในบริบทตั้งค่า (`/settings`, `/users`, `/audit`)
 * ต้องมีรายการตั้งค่าค้างอยู่ข้าง ๆ — เดิมออกจากหน้าย่อยต้องกด "กลับหน้าตั้งค่า"
 * ทุกครั้ง แล้วค่อยเลือกใบถัดไป · คนที่มาตั้งค่าจริงมักแตะหลายหน้าติดกัน
 *
 * ⚠️ เปลือกนี้อยู่ที่ AppLayout ไม่ใช่ `app/settings/layout.js` — เพราะ `/users`
 * กับ `/audit` อยู่คนละรากแต่เป็นบริบทเดียวกัน (`SETTINGS_PATHS`) · ทำที่ layout
 * ของ `/settings` เมื่อไร สองหน้านั้นจะเป็นหน้าโดดที่ไม่มีทางกลับเข้ากอง
 *
 * ⚠️ **แถบข้างไม่ยุบเป็นดรอปดาวน์บนจอแคบ** แต่เลื่อนแนวนอนแทน — กฎเดียวกับ
 * `SectionRail` (globals.css): ยุบเป็นดรอปดาวน์แล้วคนจะไม่รู้เลยว่ามีอะไรให้ตั้งอีก
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Settings } from "lucide-react";
import { activeSettingsHref, matchesSettingsQuery, settingsNavForUser } from "@/config/settingsNav";
import styles from "./SettingsShell.module.css";

export default function SettingsShell({ user, pathname, children }) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => settingsNavForUser(user), [user]);
  const activeHref = useMemo(() => activeSettingsHref(pathname, user), [pathname, user]);

  /* กรองแล้วกลุ่มไหนไม่เหลือรายการ = ทั้งกลุ่มหายไป ไม่ใช่หัวข้อลอยไม่มีลูก
     ⚠️ หน้าที่กำลังเปิดอยู่ **ไม่หายแม้ค้นไม่ตรง** — รางที่ไม่มีตัวไฮไลต์เลย
     อ่านเหมือนหลุดออกจากกองไปแล้ว */
  const filtered = useMemo(() => groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => matchesSettingsQuery(item, query) || item.href === activeHref),
    }))
    .filter((group) => group.items.length > 0), [groups, query, activeHref]);

  return (
    <div className={styles.shell}>
      <nav className={styles.rail} aria-label="รายการตั้งค่า">
        <Link href="/settings" className={styles.railHome} aria-current={pathname === "/settings" ? "page" : undefined}>
          <Settings size={16} aria-hidden="true" />
          <span>ภาพรวมการตั้งค่า</span>
        </Link>

        <div className={styles.searchRow}>
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            className={styles.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาการตั้งค่า"
            aria-label="ค้นหาการตั้งค่า"
          />
        </div>

        <div className={styles.railScroll}>
          {filtered.map((group) => (
            <div key={group.key} className={styles.railGroup}>
              <span className={styles.railGroupLabel}>{group.title}</span>
              {group.items.map((item) => {
                const Icon = item.icon;
                const on = item.href === activeHref;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={styles.railItem}
                    data-on={on ? "" : undefined}
                    aria-current={on ? "page" : undefined}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span>{item.shortTitle || item.title}</span>
                  </Link>
                );
              })}
            </div>
          ))}
          {!filtered.length && <p className={styles.railEmpty}>ไม่พบการตั้งค่าที่ค้นหา</p>}
        </div>
      </nav>

      <div className={styles.main}>{children}</div>
    </div>
  );
}
