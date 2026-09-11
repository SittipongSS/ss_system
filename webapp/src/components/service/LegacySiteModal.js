"use client";
// ── เพิ่มไซต์ย้อนหลัง — ไซต์ · โซน · จุดติดตั้ง (มติผู้ใช้ 2026-09-11 · ม็อก mockups/legacy-site) ──
//
// ⭐ **คีย์ไซต์ที่มีอยู่ก่อนมีระบบทีละแห่ง** — ของจริง ~380 จุดติดตั้ง / 148 ลูกค้าอยู่ในชีต
//   แต่ทางสร้างไซต์ทางเดียวคือใบประเมินพื้นที่ (มติ 30/08) ⇒ ของเก่าต้องเปิดใบประเมินปลอม
// ⭐ ขอบเขตที่ผู้ใช้เคาะ: *"เพิ่มแต่ ไซต์ โซน จุด — ยังไม่ต้องเชื่อมเครื่อง กับ SO สัญญา การจ่าย"*
//
// สามขั้น + หน้าผล:
//   ① ไซต์        — ช่องชุดเดียวกับฟอร์มไซต์ (`ServiceSiteFields`) + รหัสที่จะออก + ไซต์ที่ลูกค้ามีอยู่
//   ② โซนและจุด   — รางโซนซ้าย · ช่องชุดเดียวกับฟอร์มโซน (`ServiceZoneFields`) พร้อมจุดติดตั้ง
//   ③ ตรวจก่อนบันทึก — **พรีวิวจาก server** ด้วยตัวตัดสินชุดเดียวกับตอนบันทึก (บทเรียน #1685)
//   ผล           — รหัสจริง · สำเร็จบางส่วนบอกว่าเหลืออะไร แล้วส่งส่วนที่เหลือซ้ำด้วยโหมดเติมต่อ
//
// 🔑 **โหมดเติมต่อ** (`target`) — ไซต์มีอยู่แล้ว (ชื่อซ้ำ · สำเร็จบางส่วน · กดบันทึกแล้วเน็ตหลุด)
//   ⇒ ข้ามขั้น ① ไปเติมโซน/จุดในไซต์นั้น ไม่สร้างไซต์ซ้อน
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Check, CheckSquare, ExternalLink, Lock, Pencil, Plus, RefreshCw, RotateCcw,
  Square, Trash2,
} from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import { naText } from "@/lib/format";
import StatusNotice from "@/components/ui/StatusNotice";
import ServiceSiteFields, { useServiceSiteForm } from "./ServiceSiteFields";
import ServiceZoneFields, { ZONE_FORM_EMPTY } from "./ServiceZoneFields";
import { ApiNetworkError, apiJson } from "@/lib/apiFetch";
import {
  legacyNameKey, legacyPlanCounts, legacyPlanMessage, planLegacySiteRow, planLegacyZones,
} from "@/lib/service/legacySite";
import { SITE_CODE_HINT, siteRunOf } from "@/lib/service/siteCode";
import { normalizeFloor } from "@/lib/service/zoneCode";
import fieldStyles from "./ServiceSiteModal.module.css";
import styles from "./LegacySiteModal.module.css";

const STEPS = [
  { key: "site", label: "ไซต์" },
  { key: "zones", label: "โซนและจุดติดตั้ง" },
  { key: "review", label: "ตรวจก่อนบันทึก" },
];
const STEP_ORDER = STEPS.map((s) => s.key);

/* ของที่ **ไม่อยู่ในโมดัลนี้** — บอกตรง ๆ ว่ารอบนี้ยังไม่เชื่อม และใครทำต่อ (ขั้น ③ + หน้าผล) */
const NOT_LINKED = [
  { key: "assets", label: "ขึ้นทะเบียนเครื่องที่ติดตั้งอยู่", sub: "ที่หน้าไซต์ · การเลือกว่าเครื่องอยู่จุดไหนเป็นงานรอบถัดไป", who: "ฝ่ายบริการ" },
  { key: "so", label: "ใบสั่งขาย + ผูกเข้าโซน", sub: "ออกผ่านใบเสนอราคา → ใบสั่งขาย แล้วผูกที่หน้า “งานเข้าใหม่” (ไซต์นี้ขึ้นให้เลือกเพราะเป็นลูกค้าเดียวกัน)", who: "ฝ่ายขาย · บริการ" },
  { key: "contract", label: "สัญญา · งวดการจ่าย", sub: "สัญญากระดาษเก่าใช้ “เอกสารแทนสัญญา” ได้", who: "ฝ่ายขาย · บัญชี" },
];

// ⚠️ ตัวเดียวกันทุกเรนเดอร์ — `[]` สดทำให้ useMemo ของด่านคิดใหม่ทุกครั้ง
const NO_SITES = [];

let zoneSeq = 0;
const newZone = () => {
  zoneSeq += 1;
  return { key: `zone-${zoneSeq}`, ...ZONE_FORM_EMPTY, spots: [] };
};

/** รหัสโซนที่จะออก — รู้ท่อนไซต์ได้เฉพาะเมื่อไซต์มีรหัสแล้ว (โหมดเติมต่อ) */
const zoneCodePreview = (siteCode, floor) => {
  const run = siteRunOf(siteCode) || "····";
  return `ZN-${run}-${normalizeFloor(floor).value || "FF"}-·····`;
};

