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
import { useCallback, useMemo, useState } from 'react';
import { useResponsiveView } from '@/lib/useResponsiveView';
import { requestSortDefaultDir } from '@/lib/requests/queueList';

export function useQueueBoard() {
  // ⭐ ตาราง 4 คอลัมน์บนจอตั้งเลื่อนซ้ายขวาอย่างเดียว — สลับเป็นการ์ดเหมือนอีก 9 หน้า
  // ของระบบ · `useResponsiveView` เก็บ override ของผู้ใช้ไว้จนกว่าจะพลิกจอ
  const [view, setView] = useResponsiveView({ portrait: 'list', landscape: 'table' });
  // ตัวเลขบนแถบกดกรองได้ (ม-60) — คีย์ของ `QUEUE_COUNT_META` หรือ null
  const [countFilter, setCountFilter] = useState(null);
  const [search, setSearch] = useState('');
  /* ── ชั้นเดียวกับหน้ารายการดีล (แบบ จ · 2026-08-11) ─────────────────────
     ⚠️ **อยู่ในฮุกเดียวกับตัวสลับมุมมอง ไม่ใช่ใน `RequestQueuePanel`** — ด้วยเหตุผล
     เดิมของไฟล์นี้: หัวการ์ดกับตารางอยู่คนละชั้นของ `Workspace` · และแบนเนอร์
     "มีใบตีกลับค้าง" บนหน้าแม่ต้องกดแล้ว **ตั้งตัวกรองให้ตาราง** ซึ่งทำไม่ได้เลย
     ถ้าตัวกรองอยู่ในพาเนล */
  const [filters, setFilters] = useState({});
  const [groupBy, setGroupBy] = useState('none');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [sortKey, setSortKey] = useState('urgency');
  const [sortDir, setSortDir] = useState(() => requestSortDefaultDir('urgency'));

  const setFilter = useCallback((dimension, values) => {
    setFilters((prev) => ({ ...prev, [dimension]: values }));
  }, []);
  const clearFilters = useCallback(() => setFilters({}), []);
  /* เปลี่ยนมิติจัดกลุ่มแล้ว **ล้างกลุ่มที่ย่อไว้** — คีย์ของกลุ่มเป็นคนละชุดกัน
     (รหัสฝ่าย vs id ลูกค้า) ค้างไว้แล้วจะได้กลุ่มที่ย่ออยู่โดยไม่มีใครกด */
  const chooseGroupBy = useCallback((value) => {
    setGroupBy(value);
    setCollapsed(new Set());
  }, []);
  const toggleGroup = useCallback((key) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  }), []);
  // ทิศตั้งต้นมาจากคีย์ — เลือก "เปิดล่าสุด" แล้วต้องได้ใหม่ก่อนโดยไม่ต้องกดสลับเอง
  const chooseSort = useCallback((key) => {
    setSortKey(key);
    setSortDir(requestSortDefaultDir(key));
  }, []);
  const toggleSortDir = useCallback(() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')), []);

  return useMemo(() => ({
    view, setView, countFilter, setCountFilter, search, setSearch,
    filters, setFilter, clearFilters,
    groupBy, setGroupBy: chooseGroupBy, collapsed, setCollapsed, toggleGroup,
    sortKey, sortDir, setSort: chooseSort, toggleSortDir,
  }), [
    view, setView, countFilter, search, filters, setFilter, clearFilters,
    groupBy, chooseGroupBy, collapsed, toggleGroup, sortKey, sortDir, chooseSort, toggleSortDir,
  ]);
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
    // รหัสลูกค้า (AR) — ตาเห็นบนแถวแล้ว จึงต้องค้นเจอด้วย (กฎของฟังก์ชันนี้)
    request?.customerArCode,
    request?.formulaCode,
    kindLabel(request?.kind),
    request?.dept,
  ].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
}
