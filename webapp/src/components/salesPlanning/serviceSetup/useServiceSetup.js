"use client";
// ── ตัวโหลดงานบริการของใบสั่งขาย (`GET …/service-setup`) + ทะเบียนไซต์ของลูกค้าแบบโหลดเมื่อแก้ (mig 0391 · PR-A) ──
//
// ⭐ ก้อน GET คือความจริงเดียวของตาราง/แผงแดง/การ์ดราง/แถบผู้อนุมัติ/หัวใบ — จอไม่คิดข้อที่ยังขาดเอง
// ⭐ ทะเบียนไซต์ (`GET /api/service/customers/[customerId]/zones` — เส้นเดียวกับแท็บพื้นที่บริการของหน้าลูกค้า)
//   โหลด **ครั้งแรกที่ตารางอยู่ในโหมดแก้** เท่านั้น — โหมดอ่านใช้โซน/ไซต์ที่ก้อน GET แนบมา (เฉพาะที่ใบเลือกไว้)
// 🔴 โหลดพัง = บอกว่าพัง + ปุ่มลองโหลดอีกครั้ง **ไม่เดา** (ห้ามถือว่า "ไม่มีโซน/ไม่มีข้อที่ขาด")
// ⚠️ ไม่โหลดใหม่ตอนสลับหน้าต่างกลับมา (revalidate on focus) — ระหว่างที่คนแก้ค้าง ก้อนฐานที่เปลี่ยนเงียบ ๆ ทำให้
//   `expectedUpdatedAt` ขยับตามโดยไม่มีใครเห็นของอีกหน้าต่าง ⇒ การบันทึกทับของคนอื่นแทนที่จะได้ 409
// ⚠️ `reload()` คืนก้อนใหม่ · พัง = **reject** (ข้อความไทย) และตั้ง `error` ไว้ด้วย — ผู้เรียกที่ต้องตัดสินจากก้อนสด
//   (กดยื่นอนุมัติ) ห้ามถือว่าพัง = ผ่าน
// ⭐ **ร่างการแก้อยู่ที่ hook นี้ ไม่ใช่ที่ตาราง** — ตารางอยู่ในแท็บ "ภาพรวม" ซึ่งถูกถอดออกตอนสลับแท็บ
//   ร่างที่อยู่ในตารางจะหายเงียบ ๆ ตอนคนไปแก้ช่วงครอบที่แท็บการชำระแล้วกลับมา (ขณะที่หน้ายังจำว่า "มีของค้าง")
//   ⇒ `draft`/`setDraft`/`dirty` อยู่กับหน้า · ฐานเปลี่ยน (บันทึก/โหลดใหม่) = ทิ้งคีย์ที่เท่าฐานใหม่แล้ว (`rebaseDraft`)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiJson } from "@/lib/apiFetch";
import useLatestRun from "@/lib/ui/useLatestRun";
import { EMPTY_DRAFT, draftDirty, rebaseDraft } from "./serviceSetupDraft";

export const SERVICE_SETUP_LOAD_FAILED = "โหลดงานบริการไม่สำเร็จ";
export const SERVICE_REGISTRY_LOAD_FAILED = "โหลดทะเบียนไซต์ไม่สำเร็จ";

const setupUrl = (orderId) => `/api/sales-planning/sales-orders/${encodeURIComponent(orderId)}/service-setup`;
const registryUrl = (customerId) => `/api/service/customers/${encodeURIComponent(customerId)}/zones`;

/**
 * @param orderId ใบสั่งขาย · @param enabled ใบนี้ต้องตั้งงานบริการไหม (`serviceSetupRequired(order)`) — ปิด = ไม่ยิงอะไรเลย
 * @param customerId ลูกค้าในใบ (ทะเบียนไซต์)
 * @returns `{ data, loading, error, reload(): Promise<data>, registry: { sites, loading, error, loaded, reload },
 *            draft, setDraft, dirty }` — `dirty` = มีการแก้งานบริการที่ยังไม่บันทึก (ใช้กับกันออกจากหน้า/ด่านกดยื่นได้ตรง ๆ)
 */
export default function useServiceSetup(orderId, { enabled = true, customerId = null } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const startRun = useLatestRun();

  const reload = useCallback(async () => {
    if (!orderId || !enabled) return null;
    const isLatest = startRun();
    setLoading(true);
    try {
      const next = await apiJson(setupUrl(orderId), { cache: "no-store", fallbackError: SERVICE_SETUP_LOAD_FAILED });
      if (isLatest()) {
        setData(next);
        setError("");
      }
      return next;
    } catch (loadError) {
      const message = loadError?.message || SERVICE_SETUP_LOAD_FAILED;
      if (isLatest()) setError(message);
      throw new Error(message);
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [orderId, enabled, startRun]);

  /* โหลดครั้งแรก/เปลี่ยนใบ — ข้อผิดพลาดอยู่ใน `error` แล้ว (การ์ดขึ้นปุ่มลองโหลดอีกครั้ง) ไม่ต้องโยนต่อ */
  useEffect(() => {
    if (!orderId || !enabled) {
      setData(null);
      setError("");
      return;
    }
    reload().catch(() => {});
  }, [orderId, enabled, reload]);

  /* ── ร่างการแก้ ─────────────────────────────────────────────────────────────────────── */
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  useEffect(() => { setDraft(EMPTY_DRAFT); }, [orderId]);
  useEffect(() => {
    if (data) setDraft((current) => rebaseDraft(data, current));
  }, [data]);
  const dirty = useMemo(() => draftDirty(data, draft), [data, draft]);

  /* ── ทะเบียนไซต์ของลูกค้า ─────────────────────────────────────────────────────────────── */
  const [registry, setRegistry] = useState({ sites: [], loading: false, error: "", loaded: false });
  const startRegistryRun = useLatestRun();
  const requestedFor = useRef(null);

  const loadRegistry = useCallback(async () => {
    if (!customerId) return null;
    const isLatest = startRegistryRun();
    requestedFor.current = customerId;
    setRegistry((current) => ({ ...current, loading: true, error: "" }));
    try {
      const next = await apiJson(registryUrl(customerId), { cache: "no-store", fallbackError: SERVICE_REGISTRY_LOAD_FAILED });
      const sites = Array.isArray(next?.sites) ? next.sites : [];
      if (isLatest()) setRegistry({ sites, loading: false, error: "", loaded: true });
      return sites;
    } catch (loadError) {
      if (isLatest()) {
        setRegistry({ sites: [], loading: false, error: loadError?.message || SERVICE_REGISTRY_LOAD_FAILED, loaded: false });
      }
      return null;
    }
  }, [customerId, startRegistryRun]);

  /* เปลี่ยนลูกค้า = ทะเบียนเดิมใช้ไม่ได้ */
  useEffect(() => {
    requestedFor.current = null;
    setRegistry({ sites: [], loading: false, error: "", loaded: false });
  }, [customerId]);

  /* โหลดครั้งแรกที่ตารางเข้าโหมดแก้ — ครั้งเดียวต่อลูกค้า (พังแล้วรอคนกดลองใหม่ ไม่ยิงวน) */
  const editing = data?.mode === "edit";
  useEffect(() => {
    if (!editing || !customerId || requestedFor.current === customerId) return;
    loadRegistry();
  }, [editing, customerId, loadRegistry]);

  const registryView = useMemo(() => ({ ...registry, reload: loadRegistry }), [registry, loadRegistry]);
  return useMemo(
    () => ({ data, loading, error, reload, registry: registryView, draft, setDraft, dirty }),
    [data, loading, error, reload, registryView, draft, dirty],
  );
}