export default function LegacySiteModal({ open, onClose, onSaved }) {
  /* ⭐ **ร่างอยู่ข้ามการปิด/เปิด** — กด Esc/กากบาทกลางทางแล้วของที่คีย์ไว้ (ไซต์ + โซนหลายสิบจุด)
     ต้องไม่หาย · เริ่มใบใหม่เฉพาะเปิดครั้งแรก · เปิดหลังบันทึกเสร็จ · หรือกด "เริ่มใหม่" เอง
     (โมดัลอยู่ตลอดอายุหน้า — หน้าทะเบียนวางไว้นอก Workspace จึงไม่ถูกถอดตอนโหลดใหม่) */
  const ctl = useServiceSiteForm({ open, resetOnOpen: false });
  const { form, reset: resetSiteForm } = ctl;

  const [step, setStep] = useState("site");
  const [target, setTarget] = useState(null);           // { id, code, name, customerName } — โหมดเติมต่อ
  const [existingZones, setExistingZones] = useState([]);
  const [zones, setZones] = useState([]);
  const [activeKey, setActiveKey] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [duplicate, setDuplicate] = useState(null);    // จาก server (409) — ของ client อยู่ใน sitePlan
  const [resumeNote, setResumeNote] = useState("");   // โซนในฟอร์มที่ไซต์ปลายทางมีอยู่แล้ว (ตัดออกให้)
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewPayload, setPreviewPayload] = useState(null); // ของที่ตรวจแล้ว = ของที่บันทึก
  const [draftResumed, setDraftResumed] = useState(false);
  const finishedRef = useRef(true);                    // true = เปิดครั้งหน้าเริ่มใบใหม่

  const [customers, setCustomers] = useState([]);
  const [customersReload, setCustomersReload] = useState(0);
  const [customersError, setCustomersError] = useState("");
  const [customerSites, setCustomerSites] = useState({ customerId: null, rows: [], loading: false });
  const [sitesReload, setSitesReload] = useState(0);

  /* เริ่มใบใหม่ทั้งโมดัล — `siteDefaults` = ค่าที่ยกมาให้ (เช่น "อีกแห่ง" คงลูกค้า+จังหวัด) */
  const startOver = (siteDefaults = null) => {
    resetSiteForm(siteDefaults);
    setStep("site");
    setTarget(null);
    setExistingZones([]);
    setZones([]);
    setActiveKey(null);
    setPreview(null);
    setPreviewPayload(null);
    setResult(null);
    setDuplicate(null);
    setResumeNote("");
    setDraftResumed(false);
    setError("");
    finishedRef.current = false;
  };

  useEffect(() => {
    if (!open) return;
    if (finishedRef.current) {
      resetSiteForm(null);
      setStep("site");
      setTarget(null);
      setExistingZones([]);
      setZones([]);
      setActiveKey(null);
      setPreview(null);
      setPreviewPayload(null);
      setResult(null);
      setDuplicate(null);
      setResumeNote("");
      setDraftResumed(false);
      finishedRef.current = false;
    } else {
      setDraftResumed(true);
    }
    setError("");
  }, [open, resetSiteForm]);

  /* ไซต์ซ้ำที่ server บอก (409) เป็นของ "ลูกค้า + ชื่อ" ชุดที่ส่งไปตอนนั้น — แก้สองช่องนี้แล้ว
     ต้องทิ้ง ไม่งั้นปุ่ม "เติมโซน/จุดต่อในไซต์นี้" พาไปเติมไซต์ของลูกค้าอีกราย
     (409 ตั้งค่าโดยไม่แตะฟอร์ม ⇒ effect นี้ไม่ลบค่าที่เพิ่งได้มา) */
  useEffect(() => { setDuplicate(null); }, [form.customerId, form.name]);

  /* รายชื่อลูกค้า — **ดึงใหม่ทุกครั้งที่เปิด** (หน้าทะเบียนไซต์ไม่ได้ถือไว้)
     🐞 เดิมดึงครั้งเดียวตลอดอายุหน้า ⇒ ไปออกรหัส AR ที่ทะเบียนลูกค้าแล้วกลับมา ขั้น ① ยังบอก
        "ไม่มีรหัส AR" จนกว่าจะรีเฟรชทั้งหน้า · ปุ่ม "ตรวจอีกครั้ง" บนป้ายเตือนก็ดึงใหม่ได้ */
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setCustomersError("");
    apiJson("/api/customers", { fallbackError: "โหลดรายชื่อลูกค้าไม่สำเร็จ" })
      .then((data) => { if (alive) setCustomers(Array.isArray(data) ? data : (data?.rows || [])); })
      .catch((e) => { if (alive) setCustomersError(e.message); });
    return () => { alive = false; };
  }, [open, customersReload]);

  /* ไซต์ที่ลูกค้ารายนี้มีอยู่แล้ว — ให้เห็นก่อนกดต่อ + กันชื่อซ้ำตั้งแต่บนจอ
     ⚠️ ทุกชนิดทุกสถานะ (`kind=all` · รวมที่ปิดใช้งาน) — ตรงกับที่ server ตรวจ */
  const customerId = form.customerId;
  useEffect(() => {
    if (!open || !customerId) return undefined;
    let alive = true;
    setCustomerSites({ customerId, rows: [], loading: true });
    apiJson(`/api/service/sites?customerId=${encodeURIComponent(customerId)}&kind=all`, {
      fallbackError: "โหลดไซต์ของลูกค้าไม่สำเร็จ",
    })
      .then((rows) => { if (alive) setCustomerSites({ customerId, rows: Array.isArray(rows) ? rows : [], loading: false }); })
      .catch(() => { if (alive) setCustomerSites({ customerId, rows: [], loading: false, failed: true }); });
    return () => { alive = false; };
  }, [open, customerId, sitesReload]);

  const customer = useMemo(
    () => customers.find((c) => c.id === form.customerId) || null,
    [customers, form.customerId],
  );
  const knownSites = customerSites.customerId === form.customerId ? customerSites.rows : NO_SITES;

  /* 🔑 ตัวตัดสินชุดเดียวกับ server (`lib/service/legacySite.js`) — จอพูดเหมือนพรีวิวและตอนบันทึก */
  const sitePlan = useMemo(
    () => planLegacySiteRow(form, { customer, customerSites: knownSites }),
    [form, customer, knownSites],
  );
  const zonePlan = useMemo(
    () => planLegacyZones(zones, { existingZones, siteCode: target?.code || null }),
    [zones, existingZones, target],
  );
  const counts = legacyPlanCounts(zonePlan.zones);
  const draftSpots = zones.reduce((sum, z) => sum + (Array.isArray(z.spots) ? z.spots.length : 0), 0);

  const siteDuplicate = duplicate || sitePlan.duplicate;
  const codePreview = target?.code || (sitePlan.prefix ? `${sitePlan.prefix}····` : SITE_CODE_HINT);
  const activeZone = zones.find((z) => z.key === activeKey) || null;

  const go = (next) => { setError(""); setDraftResumed(false); setStep(next); };

  /* ── โหมดเติมต่อ — ไซต์มีอยู่แล้ว ⇒ ไปเติมโซน/จุด ไม่สร้างไซต์ ───────────── */
  const enterResume = async (site, draftZones = null) => {
    setBusy(true);
    setError("");
    try {
      const rows = await apiJson(`/api/service/sites/${site.id}/zones`, { fallbackError: "โหลดโซนของไซต์ไม่สำเร็จ" });
      const existing = Array.isArray(rows) ? rows : [];
      setExistingZones(existing);
      setTarget({ id: site.id, code: site.code || null, name: site.name, customerName: site.customerName || customer?.name || null });
      /* ⭐ **ตัดโซนที่ไซต์มีอยู่แล้วออกให้เอง** — ทางหลักที่มาถึงตรงนี้คือ "กดบันทึกแล้วเน็ตหลุด →
         กดใหม่ชนไซต์ซ้ำ" ซึ่งแปลว่าไซต์ **และโซน** อาจบันทึกไปแล้ว · ถ้าคงไว้ ทุกโซนจะชนด่านชื่อซ้ำ
         แล้วคนจะเปลี่ยนชื่อหนีจนได้โซนซ้อน (ตัวนำเข้าก็เทียบกุญแจเดียวกันแล้วข้ามของที่มีอยู่) */
      const have = new Set(existing.map((z) => legacyNameKey(z.name)));
      const drafts = draftZones ?? zones;
      const already = drafts.filter((z) => z.name.trim() && have.has(legacyNameKey(z.name)));
      const pending = drafts.filter((z) => !already.includes(z));
      setZones(pending);
      setActiveKey(pending[0]?.key || null);
      setResumeNote(already.length
        ? `ไซต์นี้มีโซน ${already.map((z) => `“${z.name.trim()}”`).join(" · ")} อยู่แล้ว — ตัดออกจากรายการที่จะเติม`
          + " (ถ้าเพิ่งกดบันทึกแล้วเน็ตหลุด แปลว่าบันทึกไปแล้ว ดูได้ที่หน้าไซต์)"
        : "");
      // ไซต์มีอยู่จริง (อาจเพิ่งถูกสร้างในรอบที่ไม่รู้ผล) — ให้ทะเบียนข้างหลังเห็น
      if (already.length) onSaved?.(null);
      setDuplicate(null);
      setPreview(null);
      setResult(null);
      setStep("zones");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const leaveResume = () => {
    setTarget(null);
    setResumeNote("");
    setExistingZones([]);
    setPreview(null);
    go("site");
  };

  /* ── ขั้น ① → ② ─────────────────────────────────────────────────────── */
  const nextFromSite = () => {
    // ปุ่มกดได้เสมอ บอกเหตุตอนกด (กติกา GatedAction) — ไม่ใช่ปุ่มเทาที่ไม่บอกว่าขาดอะไร
    if (sitePlan.errors.length) { setError(legacyPlanMessage(sitePlan.errors)); return; }
    go("zones");
  };

  /* ── โซน ───────────────────────────────────────────────────────────── */
  const addZone = () => {
    const zone = newZone();
    setZones((prev) => [...prev, zone]);
    setActiveKey(zone.key);
  };
  const removeZone = (key) => {
    const next = zones.filter((z) => z.key !== key);
    setZones(next);
    if (activeKey === key) setActiveKey(next[next.length - 1]?.key || null);
  };
  const setActiveZoneForm = (updater) => {
    setZones((prev) => prev.map((z) => (z.key === activeKey
      ? { ...z, ...(typeof updater === "function" ? updater(z) : updater), key: z.key }
      : z)));
  };

  const payload = (extra = {}) => ({
    ...(target ? { targetSiteId: target.id } : { site: form }),
    zones: zones.map((z) => ({
      key: z.key, name: z.name, floor: z.floor, building: z.building, note: z.note, spots: z.spots,
    })),
    ...extra,
  });

  const handleApiError = (e, { committing = false } = {}) => {
    if (e?.data?.duplicate) setDuplicate(e.data.duplicate);
    // "ไม่รู้ผล" จริงเฉพาะตอนบันทึก — พรีวิวไม่เขียนอะไร เน็ตหลุดตอนนั้นแค่กดตรวจใหม่
    if (e instanceof ApiNetworkError && committing) {
      setError(`${e.message} · ไม่รู้ผลว่าบันทึกไปแล้วหรือยัง — กดใหม่ได้ ถ้าเจอว่าไซต์ซ้ำ ให้กด “เติมโซน/จุดต่อในไซต์นี้”`);
      return;
    }
    setError(e.message || "ทำรายการไม่สำเร็จ");
  };

  /* ── ขั้น ② → ③ : พรีวิวจาก server ─────────────────────────────────────── */
  const toReview = async () => {
    const errors = [...(target ? [] : sitePlan.errors), ...zonePlan.errors];
    if (target && !zonePlan.errors.length && !zones.length) errors.push("ยังไม่มีโซนที่จะเติม — เพิ่มอย่างน้อยหนึ่งโซน");
    if (errors.length) { setError(legacyPlanMessage(errors)); return; }
    setBusy(true);
    setError("");
    /* ⭐ ถ่ายของที่ส่งไปตรวจเก็บไว้ แล้วบันทึก **ก้อนเดียวกันนั้น** — ระหว่างรอพรีวิวช่องยังพิมพ์ได้
       ถ้าบันทึกจาก state สด ของที่ขั้น ③ โชว์กับของที่ลงฐานอาจไม่ใช่ชุดเดียวกัน */
    const snapshot = payload();
    try {
      const data = await apiJson("/api/service/legacy-sites", {
        method: "POST", json: { ...snapshot, preview: true }, fallbackError: "ตรวจไม่สำเร็จ",
      });
      setPreview(data);
      setPreviewPayload(snapshot);
      setDuplicate(null);
      setStep("review");
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  };

  /* ── ③ บันทึก ─────────────────────────────────────────────────────────
     ⚠️ ไม่ลองซ้ำอัตโนมัติ (กฎ apiFetch ของเส้นเขียน) — POST ซ้ำ = ไซต์ซ้อน · กดใหม่เองแล้ว
        จะชนด่านชื่อซ้ำ ซึ่งพาเข้าโหมดเติมต่อ */
  const commit = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await apiJson("/api/service/legacy-sites", {
        method: "POST", json: previewPayload || payload(), fallbackError: "บันทึกไม่สำเร็จ",
      });
      setResult(data);
      setStep("done");
      finishedRef.current = !data.partial;   // บันทึกครบ = เปิดครั้งหน้าเริ่มใบใหม่ · บางส่วน = ยังมีของค้าง
      onSaved?.(data);
    } catch (e) {
      handleApiError(e, { committing: true });
    } finally {
      setBusy(false);
    }
  };

  /* ── หลังบันทึก ───────────────────────────────────────────────────── */
  const anotherSite = () => {
    // ลูกค้าหนึ่งรายมี ~2.6 ไซต์ ⇒ คงลูกค้า + จังหวัดไว้ให้ ที่เหลือเริ่มใหม่
    startOver({ customerId: form.customerId, provinceCode: form.provinceCode, province: form.province });
    // ไซต์ที่เพิ่งสร้างต้องขึ้นในรายการ "ไซต์ของลูกค้ารายนี้" (และด่านชื่อซ้ำ) — ดึงใหม่
    setSitesReload((n) => n + 1);
  };

  const retryRemaining = () => {
    const failedKeys = new Set((result?.zones || []).filter((z) => z.error).map((z) => z.key));
    const remaining = zones.filter((z) => failedKeys.has(z.key));
    enterResume(result.site, remaining);
  };

  /* ทางออกของ "ไซต์ซ้ำ" — ขั้น ① (ตรวจบนจอ) และขั้น ②③ (server ตอบ 409 · เช่นกดบันทึกแล้วเน็ตหลุด
     กดใหม่มาชนไซต์ที่เพิ่งสร้างไปเอง) ใช้ปุ่มชุดเดียวกัน */
  const duplicateActions = siteDuplicate ? (
    <div className={styles.inlineActions}>
      <Button size="sm" tone="neutral" as={Link} href={`/service/sites/${siteDuplicate.id}`}>เปิดไซต์เดิม</Button>
      <Button size="sm" onClick={() => enterResume({ ...siteDuplicate, customerName: customer?.name })} disabled={busy}>
        เติมโซน/จุดต่อในไซต์นี้
      </Button>
    </div>
  ) : null;

  /* ── ส่วนประกอบของขั้น ① ─────────────────────────────────────────────── */
  const identityExtra = (
    <>
      <div className={`${fieldStyles.field} ${fieldStyles.wide}`}>
        <span>รหัสไซต์</span>
        <p className={styles.codeValue}>{codePreview}</p>
        <small>4 หลักท้ายออกตอนบันทึก · <b>ลูกค้าและจังหวัดถูกตรึงในรหัสตลอดไป</b> — แก้ทีหลัง รหัสไม่เปลี่ยน</small>
      </div>

      {sitePlan.arMissing && (
        <div className={fieldStyles.wide}>
          <StatusNotice
            tone="warning"
            title="ลูกค้ารายนี้ยังไม่มีรหัสลูกค้า (AR)"
            action={(
              <div className={styles.inlineActions}>
                <Button size="sm" tone="neutral" as={Link} href={`/database/customers/${customer.id}`} target="_blank"
                  icon={<ExternalLink size={14} aria-hidden="true" />}>
                  เปิดทะเบียนลูกค้า
                </Button>
                {/* ออกรหัสในแท็บใหม่แล้วกลับมา — ดึงรายชื่อลูกค้าใหม่โดยไม่ต้องรีเฟรชทั้งหน้า */}
                <Button size="sm" tone="neutral" variant="quiet" onClick={() => setCustomersReload((n) => n + 1)}
                  icon={<RefreshCw size={14} aria-hidden="true" />}>
                  ตรวจอีกครั้ง
                </Button>
              </div>
            )}
          >
            ออกรหัสที่ทะเบียนลูกค้าก่อนจึงสร้างไซต์ได้ — รหัสไซต์ประกอบจากรหัสลูกค้า
          </StatusNotice>
        </div>
      )}

      {siteDuplicate && (
        <div className={fieldStyles.wide}>
          <StatusNotice tone="error" title={`ลูกค้ารายนี้มีไซต์ “${siteDuplicate.name}” อยู่แล้ว`}>
            <span className={styles.mono}>{siteDuplicate.code || siteDuplicate.id}</span>
            {" "}— เทียบชื่อแบบไม่สนช่องว่าง ตัวพิมพ์ วงเล็บ ขีด “สาขา สีลม” กับ “สาขาสีลม” นับว่าซ้ำ
          </StatusNotice>
          {duplicateActions}
        </div>
      )}

      {form.customerId && (
        <div className={`${fieldStyles.field} ${fieldStyles.wide}`}>
          <span>
            ไซต์ของลูกค้ารายนี้ในระบบ
            {customerSites.loading ? " · กำลังโหลด…" : ` · ${knownSites.length} แห่ง`}
          </span>
          {knownSites.length > 0 && (
            <ul className={styles.siteList}>
              {knownSites.map((s) => (
                <li key={s.id}>
                  <span className={styles.mono}>{naText(s.code)}</span>
                  <span>{s.name}</span>
                  {s.isActive === false && <span className={styles.muted}>ปิดใช้งาน</span>}
                </li>
              ))}
            </ul>
          )}
          <small>
            {customerSites.failed
              ? "โหลดรายการไม่สำเร็จ — ด่านชื่อซ้ำยังตรวจอีกรอบตอนตรวจก่อนบันทึก"
              : "ดูก่อนกดต่อ — ถ้าไซต์นี้มีอยู่แล้ว ให้เปิดไซต์เดิมแทนการสร้างซ้ำ"}
          </small>
        </div>
      )}
    </>
  );

  /* ── รางขั้น ─────────────────────────────────────────────────────────── */
  const stepIndex = STEP_ORDER.indexOf(step === "done" ? "review" : step);
  const stepRail = step === "done" ? null : (
    <ol className={styles.steps} aria-label="ขั้นของการเพิ่มไซต์ย้อนหลัง">
      {STEPS.map((s, index) => {
        const done = index < stepIndex || (s.key === "site" && !!target);
        const now = s.key === step;
        return (
          <li key={s.key} data-active={now ? "yes" : undefined} data-done={done && !now ? "yes" : undefined}
            aria-current={now ? "step" : undefined}>
            <span className={styles.stepNo} aria-hidden="true">
              {done && !now ? <Check size={12} /> : index + 1}
            </span>
            {s.key === "site" && target ? "ไซต์เดิม" : s.label}
          </li>
        );
      })}
    </ol>
  );

  /* ── แถบบริบทของไซต์ (ขั้น ② ③) ───────────────────────────────────────── */
  const contextStrip = (
    <div className={styles.context}>
      <Check size={14} aria-hidden="true" className={styles.contextMark} />
      <span className={styles.contextText}>
        {target
          ? <>ไซต์เดิม · <span className={styles.mono}>{naText(target.code)}</span> · {target.name}
            {target.customerName ? ` · ${target.customerName}` : ""} · มีอยู่แล้ว {existingZones.length} โซน</>
          : <>{[customer?.arCode, customer?.name, form.name, form.province].filter(Boolean).join(" · ")}
            {" · "}<span className={styles.mono}>{codePreview}</span></>}
      </span>
      {target ? (
        <Button size="sm" tone="neutral" variant="quiet" onClick={leaveResume} disabled={busy}>
          สร้างไซต์ใหม่แทน
        </Button>
      ) : (
        <Button size="sm" tone="neutral" variant="quiet" onClick={() => go("site")} disabled={busy}
          icon={<Pencil size={14} aria-hidden="true" />}>
          แก้ข้อมูลไซต์
        </Button>
      )}
    </div>
  );

  /* ── เนื้อหาแต่ละขั้น ─────────────────────────────────────────────────── */
  let body = null;
  let footer = null;

  if (step === "site") {
    body = (
      <>
        {customersError && <p className="form-error" role="alert">{customersError}</p>}
        <ServiceSiteFields
          ctl={ctl}
          customers={customers}
          identityExtra={identityExtra}
          provinceHint="ตัวย่อจังหวัดเข้าไปอยู่ในรหัสไซต์ — ดูรหัสด้านล่าง"
        />
      </>
    );
    footer = (
      <>
        <span className={styles.footNote} data-ok={sitePlan.errors.length ? undefined : "yes"}>
          {sitePlan.errors.length
            ? `ยังขาด ${sitePlan.errors.length} ข้อ — กด “ต่อไป” เพื่อดูว่าขาดอะไร`
            : "ครบแล้ว — ต่อไปกรอกโซนและจุดติดตั้ง"}
        </span>
        {/* ปิดแล้วร่างอยู่ต่อ — "ยกเลิก" จะอ่านว่าทิ้งของที่คีย์ไว้ ซึ่งไม่ใช่สิ่งที่เกิด */}
        <Button tone="neutral" onClick={onClose} disabled={busy}>ปิดไว้ก่อน</Button>
        <Button tone="primary" onClick={nextFromSite} disabled={busy}
          icon={<ArrowRight size={15} aria-hidden="true" />}>
          ต่อไป: โซนและจุดติดตั้ง
        </Button>
      </>
    );
  }

  if (step === "zones") {
    body = (
      <>
        {contextStrip}
        {resumeNote && target && (
          <StatusNotice tone="info" className={styles.resumeNote}
            action={(
              <Button size="sm" tone="neutral" as={Link} href={`/service/sites/${target.id}`}
                icon={<ExternalLink size={14} aria-hidden="true" />}>
                เปิดหน้าไซต์
              </Button>
            )}>
            {resumeNote}
          </StatusNotice>
        )}
        <div className={styles.zoneLayout}>
          <nav className={styles.zoneRail} aria-label="โซนของไซต์นี้">
            <p className={styles.railCap}><span>โซน · {zones.length}</span><span>จุด</span></p>
            {zones.map((z) => (
              <button key={z.key} type="button" className={styles.zoneItem}
                aria-current={z.key === activeKey ? "true" : undefined}
                onClick={() => setActiveKey(z.key)}>
                <span className={styles.zoneFloor}>{naText(normalizeFloor(z.floor).value)}</span>
                <span className={styles.zoneName} data-empty={z.name.trim() ? undefined : "yes"}>
                  {z.name.trim() || "ยังไม่มีชื่อ"}
                </span>
                <span className={styles.zoneCount}>{z.spots.length}</span>
              </button>
            ))}
            <Button size="sm" tone="neutral" variant="quiet" onClick={addZone}
              icon={<Plus size={14} aria-hidden="true" />}>
              เพิ่มโซน
            </Button>
            {target && existingZones.length > 0 && (
              <div className={styles.existing}>
                <p className={styles.railCap}><span>มีอยู่แล้วในไซต์</span></p>
                <ul>
                  {existingZones.map((z) => (
                    <li key={z.id}>
                      <span className={styles.zoneFloor}>{naText(z.floor)}</span>
                      <span className={styles.zoneName}>{z.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!target && (
              <p className={styles.railHint}>ยังไม่รู้พื้นที่ (รอติดตั้ง) บันทึกไซต์โดยไม่มีโซนได้ แต่นัดงานต้องมีโซนก่อน</p>
            )}
          </nav>

          <div className={styles.zoneMain}>
            {activeZone ? (
              <>
                <div className={styles.zoneMainHead}>
                  <span>{activeZone.name.trim() || "โซนใหม่"}</span>
                  <Button size="sm" tone="danger" variant="quiet" onClick={() => removeZone(activeZone.key)}
                    icon={<Trash2 size={14} aria-hidden="true" />}>
                    เอาโซนนี้ออก
                  </Button>
                </div>
                <ServiceZoneFields
                  form={activeZone}
                  setForm={setActiveZoneForm}
                  floorHint={`รหัสโซน ${zoneCodePreview(target?.code, activeZone.floor)} · แก้ทีหลังรหัสไม่เปลี่ยน · โซนที่คร่อมหลายชั้นให้แยกโซนละชั้น`}
                />
              </>
            ) : (
              <div className={styles.zoneEmpty}>
                <p>{target ? "เพิ่มโซนที่จะเติมเข้าไซต์นี้" : "ยังไม่มีโซน — โซน = พื้นที่ย่อยในไซต์ หนึ่งโซนหนึ่งชั้น (ล็อบบี้ · ห้องน้ำชั้น 2)"}</p>
                <Button onClick={addZone} icon={<Plus size={15} aria-hidden="true" />}>เพิ่มโซน</Button>
              </div>
            )}
          </div>
        </div>
      </>
    );
    footer = (
      <>
        <span className={styles.footNote}>
          {zones.length} โซน · {draftSpots} จุด
          {zonePlan.errors.length ? ` · ยังขาด ${zonePlan.errors.length} ข้อ` : ""}
        </span>
        {!target && (
          <Button tone="neutral" onClick={() => go("site")} disabled={busy}
            icon={<ArrowLeft size={15} aria-hidden="true" />}>
            ย้อนกลับ
          </Button>
        )}
        <Button tone="primary" onClick={toReview} disabled={busy}
          icon={<ArrowRight size={15} aria-hidden="true" />}>
          {busy ? "กำลังตรวจ…" : "ตรวจก่อนบันทึก"}
        </Button>
      </>
    );
  }

  if (step === "review" && preview) {
    const pCounts = preview.counts || counts;
    body = (
      <>
        {contextStrip}
        <h4 className={styles.section}>จะสร้าง</h4>
        <ul className={styles.plan}>
          {target ? (
            <li>
              <span className={styles.planCode}>{naText(target.code)}</span>
              <span className={styles.planText}><b>ไซต์เดิม</b> {target.name}</span>
              <span className={styles.planNote}>มีอยู่แล้ว</span>
            </li>
          ) : (
            <li>
              <span className={styles.planCode}>{preview.site?.codePrefix ? `${preview.site.codePrefix}····` : codePreview}</span>
              <span className={styles.planText}><b>ไซต์</b> {preview.site?.name} · {preview.site?.customerName}</span>
              <span className={styles.planNote}>ใช้งาน</span>
            </li>
          )}
          {(preview.zones || []).map((z) => (
            <li key={z.key} className={styles.planZone}>
              <span className={styles.planCode}>{z.codePrefix ? `${z.codePrefix}·····` : zoneCodePreview(null, z.floor)}</span>
              <span className={styles.planText}>
                โซน {z.name}
                {z.spots?.length ? <small className={styles.planSpots}>{z.spots.join(" · ")}</small> : null}
              </span>
              <span className={styles.planNote}>{z.spotCount} จุด</span>
            </li>
          ))}
        </ul>
        {!preview.zones?.length && <p className={styles.hint}>ไม่มีโซน — บันทึกไซต์อย่างเดียว เติมโซนทีหลังได้ที่หน้าไซต์</p>}
        <p className={styles.hint}>เลขท้ายของรหัสออกตอนบันทึก — ตัวนับรวมทั้งบริษัท พรีวิวเลขไว้ก่อนแล้วมีคนบันทึกพร้อมกัน เลขจะไม่ตรง</p>

        <h4 className={styles.section}>ถูกตรึงในรหัสตลอดไป</h4>
        <div className={styles.frozen}>
          {!target && customer?.arCode && <span><Lock size={13} aria-hidden="true" /> ลูกค้า {customer.arCode}</span>}
          {!target && form.province && <span><Lock size={13} aria-hidden="true" /> จังหวัด {form.province}</span>}
          {preview.zones?.length > 0 && <span><Lock size={13} aria-hidden="true" /> ชั้นของแต่ละโซน</span>}
        </div>
        <p className={styles.hint}>ชื่อไซต์ · ชื่อโซน · ชื่อและจำนวนจุด แก้ทีหลังได้ทั้งหมด</p>

        <h4 className={styles.section}>รอบนี้ยังไม่เชื่อม</h4>
        <ul className={styles.checklist}>
          {NOT_LINKED.map((item) => (
            <li key={item.key}>
              <Square size={15} aria-hidden="true" />
              <span>{item.label}<small>{item.sub}</small></span>
              <span className={styles.who}>{item.who}</span>
            </li>
          ))}
        </ul>
        <p className={styles.hint}>ระหว่างนี้ไซต์อยู่ในทะเบียนแล้ว แต่ยังไม่มีรอบบริการ — อย่าเพิ่งตั้งรอบจนกว่าจะมีใบสั่งขาย</p>

        <StatusNotice tone="warning" title="ย้อนกลับเองไม่ได้" className={styles.notice}>
          ระบบไม่มีถังขยะ · ไซต์ที่มีโซนแล้ว ลบได้เฉพาะผู้ดูแลระบบ (คนอื่นปิดใช้งานได้)
        </StatusNotice>
      </>
    );
    footer = (
      <>
        <span className={styles.footNote} data-ok="yes">ผ่านทุกด่าน — พรีวิวจาก server เมื่อสักครู่</span>
        <Button tone="neutral" onClick={() => go("zones")} disabled={busy}
          icon={<ArrowLeft size={15} aria-hidden="true" />}>
          ย้อนกลับ
        </Button>
        <Button tone="primary" onClick={commit} disabled={busy}>
          {busy
            ? "กำลังบันทึก…"
            : `บันทึก · ${target ? "" : "ไซต์ 1 · "}โซน ${pCounts.zones} · จุด ${pCounts.spots}`}
        </Button>
      </>
    );
  }

  if (step === "done" && result) {
    const failed = (result.zones || []).filter((z) => z.error);
    const spotLost = (result.zones || []).filter((z) => !z.error && z.spotError);
    const total = (result.zones || []).length;
    const plannedSpots = zones.reduce((sum, z) => sum + z.spots.length, 0);
    body = result.partial ? (
      <>
        <StatusNotice tone="warning"
          title={`สร้างแล้ว: ${result.site.created ? "ไซต์ · " : ""}${total - failed.length}/${total} โซน · ${result.counts.spots}/${plannedSpots} จุด`}>
          ที่เหลือยังไม่ได้สร้าง — ของที่สร้างแล้วอยู่ในทะเบียนจริง ไม่ต้องคีย์ใหม่
        </StatusNotice>
        <ul className={styles.plan}>
          <li>
            <span className={styles.planCode}>{naText(result.site.code)}</span>
            <span className={styles.planText}>ไซต์ {result.site.name}</span>
            <span className={styles.planNote} data-tone="ok">{result.site.created ? "สร้างแล้ว" : "ไซต์เดิม"}</span>
          </li>
          {(result.zones || []).map((z) => (
            <li key={z.key} className={styles.planZone}>
              <span className={styles.planCode}>{naText(z.code)}</span>
              <span className={styles.planText}>
                {z.name}{z.error ? "" : ` · ${z.spotCount} จุด`}
                {z.error && <small className={styles.planError}>{z.error}</small>}
                {!z.error && z.spotError && <small className={styles.planError}>{z.spotError}</small>}
              </span>
              <span className={styles.planNote} data-tone={z.error ? "bad" : "ok"}>{z.error ? "ไม่ได้สร้าง" : "สร้างแล้ว"}</span>
            </li>
          ))}
        </ul>
        {failed.length > 0 && (
          <p className={styles.hint}>แก้แล้วส่งซ้ำ — ระบบส่งเฉพาะของที่ยังไม่ได้สร้าง ไม่สร้างไซต์/โซนซ้อน</p>
        )}
        {spotLost.length > 0 && (
          <p className={styles.hint}>โซนที่จุดติดตั้งไม่ครบถูกสร้างแล้ว — เติมจุดที่ปุ่มแก้ไขโซนในหน้าไซต์ (ส่งซ้ำจะได้โซนซ้ำ)</p>
        )}
      </>
    ) : (
      <>
        <StatusNotice tone="success" title={result.site.created ? "บันทึกไซต์ย้อนหลังแล้ว" : "เติมโซนเข้าไซต์เดิมแล้ว"}>
          {`${result.site.created ? "ไซต์ 1 · " : ""}โซน ${result.counts.zones} · จุดติดตั้ง ${result.counts.spots}`}
        </StatusNotice>
        <ul className={styles.codes}>
          <li><b className={styles.mono}>{naText(result.site.code)}</b> {result.site.name}</li>
          {(result.zones || []).map((z) => (
            <li key={z.key}><b className={styles.mono}>{z.code}</b> {z.name} · {z.spotCount} จุด</li>
          ))}
        </ul>
        <h4 className={styles.section}>ต่อจากนี้ (นอกโมดัลนี้)</h4>
        <ul className={styles.checklist}>
          <li data-done="yes">
            <CheckSquare size={15} aria-hidden="true" />
            <span>ไซต์ · โซน · จุดติดตั้ง อยู่ในทะเบียนแล้ว</span>
            <span className={styles.who}>เสร็จ</span>
          </li>
          {NOT_LINKED.map((item) => (
            <li key={item.key}>
              <Square size={15} aria-hidden="true" />
              <span>{item.label}</span>
              <span className={styles.who}>{item.who}</span>
            </li>
          ))}
        </ul>
      </>
    );
    footer = result.partial ? (
      <>
        <Button tone="neutral" onClick={onClose} disabled={busy}>ปิดไว้ก่อน</Button>
        {failed.length > 0 ? (
          <Button tone="primary" onClick={retryRemaining} disabled={busy}>ส่งส่วนที่เหลืออีกครั้ง</Button>
        ) : (
          <Button tone="primary" as={Link} href={`/service/sites/${result.site.id}`}>
            เปิดหน้าไซต์ {result.site.code || result.site.name}
          </Button>
        )}
      </>
    ) : (
      <>
        <Button tone="neutral" onClick={onClose}>ปิด</Button>
        <Button onClick={anotherSite}>เพิ่มไซต์ย้อนหลังอีกแห่ง</Button>
        <Button tone="primary" as={Link} href={`/service/sites/${result.site.id}`}>
          เปิดหน้าไซต์ {result.site.code || result.site.name}
        </Button>
      </>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title="เพิ่มไซต์ย้อนหลัง"
      subtitle="ไซต์ที่ติดตั้งและใช้บริการอยู่ก่อนมีระบบ · ข้อมูลเก่า"
      size="lg"
      toolbar={stepRail}
      footer={(
        <div className={styles.footer}>
          {footer}
        </div>
      )}
    >
      {draftResumed && step !== "done" && (
        <StatusNotice tone="info" className={styles.resumeNote}
          action={(
            <Button size="sm" tone="neutral" variant="quiet" onClick={() => startOver()}
              icon={<RotateCcw size={14} aria-hidden="true" />}>
              เริ่มใหม่
            </Button>
          )}>
          ร่างที่ยังไม่บันทึกยังอยู่ — ทำต่อได้เลย
        </StatusNotice>
      )}
      {body}
      {error && <p className="form-error" role="alert">{error}</p>}
      {step !== "site" && !target && duplicateActions}
    </Modal>
  );
}
