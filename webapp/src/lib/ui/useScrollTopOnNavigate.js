"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/* เปลี่ยนหน้าจากเมนู (หรือลิงก์ใด ๆ ที่ข้าม pathname) แล้วพาจอกลับขึ้นบนสุด
 * — และ **กดย้อนกลับแล้วคืนตำแหน่งที่ไถค้างไว้** (มติผู้ใช้ 2026-08-22)
 *
 * 🐞 Next ไม่ได้เลื่อนขึ้นให้เองในแอปนี้ — วัดจริง 2026-08-13: ไถหน้า `/sa/deals`
 * ลงไป 1200px กดเมนู "ลีด" แล้ว pathname เปลี่ยนเป็น `/sa/leads` แต่ `scrollY`
 * ยังเป็น 1200 คนอ่านจึงโผล่กลางตารางของหน้าใหม่ทุกครั้ง
 *
 * 🐞 และการคืนตำแหน่งของเบราว์เซอร์เองก็ใช้ไม่ได้กับหน้ารายการของแอปนี้ — ตอน
 * กดย้อนกลับ หน้าถูก mount ใหม่โดยที่ตารางยังว่าง (ข้อมูลมาจาก fetch) เบราว์เซอร์
 * จึงคืนตำแหน่งตอนที่หน้ายังสูงไม่ถึง แล้วได้หัวหน้าเหมือนเดิม ⇒ ต้องรอให้เนื้อหา
 * สูงพอก่อนถึงค่อยเลื่อน
 *
 * ⚠️ ผูกกับ **pathname** ไม่ใช่ทั้ง URL — เปลี่ยนเฉพาะ query (เช่น `?tab=…` ของ
 * แดชบอร์ด หรือตัวกรองที่เขียนลง URL) ไม่ใช่การเปลี่ยนหน้า ตรงนั้นมีตัวเลื่อนของ
 * `Tabs`/`Pager` ดูแลอยู่แล้ว (lib/ui/scrollToTopOf.js) และเลื่อนคนละจุดกัน
 *
 * ⚠️ **คืนตำแหน่งเฉพาะตอนกดย้อน/เดินหน้าเท่านั้น** ไม่ใช่ทุกครั้งที่กลับเข้าหน้า —
 * เข้าจากเมนูแล้วโผล่กลางตารางคืออาการที่ 🐞 ข้างบนพยายามแก้ตั้งแต่แรก
 * (ต่างจากตัวกรองที่จำยาวจนปิดแท็บ ดู lib/ui/useStickyState.js)
 *
 * ⚠️ ข้ามเมื่อ URL มี hash — ผู้ใช้ (หรือลิงก์) ชี้ไปที่ตำแหน่งในหน้าไว้แล้ว
 */

const SCROLL_KEY = "listScroll:";
/* เพดานรอเนื้อหา — เกินนี้แล้วไม่เลื่อน เพราะผู้ใช้เริ่มอ่านหน้าไปแล้ว
   การกระชากจอตอนนั้นแย่กว่าการไม่คืนตำแหน่ง */
const RESTORE_DEADLINE_MS = 2000;

export default function useScrollTopOnNavigate() {
  const pathname = usePathname();
  const historyNavRef = useRef(false);

  useEffect(() => {
    const markHistoryNavigation = () => { historyNavRef.current = true; };
    window.addEventListener("popstate", markHistoryNavigation);
    return () => window.removeEventListener("popstate", markHistoryNavigation);
  }, []);

  /* จำตำแหน่งไถของหน้านี้ไว้ตลอดที่ยังอยู่ — throttle ด้วย rAF เพราะ event
     scroll ยิงถี่มาก การเขียน sessionStorage ทุกครั้งทำให้ไถหนืด */
  useEffect(() => {
    const storageKey = `${SCROLL_KEY}${pathname}`;
    let frame = 0;
    const save = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        try { window.sessionStorage.setItem(storageKey, String(Math.round(window.scrollY))); } catch {}
      });
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", save);
      save();
    };
  }, [pathname]);

  useEffect(() => {
    const wasHistoryNavigation = historyNavRef.current;
    historyNavRef.current = false;

    if (window.location.hash) return undefined;

    if (!wasHistoryNavigation) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      return undefined;
    }

    let target = 0;
    try { target = Number(window.sessionStorage.getItem(`${SCROLL_KEY}${pathname}`)) || 0; } catch {}
    if (target <= 0) return undefined;

    let done = false;
    let observer = null;
    let deadline = 0;
    const cancels = [];

    /* 🪤 ประกาศ finish ไว้ก่อนของที่มันไปแตะ แล้วเก็บของพวกนั้นไว้ในตัวแปร `let`
       ที่เติมทีหลัง — เขียนเป็น const แล้วอ้างจากในนี้ได้เพราะมันถูกเรียกทีหลัง
       เสมอ "โดยบังเอิญ" ซึ่งพังทันทีที่มีคนย้ายบรรทัด */
    const finish = () => {
      if (done) return;
      done = true;
      if (observer) observer.disconnect();
      if (deadline) clearTimeout(deadline);
      /* ⚠️ ต้องถอด listener ของการยกเลิกด้วย ไม่งั้นมันค้างอยู่ทั้งหน้า */
      cancels.forEach(([type, fn]) => window.removeEventListener(type, fn));
    };

    const tryRestore = () => {
      if (done) return;
      /* เลื่อนได้ก็ต่อเมื่อหน้าสูงพอจะไปถึงตำแหน่งนั้นจริง — ไม่งั้น scrollTo
         จะไปหยุดที่ก้นหน้าที่ยังสั้นอยู่ แล้วนับว่าคืนสำเร็จทั้งที่ผิดตำแหน่ง */
      if (document.documentElement.scrollHeight < target + window.innerHeight) return;
      window.scrollTo({ top: target, left: 0, behavior: "auto" });
      finish();
    };

    /* ผู้ใช้ขยับเองเมื่อไร = เขาเลือกตำแหน่งเองแล้ว ห้ามกระชากทับ
       (ดักที่ wheel/touch/ปุ่ม ไม่ใช่ event scroll เพราะ scroll ของเราเองก็ยิง) */
    const cancel = () => finish();
    cancels.push(["wheel", cancel], ["touchstart", cancel], ["keydown", cancel]);
    cancels.forEach(([type, fn]) => window.addEventListener(type, fn, { passive: true, once: true }));

    observer = new ResizeObserver(tryRestore);
    observer.observe(document.documentElement);
    deadline = setTimeout(finish, RESTORE_DEADLINE_MS);
    tryRestore();

    return finish;
  }, [pathname]);
}
