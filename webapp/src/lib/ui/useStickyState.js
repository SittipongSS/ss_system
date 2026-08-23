"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/* ── จำค่าที่ผู้ใช้ตั้งไว้ในหน้ารายการ (ตัวกรอง · การเรียง · การจัดกลุ่ม) ────
 *
 * 🐞 ปัญหาที่แก้ (ผู้ใช้รายงาน 2026-08-22): ตัวกรอง/การเรียงเป็น `useState` ธรรมดา
 * ในแต่ละหน้า · กดเข้าหน้ารายละเอียด หน้ารายการถูก unmount ค่าหายหมด กดย้อนกลับ
 * มาก็เริ่มจากค่าตั้งต้นใหม่ ⇒ คนที่ไล่เปิดทีละใบต้องกรองใหม่ทุกครั้ง
 *
 * ⭐ มติผู้ใช้ 2026-08-22: เก็บใน **sessionStorage** (จำจนกว่าจะปิดแท็บ) ไม่ใช่ URL
 * — แลกกับการส่งลิงก์พร้อมตัวกรองให้คนอื่นไม่ได้ ได้กลับมาคือทุกหน้าได้ผลเหมือนกัน
 * ด้วยการสลับ `useState` เป็นตัวนี้บรรทัดเดียว ไม่ต้องรื้อทีละหน้า
 *
 * ⚠️ **ห้ามอ่าน storage ใน initializer ของ useState** — เรนเดอร์แรกฝั่ง client ต้อง
 * ตรงกับฝั่ง server เป๊ะ ไม่งั้น hydration พัง · จึงคืนค่าตั้งต้นก่อนแล้วค่อยเติม
 * ค่าที่จำไว้ใน effect · หน้าพวกนี้ยัง `loading` รอ fetch อยู่ตอนนั้น คนจึงไม่ทัน
 * เห็นจังหวะที่ตัวกรองยังเป็นค่าตั้งต้น
 *
 * ⚠️ เก็บได้เฉพาะค่าที่ JSON แปลงกลับมาได้ — `Set`/`Map`/`Date` ผ่าน JSON แล้ว
 * กลายเป็นคนละชนิด ถ้าจะจำพวกนั้นให้แปลงเป็น array/สตริงก่อนส่งเข้ามา
 *
 * ⚠️ คีย์ผูกกับ pathname อัตโนมัติ — สองหน้าที่ใช้ชื่อคีย์ซ้ำกัน (เช่น `"sortKey"`)
 * จึงไม่กวนกัน และไม่ต้องคิดชื่อยาว ๆ เองทุกที่
 */

const PREFIX = "listState:";

function readStored(storageKey, fallback) {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    /* โควตาเต็ม · โหมดส่วนตัวบางเบราว์เซอร์ · ค่าเก่าที่ parse ไม่ได้ —
       ทุกกรณีถือว่า "ไม่เคยจำไว้" แล้วเดินต่อด้วยค่าตั้งต้น ห้ามโยน error
       ออกไปทำให้ทั้งหน้าจอขาว เพราะนี่เป็นแค่ความสะดวก ไม่ใช่ข้อมูลจริง */
    return fallback;
  }
}

export default function useStickyState(key, initialValue) {
  const pathname = usePathname();
  const storageKey = `${PREFIX}${pathname}:${key}`;
  const [value, setValue] = useState(initialValue);

  /* ค่าตั้งต้นอาจเป็นค่าที่คำนวณสด (เช่น เดือนปัจจุบัน) — เก็บไว้ในกล่องเพื่อให้
     `reset` ใช้ได้โดยไม่ต้องผูกมันเข้า dependency ของ effect (ไม่งั้น object/array
     ที่สร้างใหม่ทุกเรนเดอร์จะทำให้ effect วิ่งไม่หยุด) */
  const initialRef = useRef(initialValue);
  /* 🐞 ธงนี้ต้องเป็น **state ไม่ใช่ ref** — วัดจริง 2026-08-22: ใช้ ref แล้วค่าที่จำไว้
     ถูกทับด้วยค่าตั้งต้นทุกครั้งที่กลับเข้าหน้า เพราะ effect สองตัวในคอมมิตเดียวกัน
     วิ่งเรียงกัน: ตัวอ่านตั้ง ref เป็น true แล้ว `setValue` แค่ *นัด* ให้เรนเดอร์ใหม่
     ⇒ ตัวเขียนที่วิ่งต่อทันทีเห็น ref เป็น true แต่ `value` ยังเป็นค่าตั้งต้นของ
     เรนเดอร์นี้ แล้วเขียนทับของเดิมทิ้ง · เป็น state แล้ว React รวมสองการอัปเดต
     เป็นเรนเดอร์เดียว ตัวเขียนจึงเห็น `hydrated` กับ `value` ที่ตรงกันเสมอ */
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setValue(readStored(storageKey, initialRef.current));
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    /* 🪤 ห้ามเขียนก่อนอ่าน — เรนเดอร์แรกค่ายังเป็นค่าตั้งต้น ถ้าเขียนทันที
       ค่าที่ผู้ใช้ตั้งไว้จะถูกทับตั้งแต่ยังไม่ทันได้อ่านกลับมา */
    if (!hydrated) return;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {}
  }, [hydrated, storageKey, value]);

  const reset = useCallback(() => {
    setValue(initialRef.current);
    try { window.sessionStorage.removeItem(storageKey); } catch {}
  }, [storageKey]);

  return [value, setValue, reset];
}

/** ล้างค่าที่จำไว้ของหน้าหนึ่ง — ใช้กับปุ่ม "ล้างตัวกรอง" ที่ต้องล้างหลายตัวพร้อมกัน */
export function clearStickyState(pathname) {
  try {
    const prefix = `${PREFIX}${pathname}:`;
    const doomed = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith(prefix)) doomed.push(k);
    }
    doomed.forEach((k) => window.sessionStorage.removeItem(k));
  } catch {}
}
