"use client";
// ── ใบสั่งขายสาย SERVICE: การ์ด "รายการสินค้าและบริการ" + การ์ด "งานบริการ" (mig 0392 · PR-A · รื้อหน้าตา 01/10) ─────────
//
// ⭐ การ์ดราคา = **ตารางตัวเดียวกับใบเสนอราคา** (`QuotationReadOnlyLineItems`) อ่านอย่างเดียว ไม่มีอะไรของงานบริการแทรก
//   (ท้ายการ์ดมีแค่บรรทัดชี้ไปการ์ดงานบริการ)
// ⭐ การ์ดงานบริการ = ตาราง `ServiceSetupGrid` หนึ่งแถวต่อรายการ ①→⑥ ตามมติเจ้าของ 30/09 (เลือกทาง A 01/10 · ม็อก BindGridEdit)
//   + มติเจ้าของ 08/10 (สลับ ④⑤ · หน่วยจำนวนรอบบริการเป็นเดือน):
//   งานบริการ? → แพ็คเกจ FG → ไซต์ · โซน → รอบละกี่แพ็ค → จำนวนรอบบริการ → รวมแพ็ค + แถวรวมทุกรายการ
//   ของบนการ์ด: หัว (ชิป "งานบริการครบ x/n รายการ") · แถบช่วงบริการ · ตาราง · ทางเพิ่มไซต์ D19 · ประกาศลูกค้าไม่มีไซต์
// ⭐ ช่วงบริการสองโหมด (mig 0400 · มติเจ้าของ 01/10): สวิตช์ "ทั้งใบช่วงเดียว | แยกรายรายการ" บนแถบช่วงบริการ
//   · โหมดบนจอ = `periodModeOfDraft` (ร่างถ้าสลับไว้ ไม่งั้นค่าที่บันทึก) · สลับ = `switchPeriodMode` (ยังไม่บันทึกจนกดบันทึก)
//     🔴 สวิตช์ไม่เขียนช่วงใดลงร่าง — ค่าตั้งต้นหลังสลับคิดตอนวาด (`mergedLines` · `wholePeriodOfDraft`) ⇒ ร่างมีแต่ของที่คนแตะ
//   · แยกรายรายการ: ช่วงของรายการกรอกในคอลัมน์ ① ของตาราง · แถบโชว์ช่วงรวม **จากรายการบนจอ** (`localEnvelope` — ไม่ใช่ `view.period`
//     ซึ่งว่างจนกว่ารายการจะมีช่วงครบ) + ตัวนับ + โมดัล "ใช้ช่วงเดียวกันทุกรายการ"
//   · แถบบันทึกลอย **นอกการ์ด** (ดูคอมเมนต์ที่แถบ) · id ของหน้า (`#service-setup`) อยู่ที่การ์ดนี้
// ⭐ ร่างการแก้อยู่ที่ `useServiceSetup` (อยู่กับหน้า ไม่หายตอนสลับแท็บ) · บันทึก = PATCH ก้อนที่ต่างจากฐานเท่านั้น (ไม่ลองซ้ำ)
//   · 409 ใบถูกแก้จากอีกหน้าต่าง → โหลดใหม่ + บอก (ร่างที่ยังต่างจากของใหม่ยังค้างให้บันทึกต่อ)
//   · 400 fieldErrors → ช่องนั้นขึ้นแดง (การกดบันทึกคือการกด ⇒ แดงได้ตามกฎ 3)
// 🔴 กฎ 3: ไม่มีสีแดงก่อนกด — แดงมาจาก `highlight` (หน้าส่งหลังกดยื่น) หรือผลบันทึกไม่ผ่านเท่านั้น · ช่องที่แก้แล้วหลังจากนั้นหายแดงเอง
//   และ **ยังไม่แดงกลับหลังบันทึกสำเร็จ** (แผงแดงเป็นภาพ ณ ตอนกด · `touched` ล้างเมื่อแผงชุดใหม่มาเท่านั้น)
// ⚠️ ไม่มีแถบเลือกหลายรายการ/หน้าต่าง "เติมจากข้อความ" ใน PR-A (D24)
// ⭐ ปุ่ม "แก้งานบริการ" (mig 0396 · มติเจ้าของ 30/09 ข้อ 4.4 · ม็อก BindGridMulti กรอบ ข) อยู่หัวการ์ดงานบริการ ต่อจากชิป "งานบริการครบ x/n"
//   · โชว์ตาม `view.reopen.canReopen` ที่ server คิด (มีสิทธิ์แก้ใบ · ใบประทับแล้ว · มีอะไรให้แก้) — ไม่มีสิทธิ์ = ไม่โชว์
//   · TS เริ่มงานแล้ว/ด่านเงินของบัญชี = ปุ่มยังโชว์ กดแล้วบอกเหตุ — **ทุกการกดผ่าน `onReopen`** (หน้าโหลดก้อน GET สดก่อนเสมอ
//     แล้ว toast `blockedReason` ของก้อนสด หรือเปิด ReasonDialog) · การ์ดไม่ตัดสินจากก้อนที่โหลดพร้อมหน้า
//     🐞 ตรวจทาน ui-stale-reopen-blocker: เดิม `GatedAction blocker={view.reopen.blockedReason}` ตอบจากก้อนเก่าโดยไม่เรียก `onReopen`
//        ⇒ บัญชีแก้ช่วงครอบ/TS ลบรอบไปแล้ว ปุ่มยังตอบเหตุเดิม ("…แล้วกด ‘แก้งานบริการ’ อีกครั้ง") ทุกครั้งจนกด F5 · เหตุเก่าเหลือแค่ `title` (ชี้เมาส์)
//   · การ์ดไม่ยิง API เอง — หน้าเป็นเจ้าของ ReasonDialog + POST reopen
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ExternalLink, Lock, Package, Repeat, Save, SquarePen } from "lucide-react";
import Button from "@/components/ui/Button";
import { DetailCard } from "@/components/ui/DetailPage";
import SaveStatus from "@/components/ui/SaveStatus";
import StatusNotice from "@/components/ui/StatusNotice";
import Tag from "@/components/ui/Tag";
import { QuotationReadOnlyLineItems } from "@/components/salesPlanning/QuotationLineItems";
import ZonesBulkModal from "@/components/service/ZonesBulkModal";
import { apiJson } from "@/lib/apiFetch";
import { fmtNumber } from "@/lib/format";
import {
  SERVICE_KIND_PACKAGE, SERVICE_PERIOD_MODE_LINE, SERVICE_REOPEN_TEXT, SERVICE_SETUP_EDIT_TEXT, SERVICE_SETUP_GRID_TEXT, SERVICE_SETUP_LIMITS,
  SERVICE_SETUP_SQL_MESSAGES, serviceLineLabel, serviceSetupTotals,
} from "@/lib/sales/serviceSetup";
import { registryIndex, zoneTakenMap } from "@/lib/service/zonePickerOptions";
import ServicePeriodApplyAllModal from "./ServicePeriodApplyAllModal";
import ServicePeriodField from "./ServicePeriodField";
import ServiceRegistryPaths from "./ServiceRegistryPaths";
import ServiceSetupGrid, { newZoneRowKey } from "./ServiceSetupGrid";
import { SERVICE_REGISTRY_LOAD_FAILED } from "./useServiceSetup";
import {
  EMPTY_DRAFT, PERIOD_FIELD_ID, SAVE_FIELD_ID, SERVICE_SETUP_REVEAL_EVENT, applyPeriodToAllLines, ctxLineOf, fieldErrorsView, lineFieldId,
  linePeriodCounters, linesCardMeta, localEnvelope, localSetupCtx, mergedLines, patchDraftLine, periodModeOfDraft, sameSourceOf,
  serviceCardMeta, setupPayload, switchPeriodMode, wholePeriodOfDraft,
} from "./serviceSetupDraft";
import styles from "./SalesOrderServiceLines.module.css";

