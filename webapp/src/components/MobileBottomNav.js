"use client";
// ── แถบเมนูล่างบนมือถือ (แบบปัดหน้า) ────────────────────────────────────
//
// มติผู้ใช้ 2026-08-02: **เมนูของระบบต้องอยู่บนแถบครบทุกตัว ห้ามซ่อนหลัง "เพิ่มเติม"**
// จึงแบ่งเป็นหน้า ๆ ปัดซ้ายขวา · ปุ่ม `…` บนแถบบนยังอยู่ แต่เหลือหน้าที่เดียวคือ
// บัญชี/เครื่องมือ (ตั้งค่า · ธีม · ออกจากระบบ) ซึ่งบนมือถือไม่มีทางเข้าอื่น
//
// 📌 ล้มมติเดิม 2026-07-18 ("แถบล่างไม่เลื่อน ปุ่มพอดีจอ 4+เพิ่มเติม") — มตินั้น
// ตั้งอยู่บนกติกา 4+เพิ่มเติม ซึ่งผู้ใช้ตัดทิ้งแล้ว จึงยืนต่อไม่ได้
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { paginateMobileNav, pageIndexOfActive } from '@/lib/mobileNavPages';

export default function MobileBottomNav({ items, pathname, label }) {
  const pagerRef = useRef(null);
  const [visiblePage, setVisiblePage] = useState(0);

  const pages = paginateMobileNav(items);
  const activePage = pageIndexOfActive(pages, (item) => item.match(pathname));
  const multi = pages.length > 1;

  // 🔴 ต้องเลื่อนไปหน้าที่มีเมนูที่กำลังเปิดอยู่ ไม่งั้นเช่น "งานของฉัน" (ตัวที่ 9
  // = อยู่หน้า 2) จะเปิดมาเห็นหน้า 1 ที่ไม่มีปุ่มของตัวเองเลย
  //
  // ⚠️ เลื่อนเฉพาะตอน "หน้าที่ active อยู่" เปลี่ยน — ห้ามเลื่อนทุกครั้งที่กด
  // ไม่งั้นปุ่มขยับใต้นิ้วระหว่างที่ผู้ใช้กำลังปัดดูเมนูหน้าอื่น
  useEffect(() => {
    const el = pagerRef.current;
    if (!el) return;
    el.scrollTo({ left: activePage * el.clientWidth, behavior: 'auto' });
    setVisiblePage(activePage);
  }, [activePage, pages.length]);

  const onScroll = useCallback(() => {
    const el = pagerRef.current;
    if (!el || !el.clientWidth) return;
    setVisiblePage(Math.round(el.scrollLeft / el.clientWidth));
  }, []);

  const goToPage = (index) => {
    const el = pagerRef.current;
    if (el) el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' });
  };

  if (pages.length === 0) return null;

  return (
    <nav className="mobile-bottom-nav" aria-label={`เมนู${label || ''}`}>
      {/* touch-action: pan-x อยู่ใน globals.css (.mbn-pager) — ลดการชนท่าปัดของ OS */}
      <div className="mbn-pager" ref={pagerRef} onScroll={onScroll}>
        {pages.map((page, pageIndex) => (
          <div className="mbn-page" key={pageIndex}>
            {page.map((item, slot) => {
              if (!item) {
                // ช่องว่างเติมให้หน้าครบ — กดไม่ได้ ไม่อยู่ในลำดับ tab
                return <span className="mbn-item is-empty" key={`gap-${slot}`} aria-hidden="true" />;
              }
              const Icon = item.icon;
              const active = item.match(pathname);
              return (
                <Link
                  href={item.href}
                  key={item.href}
                  className={`mbn-item${active ? ' active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="mbn-ico"><Icon size={19} aria-hidden="true" /></span>
                  {/* shortName = ชื่อสั้นเฉพาะแถบล่าง (ช่องกว้าง ~71px) — ป้ายที่ยาว
                      เกินถูกตัดท้ายด้วย … ซึ่งอ่านไม่ออก ดู navMenuNames.test.mjs */}
                  <span>{item.shortName || item.name}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* จุดบอกหน้า — โผล่เฉพาะตอนมีหลายหน้า · 5 ใน 7 ระบบมีหน้าเดียว จุดเดียว
          โดด ๆ คือสัญญาณรบกวน และสอนผู้ใช้ผิดว่าจุดเป็นแค่ของตกแต่ง */}
      <div className="mbn-dots" role="tablist" aria-label="หน้าของเมนู">
        {multi && pages.map((_, index) => (
          <button
            key={index}
            type="button"
            role="tab"
            aria-label={`เมนูหน้า ${index + 1} จาก ${pages.length}`}
            aria-selected={index === visiblePage}
            onClick={() => goToPage(index)}
          />
        ))}
      </div>
    </nav>
  );
}
