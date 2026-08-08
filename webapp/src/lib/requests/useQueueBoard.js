"use client";
// ── สถานะของ "หน้ารายการคำร้อง" — ที่เดียวที่ทั้งหัวการ์ดและตารางอ่านร่วมกัน ──
//
// ⭐ **ทำไมต้องยกออกมาเป็นฮุก** (มติผู้ใช้ 2026-08-08 · ต้นแบบ = หน้างานของฉัน) —
// ต้นแบบวาง **ตัวสลับมุมมองกับปุ่มหลักไว้ในหัวการ์ด** ส่วนตารางอยู่ล่างสุด · สองที่นี้
// อยู่คนละชั้นของ `Workspace` (`headerRight` กับ children) จึงส่ง state หากันตรง ๆ
// ไม่ได้ ⇒ ให้หน้าแม่ถือสถานะ แล้วส่งลงทั้งสองทาง
//
// ⚠️ **ห้ามให้ `RequestQueuePanel` ถือ state พวกนี้เอง** — ถือแล้วหัวการ์ดจะเอื้อมไม่ถึง
// แล้วจะจบด้วยการวาดตัวสลับมุมมองสองอัน (อันหนึ่งในหัว อันหนึ่งในพาเนล) ที่ไม่รู้จักกัน
import { useState } from 'react';
import { useResponsiveView } from '@/lib/useResponsiveView';

export function useQueueBoard() {
  // ⭐ ตาราง 4 คอลัมน์บนจอตั้งเลื่อนซ้ายขวาอย่างเดียว — สลับเป็นการ์ดเหมือนอีก 9 หน้า
  // ของระบบ · `useResponsiveView` เก็บ override ของผู้ใช้ไว้จนกว่าจะพลิกจอ
  const [view, setView] = useResponsiveView({ portrait: 'list', landscape: 'table' });
  // ตัวเลขบนแถบกดกรองได้ (ม-60) — คีย์ของ `QUEUE_COUNT_META` หรือ null
  const [countFilter, setCountFilter] = useState(null);
  const [search, setSearch] = useState('');
  return { view, setView, countFilter, setCountFilter, search, setSearch };
}

// ── ค้นหาในคิว — logic ล้วน ทดสอบได้โดยไม่ต้องมีจอ ────────────────────────
//
// ⚠️ **ค้นจากสิ่งที่ตาเห็นในตาราง** (เลขที่ · เรื่อง · ลูกค้า · ชนิด · ฝ่าย) ไม่ใช่จาก
// ทุกฟิลด์ที่มี — ค้นเจอของที่มองไม่เห็นบนจอแล้วผู้ใช้จะไม่เข้าใจว่าทำไมแถวนี้ขึ้นมา
export function matchesQueueSearch(request, term, { kindLabel = () => '' } = {}) {
  const q = String(term ?? '').trim().toLowerCase();
  if (!q) return true;
  return [
    request?.docNo,
    request?.title,
    request?.customerName,
    request?.formulaCode,
    kindLabel(request?.kind),
    request?.dept,
  ].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
}