const EMPTY_MAP = new Map();
const EMPTY_REGISTRY = Object.freeze({ sites: [], loading: false, error: "", loaded: false, reload: null });
const SAVE_FAILED = "บันทึกงานบริการไม่สำเร็จ";
export const SERVICE_SETUP_STALE_NOTICE = SERVICE_SETUP_SQL_MESSAGES.workflow_stale.message;

const FOCUSABLE = 'input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * ⭐ ปุ่ม "ไปแก้" ของแผงแดง — พาไปช่องตาม id ของ `serviceSetupFieldId(issue)` แล้วโฟกัส
 *   · ยิงอีเวนต์ให้กล่องที่ย่อแถวโซน/แผ่นชนิดไว้กางตัวเองก่อน · รอเฟรมจนช่องโผล่ (สลับแท็บแล้วช่องเพิ่งถูกวาด)
 *   · id อยู่ที่กล่องห่อ (ดรอปดาวน์ค้นหาไม่มี prop id) ⇒ โฟกัสตัวควบคุมตัวแรกข้างใน
 * หน้าเรียกหลัง `selectTab(issue.tab)` ได้เลย — ใช้กับช่องของแผงงวด (`inst-…`) ได้เหมือนกัน
 * @returns false เมื่อไม่มี id (ข้อที่ไม่มีช่อง เช่น "ยังไม่มีงวด" — หน้าแค่สลับแท็บ)
 */
