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
import { useCallback, useMemo } from 'react';
import { useResponsiveView } from '@/lib/useResponsiveView';
import useStickyState, { useStickySet } from '@/lib/ui/useStickyState';
import { requestSortDefaultDir } from '@/lib/requests/queueList';

/* `sortKey` = แบบเรียงตั้งต้นของหน้านั้น (ดูคำเตือนที่ `REQUEST_SORT_OPTIONS`)
   ⚠️ หน้าไหนส่งค่าอื่นมา **คำโปรยของหน้านั้นต้องพูดตรงกับลำดับที่เห็นจริง** */
export function useQueueBoard({ sortKey: initialSortKey = 'urgency' } = {}) {
  // ⭐ ตาราง 4 คอลัมน์บนจอตั้งเลื่อนซ้ายขวาอย่างเดียว — สลับเป็นการ์ดเหมือนอีก 9 หน้า
  // ของระบบ · `useResponsiveView` เก็บ override ของผู้ใช้ไว้จนกว่าจะพลิกจอ
  const [view, setView] = useResponsiveView({ portrait: 'list', landscape: 'table' });
  // ตัวเลขบนแถบกดกรองได้ (ม-60) — คีย์ของ `QUEUE_COUNT_META` หรือ null
  /* ⭐ ตัวกรอง/ค้นหา/จัดกลุ่ม/เรียงทั้งชุดจำไว้ (useStickyState) — กดเข้าใบแล้วกดกลับต้องได้คิวหน้าตาเดิม
     (คำขอเจ้าของ 27/11/2026 · ทั้งระบบ) · คีย์ผูกกับ pathname อัตโนมัติ สี่หน้าคิวจึงไม่กวนกัน */
  const [countFilter, setCountFilter] = useStickyState('queue.countFilter', null);
  const [search, setSearch] = useStickyState('queue.search', '');
  /* ── ชั้นเดียวกับหน้ารายการดีล (แบบ จ · 2026-08-11) ─────────────────────
     ⚠️ **อยู่ในฮุกเดียวกับตัวสลับมุมมอง ไม่ใช่ใน `RequestQueuePanel`** — ด้วยเหตุผล
     เดิมของไฟล์นี้: หัวการ์ดกับตารางอยู่คนละชั้นของ `Workspace` · และแบนเนอร์
     "มีใบตีกลับค้าง" บนหน้าแม่ต้องกดแล้ว **ตั้งตัวกรองให้ตาราง** ซึ่งทำไม่ได้เลย
     ถ้าตัวกรองอยู่ในพาเนล */
  const [filters, setFilters] = useStickyState('queue.filters', {});
  const [groupBy, setGroupBy] = useStickyState('queue.groupBy', 'none');
  const [collapsed, setCollapsed] = useStickySet('queue.collapsed');
  const [sortKey, setSortKey] = useStickyState('queue.sortKey', initialSortKey);
  const [sortDir, setSortDir] = useStickyState('queue.sortDir', requestSortDefaultDir(initialSortKey));

  const setFilter = useCallback((dimension, values) => {
    setFilters((prev) => ({ ...prev, [dimension]: values }));
  }, [setFilters]);
  const clearFilters = useCallback(() => setFilters({}), [setFilters]);
  /* เปลี่ยนมิติจัดกลุ่มแล้ว **ล้างกลุ่มที่ย่อไว้** — คีย์ของกลุ่มเป็นคนละชุดกัน
     (รหัสฝ่าย vs id ลูกค้า) ค้างไว้แล้วจะได้กลุ่มที่ย่ออยู่โดยไม่มีใครกด */
  const chooseGroupBy = useCallback((value) => {
    setGroupBy(value);
    setCollapsed(new Set());
  }, [setGroupBy, setCollapsed]);
  const toggleGroup = useCallback((key) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  }), [setCollapsed]);
  // ทิศตั้งต้นมาจากคีย์ — เลือก "วันที่ร้องขอ" แล้วต้องได้ใหม่ก่อนโดยไม่ต้องกดสลับเอง
  const chooseSort = useCallback((key) => {
    setSortKey(key);
    setSortDir(requestSortDefaultDir(key));
  }, [setSortKey, setSortDir]);
  const toggleSortDir = useCallback(() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')), [setSortDir]);

  return useMemo(() => ({
    view, setView, countFilter, setCountFilter, search, setSearch,
    filters, setFilter, clearFilters,
    groupBy, setGroupBy: chooseGroupBy, collapsed, setCollapsed, toggleGroup,
    sortKey, sortDir, setSort: chooseSort, toggleSortDir,
  }), [
    view, setView, countFilter, setCountFilter, search, setSearch, filters, setFilter, clearFilters,
    groupBy, chooseGroupBy, collapsed, setCollapsed, toggleGroup, sortKey, sortDir, chooseSort, toggleSortDir,
  ]);
}

/* ── ค้นหาในคิว — ย้ายไป `queueFilter.js` แล้ว (ตรวจตัวเลข 20/10/2026) ───────────────
   ตารางกับทุกตัวเลขบนหน้าคิวต้องเรียกตัวตัดสินเดียวกัน (`passesQueueFilters`) ซึ่งต้องเป็นไฟล์ล้วน
   — ไฟล์นี้เป็น "use client" (import `useResponsiveView`) ⇒ ส่งต่อไว้ให้ผู้เรียกเดิมเท่านั้น */
export { matchesQueueSearch } from '@/lib/requests/queueFilter';