export function revealServiceSetupField(fieldId, { attempts = 12 } = {}) {
  if (typeof window === "undefined" || !fieldId) return false;
  window.dispatchEvent(new CustomEvent(SERVICE_SETUP_REVEAL_EVENT, { detail: { fieldId } }));
  const tryFocus = (left) => {
    const element = document.getElementById(fieldId);
    if (!element) {
      if (left > 0) window.requestAnimationFrame(() => tryFocus(left - 1));
      return;
    }
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    const target = element.matches(FOCUSABLE) ? element : element.querySelector(FOCUSABLE);
    target?.focus({ preventScroll: true });
  };
  window.requestAnimationFrame(() => tryFocus(attempts));
  return true;
}

/* ป้ายล็อกบนหัวการ์ด (โหมดอ่านเพราะติดด่าน) — ไม่มีสิทธิ์ = ไม่มีป้าย (กฎ UI: ไม่มีสิทธิ์ = ไม่โชว์) */
function lockLabel(view, editable) {
  if (!view || editable) return null;
  if (view.flow === "backfill" && view.state?.setupState === "submitted") return "ล็อกระหว่างรอตรวจ";
  if (view.flow === "stamped" || view.flow === "none") return null;
  const reason = view.editBlockedReason;
  if (!reason || reason === SERVICE_SETUP_EDIT_TEXT.noRight || reason === SERVICE_SETUP_EDIT_TEXT.notService) return null;
  return reason;
}

/**
 * @param order ใบสั่งขายของหน้า (lines · quotationId/quotation · customer · dealId) · @param setup ผลของ `useServiceSetup`
 * @param mode 'edit' | 'read' (`setup.data.mode`) · @param highlight Map fieldId → ข้อความ (หน้าส่ง **หลังกดยื่น** เท่านั้น)
 * @param onSaved `() => Promise` หน้าโหลดใบ + งานบริการใหม่หลังบันทึก · @param onDirtyChange `(dirty) => void`
 * @param canEditRounds / onRoundsSave ดินสอจำนวนรอบของใบที่อนุมัติแล้ว (`({ [lineId]: n }) => Promise<boolean>`)
 * @param summaryRows / grandTotal / highlightRows ส่งต่อให้กล่องยอดท้ายตาราง (ตัวเดียวกับใบเสนอราคา)
 * @param onReopen `() => void` ปุ่ม "แก้งานบริการ" ของใบที่ประทับแล้ว (หน้าเปิดโมดัลเหตุผลเอง) · ไม่ส่ง = ไม่มีปุ่ม
 * @param reopenBusy หน้ากำลังยิงคำสั่ง/โหลดก้อนสด (ปุ่มดับ — ไม่ใช่ด่านของข้อมูล)
 */
export default function SalesOrderServiceLines({
  order, setup, mode, highlight = EMPTY_MAP, onSaved, onDirtyChange, canEditRounds = false, onRoundsSave,
  summaryRows = [], grandTotal, highlightRows = [], id = "service-setup", onReopen, reopenBusy = false,
}) {
  const view = setup?.data || null;
  const registry = setup?.registry || EMPTY_REGISTRY;
  const draft = setup?.draft || EMPTY_DRAFT;
  const setDraft = setup?.setDraft;
  const dirty = !!setup?.dirty;
  const editable = (mode ?? view?.mode) === "edit" && typeof setDraft === "function";
  const flow = view?.flow || null;
  const orderId = order?.id || view?.orderId || null;

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveErrors, setSaveErrors] = useState(null);
  const [notice, setNotice] = useState(null);
  const [touched, setTouched] = useState(() => new Set());
  const [bulkLineId, setBulkLineId] = useState(null);
  const [applyAllOpen, setApplyAllOpen] = useState(false);

  /* แผงแดงชุดใหม่ = ช่องที่แก้ไปแล้วนับใหม่หมด */
  const pageHighlight = highlight instanceof Map ? highlight : EMPTY_MAP;
  useEffect(() => { setTouched(new Set()); }, [pageHighlight]);

  const dirtyChangeRef = useRef(onDirtyChange);
  dirtyChangeRef.current = onDirtyChange;
  useEffect(() => { dirtyChangeRef.current?.(dirty); }, [dirty]);

  const tableLines = useMemo(
    () => (Array.isArray(order?.lines) ? order.lines : []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    [order?.lines],
  );
  const fgById = useMemo(() => new Map((view?.fgOptions || []).map((option) => [option.id, option])), [view?.fgOptions]);
  const regIndex = useMemo(() => registryIndex(registry.sites), [registry.sites]);
  /* โซน/ไซต์ที่ใบเลือกไว้ (ก้อน GET) + ทะเบียน (ผลประเมิน · ตัวที่เพิ่งเลือก) — ของ GET มาก่อน ทะเบียนเติมทับรายละเอียด */
  const zonesById = useMemo(() => {
    const map = new Map((view?.zones || []).map((zone) => [zone.id, zone]));
    for (const [zoneId, zone] of regIndex.zonesById) map.set(zoneId, { ...(map.get(zoneId) || {}), ...zone });
    return map;
  }, [view?.zones, regIndex]);
  const sitesById = useMemo(() => {
    const map = new Map((view?.sites || []).map((site) => [site.id, site]));
    for (const [siteId, site] of regIndex.siteById) map.set(siteId, { ...site, ...(map.get(siteId) || {}) });
    return map;
  }, [view?.sites, regIndex]);

  const merged = useMemo(() => (view ? mergedLines(view, draft, { fgById }) : []), [view, draft, fgById]);
  const mergedById = useMemo(() => new Map(merged.map((line) => [line.lineId, line])), [merged]);
  /* โหมดช่วงบริการบนจอ — ตัวรวม (ชิป "งานบริการครบ x/n" · ป้ายรายการ) ถามโหมดจาก ctx: แยกรายรายการ = รายการต้องมีช่วงของตัวเองด้วย */
  const periodMode = periodModeOfDraft(view, draft);
  const byLine = periodMode === SERVICE_PERIOD_MODE_LINE;
  const ctx = useMemo(() => localSetupCtx(merged, zonesById, { periodMode }), [merged, zonesById, periodMode]);
  const totals = useMemo(() => serviceSetupTotals(ctx), [ctx]);
  const takenLines = useMemo(() => merged.map((line) => ({ lineId: line.lineId, lineNo: line.lineNo, zones: line.zones })), [merged]);
  const liveTerms = useMemo(
    () => new Map((view?.liveTermsInfo || []).map((row) => [row.zoneId, row.orderNumbers || []])),
    [view?.liveTermsInfo],
  );
  /* ช่วงของทั้งใบบนจอ (โหมดทั้งใบ — ร่างถ้าพิมพ์ · ใบที่บันทึกเป็นแยกรายรายการแล้วร่างสลับมา = ช่วงรวมของรายการ · ไม่งั้นค่าที่บันทึก)
     · ช่วงรวม + ตัวนับของรายการบนจอ (โหมดแยกรายรายการ — คิดจากช่วงของรายการ ครบหรือไม่ครบก็ได้) */
  const period = useMemo(() => wholePeriodOfDraft(view, draft), [view, draft]);
  const envelope = useMemo(() => localEnvelope(merged), [merged]);
  const periodCounter = useMemo(() => linePeriodCounters(merged), [merged]);
  /* ใบที่บันทึกเป็นแยกรายรายการ แล้วร่างสลับกลับทั้งใบ — บันทึกแล้วช่วงของรายการที่บันทึกไว้ถูกแทน (เตือน ไม่ใช่ข้อผิด) */
  const pendingClear = view?.periodMode === SERVICE_PERIOD_MODE_LINE && !byLine ? Number(view?.linePeriods?.filled || 0) : 0;
  const periodFieldIds = useMemo(
    () => merged.filter((line) => line.role === SERVICE_KIND_PACKAGE).map((line) => lineFieldId(line.lineId, "period")),
    [merged],
  );
  const serviceLines = totals.packageLines + totals.unsetLines;
  const noSites = registry.loaded && !(registry.sites || []).some((site) => site?.isActive !== false);

  const highlightOf = useCallback((fieldId) => {
    if (!fieldId || touched.has(fieldId)) return null;
    return saveErrors?.byField.get(fieldId) || pageHighlight.get(fieldId) || null;
  }, [touched, saveErrors, pageHighlight]);
  const zoneErrors = useMemo(() => {
    if (!saveErrors) return EMPTY_MAP;
    const map = new Map();
    for (const [key, message] of saveErrors.byZone) {
      const lineId = key.slice(0, key.indexOf(":"));
      if (!touched.has(lineFieldId(lineId, "zones"))) map.set(key, message);
    }
    return map;
  }, [saveErrors, touched]);

  const touch = useCallback((ids = []) => {
    if (!ids.length) return;
    setTouched((current) => {
      if (ids.every((fieldId) => current.has(fieldId))) return current;
      const next = new Set(current);
      ids.forEach((fieldId) => next.add(fieldId));
      return next;
    });
  }, []);
  const changeLine = (lineId, patch, touchedIds = []) => {
    setDraft((current) => patchDraftLine(current, lineId, patch));
    touch(touchedIds);
  };
  const replaceLine = (lineId, next, touchedIds = []) => {
    setDraft((current) => ({ ...current, lines: { ...(current?.lines || {}), [lineId]: next } }));
    touch(touchedIds);
  };
  const changePeriod = (next) => {
    setDraft((current) => ({ ...current, period: next }));
    touch([PERIOD_FIELD_ID]);
  };
  /* สลับโหมด / ใช้ช่วงเดียวกันทุกรายการ = เติมช่วงให้หลายช่อง ⇒ ช่องที่ถูกเติมหายแดง (กฎ 3: แดงจากการกด หายเมื่อช่องถูกแก้) */
  const changeMode = (next) => {
    setDraft((current) => switchPeriodMode(view, current, next));
    touch([PERIOD_FIELD_ID, ...periodFieldIds]);
  };
  const applyAll = (next) => {
    setDraft((current) => applyPeriodToAllLines(view, current, next));
    touch(periodFieldIds);
    setApplyAllOpen(false);
  };

  const reloadQuietly = async () => {
    try { await setup?.reload?.(); } catch { /* การ์ดขึ้น `setup.error` + ปุ่มลองโหลดอีกครั้งให้แล้ว */ }
  };

  const save = async () => {
    const payload = setupPayload(view, draft);
    if (!payload || saving || !orderId) return;
    const sent = draft;
    setSaving(true);
    setSaveError("");
    setNotice(null);
    try {
      const result = await apiJson(`/api/sales-planning/sales-orders/${encodeURIComponent(orderId)}/service-setup`, {
        method: "PATCH", json: payload, fallbackError: SAVE_FAILED,
      });
      setSaveErrors(null);
      /* ⚠️ ไม่ล้าง `touched` — ช่องที่แก้แล้วจะกลับไปอ่านแดงของแผงแดงชุดเก่า (ข้อความ "ยังไม่ใส่รอบ" ใต้ช่องที่ใส่แล้ว)
         แผงแดงเป็นภาพ ณ ตอนกด (r2 S9) · ชุด `touched` ล้างเมื่อหน้าส่งแผงชุดใหม่ (effect ข้างบน) เท่านั้น */
      if (result?.warning) setNotice({ tone: "warning", text: result.warning });
      try { await (onSaved ? onSaved() : setup?.reload?.()); } catch { /* บันทึกแล้ว — โหลดใหม่ไม่ขึ้นเป็นเรื่องของการ์ด (setup.error) */ }
      setDraft((current) => (current === sent ? EMPTY_DRAFT : current));
    } catch (failure) {
      const status = failure?.status;
      const data = failure?.data || {};
      if (status === 409 && data.code === "workflow_stale") {
        setNotice({ tone: "warning", text: SERVICE_SETUP_STALE_NOTICE });
        await reloadQuietly();
      } else if (status === 409) {
        setSaveError(failure.message || SAVE_FAILED);
        await reloadQuietly();
      } else if (status === 400 && Array.isArray(data.fieldErrors)) {
        const errors = fieldErrorsView(data.fieldErrors);
        setSaveErrors(errors);
        /* ปลดเฉพาะช่องที่ผลตีกลับชี้ (ให้แดงของมันขึ้น) — ช่องอื่นที่แก้แล้วคงหายแดงต่อ */
        setTouched((current) => {
          const next = new Set(current);
          for (const fieldId of errors.byField.keys()) next.delete(fieldId);
          for (const key of errors.byZone.keys()) next.delete(lineFieldId(key.slice(0, key.indexOf(":")), "zones"));
          return next;
        });
        setSaveError([failure.message, ...errors.general].filter(Boolean).join(" · "));
      } else {
        setSaveError(failure?.message || SAVE_FAILED);
      }
    } finally {
      setSaving(false);
    }
  };
  const discard = () => {
    setDraft(EMPTY_DRAFT);
    setSaveErrors(null);
    setSaveError("");
  };

  const bulkLine = bulkLineId ? mergedById.get(bulkLineId) || null : null;
  const addBulk = (rows) => {
    if (!bulkLine) return;
    const have = new Set(bulkLine.zones.map((row) => row.zoneId).filter(Boolean));
    const added = (Array.isArray(rows) ? rows : [])
      .filter((row) => row?.zoneId && !have.has(row.zoneId))
      .map((row) => ({ key: newZoneRowKey(), zoneId: row.zoneId, packsPerRound: row.packsPerRound == null ? "" : String(row.packsPerRound) }));
    changeLine(bulkLine.lineId, { zones: [...bulkLine.zones, ...added] }, [lineFieldId(bulkLine.lineId, "zones")]);
    setBulkLineId(null);
  };

  const arCode = order?.customer?.arCode || null;
  const customerText = arCode ? `ลูกค้า ${arCode}` : "ลูกค้ารายนี้";
  const siblings = Array.isArray(view?.siblingSites) ? view.siblingSites : [];
  const lock = lockLabel(view, editable);
  const retry = <Button size="sm" onClick={reloadQuietly}>ลองโหลดอีกครั้ง</Button>;

  const linesActions = order?.quotationId ? (
    <Button as={Link} href={`/sa/quotations/${order.quotationId}`} size="sm" variant="quiet" icon={<ExternalLink size={13} aria-hidden="true" />}>
      เปิด QT ต้นทาง
    </Button>
  ) : null;
  /* ปุ่ม "แก้งานบริการ" — โชว์ตาม `view.reopen.canReopen` ของ server · เหตุที่กดไม่ได้ตอบจากก้อนสดตอนกด (หน้า `onReopen`) */
  const reopen = view?.reopen || null;
  const showReopen = !!reopen?.canReopen && typeof onReopen === "function";
  const serviceActions = (
    <div className={styles.headActions}>
      {view && serviceLines > 0 ? <Tag>{`งานบริการครบ ${fmtNumber(totals.completeLines)}/${fmtNumber(totals.lineCount)} รายการ`}</Tag> : null}
      {lock ? <Tag icon={Lock}>{lock}</Tag> : null}
      {showReopen ? (
        <Button
          size="sm"
          icon={<SquarePen size={13} aria-hidden="true" />}
          title={reopen.blockedReason || undefined}
          disabled={reopenBusy}
          onClick={() => onReopen()}
        >
          {SERVICE_REOPEN_TEXT.button}
        </Button>
      ) : null}
    </div>
  );
  /* ท้ายการ์ดงานบริการมีของเมื่อไร — ไม่มีอะไร = ไม่วาดกล่อง (เส้นคั่นลอยเปล่า ๆ ใต้ตารางของใบที่รอตรวจ) */
  const footerHasContent = serviceLines === 0 || (flow === "stamped" && serviceLines > 0) || (editable && serviceLines > 0);
  const pointerSub = view && totals.packageLines
    ? `${fmtNumber(totals.packageLines)} รายการเป็นงานบริการ · รวม ${fmtNumber(totals.packsTotal || 0)} แพ็ค`
    : null;

  return (
    <>
    <DetailCard
      icon={Package}
      eyebrow="ORDER LINES"
      title="รายการสินค้าและบริการ"
      meta={linesCardMeta({ order, lineCount: tableLines.length })}
      actions={linesActions}
    >
      <div className={styles.body}>
        <QuotationReadOnlyLineItems
          lines={tableLines}
          summaryRows={summaryRows}
          grandTotal={grandTotal}
          highlightRows={highlightRows}
        />
        {view ? (
          <p className={styles.pointer}>
            <Repeat size={14} aria-hidden="true" className={styles.pointerIcon} />
            <span className={styles.pointerText}>
              {SERVICE_SETUP_GRID_TEXT.pointer}
              {pointerSub ? <span className={styles.pointerSub}>{pointerSub}</span> : null}
            </span>
            <Button as="a" href={`#${id}`} size="sm" variant="quiet" icon={<ArrowDown size={13} aria-hidden="true" />}>ไปที่งานบริการ</Button>
          </p>
        ) : null}
      </div>
    </DetailCard>

    <DetailCard
      id={id}
      icon={Repeat}
      eyebrow="SERVICE SETUP · งานบริการ"
      title="งานบริการ"
      meta={serviceCardMeta({ view, flow, editable, totals })}
      actions={serviceActions}
    >
      <div className={styles.body}>
        {view?.revisedFrom && flow === "pipeline" ? (
          <StatusNotice tone="info">
            {`ตั้งค่างานบริการยกมาจาก ${view.revisedFrom.orderNumber || "ใบเดิม"} — แก้ได้จนกว่าจะยื่นอนุมัติ · รอบบริการของใบเดิมจะย้ายมาใบนี้ตอนอนุมัติ`}
          </StatusNotice>
        ) : null}
        {notice ? <StatusNotice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</StatusNotice> : null}
        {setup?.error ? <StatusNotice tone="error" action={retry}>{setup.error}</StatusNotice> : null}
        {!view && !setup?.error ? <p className={styles.loadLine}>กำลังโหลดงานบริการ…</p> : null}

        {view && serviceLines > 0 ? (
          <ServicePeriodField
            mode={periodMode}
            period={byLine ? envelope : period}
            editable={editable}
            backfill={flow === "backfill"}
            error={highlightOf(PERIOD_FIELD_ID)}
            counter={periodCounter}
            pendingClear={pendingClear}
            onModeChange={changeMode}
            onChange={changePeriod}
            onApplyAll={() => setApplyAllOpen(true)}
          />
        ) : null}

        {editable && serviceLines > 0 && registry.loading ? <p className={styles.loadLine}>กำลังโหลดทะเบียนไซต์…</p> : null}
        {editable && serviceLines > 0 && registry.error ? (
          <StatusNotice
            tone="error"
            title={SERVICE_REGISTRY_LOAD_FAILED}
            action={registry.reload ? <Button size="sm" onClick={() => registry.reload()}>ลองโหลดอีกครั้ง</Button> : null}
          >
            {registry.error}
          </StatusNotice>
        ) : null}

        {view ? (
          <ServiceSetupGrid
            lines={merged}
            editable={editable}
            period={period}
            periodMode={periodMode}
            ctx={ctx}
            totals={totals}
            fgOptions={view.fgOptions || []}
            zonesById={zonesById}
            sitesById={sitesById}
            registry={registry}
            takenLines={takenLines}
            liveTerms={liveTerms}
            zoneErrors={zoneErrors}
            noSites={noSites}
            highlightOf={highlightOf}
            onLineChange={changeLine}
            onLineReplace={replaceLine}
            onOpenBulk={setBulkLineId}
            canEditRounds={canEditRounds && flow === "stamped"}
            onRoundsSave={onRoundsSave}
            roundsLowStage={flow === "stamped" ? "approved" : "read"}
          />
        ) : null}

        {view && footerHasContent ? (
          <div className={styles.footer}>
            {serviceLines === 0 ? (
              <p className={styles.noPackage}>
                {flow === "pipeline"
                  ? "ใบนี้ไม่มีรายการที่เป็นงานบริการ — ยื่นอนุมัติได้ตามปกติ (ไม่มีอะไรส่งให้ TS)"
                  : "ใบนี้ไม่มีรายการที่เป็นงานบริการ — ไม่มีอะไรส่งให้ TS"}
              </p>
            ) : null}
            {/* ภาคผนวก A.5: หลังอนุมัติมีสองทาง — ปุ่ม 'แก้งานบริการ' (ก่อน TS เริ่มงาน) หรือย้อนการอนุมัติแล้วออก Rev.
                · ไม่มีสิทธิ์ = บอกว่าใครเปิดแก้ได้ (ไม่มีปุ่มให้ชี้ · ไม่มีดินสอรอบ) */}
            {flow === "stamped" && serviceLines > 0 ? (
              <p className={styles.summarySub}>
                {reopen?.visible ? SERVICE_REOPEN_TEXT.stampedFooter : SERVICE_REOPEN_TEXT.stampedFooterNoRight}
              </p>
            ) : null}
            {editable && serviceLines > 0 ? <ServiceRegistryPaths dealId={order?.dealId} orderId={orderId} /> : null}
            {editable && serviceLines > 0 && noSites ? (
              <StatusNotice tone="warning">
                {`${customerText} ยังไม่มีไซต์ในทะเบียน — เลือกโซนไม่ได้ · บันทึกร่างได้ แต่${flow === "backfill" ? "ยื่นตรวจ" : "ยื่นอนุมัติ"}ไม่ได้จนกว่ามีโซน`}
              </StatusNotice>
            ) : null}
            {editable && serviceLines > 0 && noSites && siblings.length ? (
              <StatusNotice tone="info">
                {`พบไซต์ของนิติบุคคลเดียวกันใต้ ${siblings.map((row) => `${row.arCode || "ลูกค้าอีกใบ"} ${fmtNumber(row.siteCount || 0)} ไซต์`).join(", ")}`
                  + " — ใช้กับใบนี้ไม่ได้ (ไซต์ต้องเป็นของลูกค้าในใบ) · ขอ TS ตรวจว่าไซต์อยู่ผิดใบลูกค้าหรือไม่"}
              </StatusNotice>
            ) : null}
          </div>
        ) : null}
      </div>

      {editable && bulkLine ? (
        <ZonesBulkModal
          open
          onClose={() => setBulkLineId(null)}
          lineLabel={`รายการ ${bulkLine.lineNo}: ${serviceLineLabel(ctxLineOf(bulkLine))}`}
          lineNo={bulkLine.lineNo}
          registrySites={registry.sites}
          loading={registry.loading}
          loadError={registry.error}
          onRetry={registry.reload || undefined}
          taken={zoneTakenMap({ lines: takenLines, lineId: bulkLine.lineId })}
          existingCount={bulkLine.zones.filter((row) => row.zoneId).length}
          cap={SERVICE_SETUP_LIMITS.zonesPerLine}
          onAdd={addBulk}
        />
      ) : null}
      {editable && byLine && applyAllOpen ? (
        <ServicePeriodApplyAllModal
          initial={sameSourceOf(merged)?.period || null}
          count={periodCounter.total}
          onApply={applyAll}
          onClose={() => setApplyAllOpen(false)}
        />
      ) : null}
    </DetailCard>

    {/* ⭐ แถบบันทึกลอย — **พี่น้องหลังการ์ด ไม่ใช่ลูกของการ์ด**: `.card` ของ DetailCard เป็น overflow: hidden (= กล่องเลื่อนของ
        sticky) ⇒ แถบในการ์ดติดอยู่ท้ายตาราง ~2,000px ใต้ช่องที่กำลังแก้ · นอกการ์ดติดขอบล่างจอ (เหนือแถบเมนูมือถือ) ได้จริง
        ⭐ id ของข้อ "ยังไม่บันทึก" (`SAVE_FIELD_ID`) อยู่ที่ปุ่มบันทึก — ตัวแรกที่โฟกัสได้ในแถบคือ "ยกเลิกการแก้ไข" (Enter = ทิ้งทั้งร่าง) */}
    {editable && (dirty || saving || saveError) ? (
      <div className={`form-action-bar is-page ${styles.saveBar}`} role="region" aria-label="บันทึกงานบริการ">
        <SaveStatus
          status={saving ? "saving" : saveError ? "error" : "dirty"}
          message={saving ? undefined : saveError ? SAVE_FAILED : "มีการแก้ไขงานบริการที่ยังไม่บันทึก"}
        />
        <Button tone="neutral" disabled={saving || !dirty} onClick={discard}>ยกเลิกการแก้ไข</Button>
        <Button id={SAVE_FIELD_ID} tone="primary" icon={<Save size={14} aria-hidden="true" />} disabled={saving || !dirty} onClick={save}>
          {saving ? "กำลังบันทึก…" : "บันทึกงานบริการ"}
        </Button>
        {saveError ? <p className={styles.saveErrors} role="alert">{saveError}</p> : null}
      </div>
    ) : null}
    </>
  );
}
