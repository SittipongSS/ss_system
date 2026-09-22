"use client";
// ── โมดัลคีย์ใบสั่งขายย้อนหลัง 4 ขั้น (เฟส 2a · ม็อก mockups/legacy-so) ──────────────────
//
// ① ใบ → ② จุดติดตั้ง → ③ งวดและด่านเงิน → ④ ตรวจก่อนบันทึก → จอจบ
//
// ⭐ **พรีวิวจาก server ด้วยตัวตัดสินชุดเดียวกับตอนบันทึก** (บทเรียน #1685) — ทั้งสองโหมด
//    ยิงเส้นเดียวกันด้วย body ที่ประกอบจากตัวเดียว (`historicalIntakeBody`) ต่างแค่ `preview`
//    ⇒ ไม่มีทางที่พรีวิวกับผลจริงตัดสินคนละแบบ
// ⭐ **ของที่ตรวจแล้ว = ของที่บันทึก** — เก็บ body ของพรีวิวที่ผ่านไว้ แล้วส่งก้อนเดิมตอนบันทึก
//    (ลายนิ้วมือคำขอทำฝั่ง server จาก plan · ต่างแม้ช่องเดียว = 409 intake_key_conflict)
// ⭐ **รหัสการคีย์ใช้ต่อโมดัลหนึ่งรอบ** — กดบันทึกซ้ำใช้รหัสเดิมเสมอ (ได้ใบเดิมคืน) ·
//    ออกรหัสใหม่เฉพาะตอนเปิดโมดัลคีย์ใบใหม่ · **ห้ามส่ง `retry: true`** (route เขียนห้ามไว้)
//
// ⚠️ ตรรกะฝั่งจอทั้งหมดอยู่ที่ `lib/sales/historicalIntakeForm.js` (ทดสอบได้โดยไม่ต้องเรนเดอร์)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ExternalLink } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import StatusNotice from "@/components/ui/StatusNotice";
import { apiJson } from "@/lib/apiFetch";
import { cachedFetchJson } from "@/lib/apiCache";
import usePeopleDirectory from "@/lib/usePeopleDirectory";
import { assignableOwners } from "@/lib/sales/dealOwner";
import { userTeams, ROLE_LABELS } from "@/lib/permissions";
import { customerSelectOptions } from "@/components/master/customerOption";
import { productSelectOptions } from "@/components/master/productOption";
import { businessDate, businessMonthKey } from "@/lib/businessDate";
import { fmtDate, fmtMoney, naText, NA } from "@/lib/format";
import {
  HISTORICAL_INTAKE_STEPS, HISTORICAL_INTAKE_STEP_ORDER, emptyHistoricalIntake,
  firstStepWithIssues, historicalDuplicateGate, historicalExitActions, historicalIntakeBody,
  historicalIntakeLocalIssues, historicalIntakeZeroValue, historicalSaveExit,
  historicalSaveFailureState, historicalSaveLabel, issuesForStep, newHistoricalIntakeKey,
} from "@/lib/sales/historicalIntakeForm";
import HistoricalOrderDocStep, { historicalDocSummary } from "./HistoricalOrderDocStep";
import HistoricalOrderLinesStep from "./HistoricalOrderLinesStep";
import HistoricalOrderMoneyStep, { historicalMoneyFootNote } from "./HistoricalOrderMoneyStep";
import HistoricalOrderReviewStep from "./HistoricalOrderReviewStep";
import HistoricalOrderDoneStep from "./HistoricalOrderDoneStep";
import styles from "./HistoricalSalesOrderModal.module.css";

const HISTORICAL_ENDPOINT = "/api/sales-planning/sales-orders/historical";
const ORDER_PATH = (id) => `/sa/sales-orders/${id}`;

/* เลขที่ใบที่ระบบจะออกให้ — YYMM มาจาก **เดือนที่คีย์ตามเวลาไทย** ไม่ใช่วันที่ใบ (มติข้อ 5) */
const orderNumberPreview = () => `SO-${businessMonthKey()}····-0`;

export default function HistoricalSalesOrderModal({ open, onClose, onSaved }) {
  const [state, setState] = useState(() => emptyHistoricalIntake());
  const [step, setStep] = useState("doc");
  const [intakeKey, setIntakeKey] = useState(() => newHistoricalIntakeKey());
  const [plan, setPlan] = useState(null);
  const [previewPayload, setPreviewPayload] = useState(null);
  const [issues, setIssues] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [blockedNote, setBlockedNote] = useState(null);
  const [exit, setExit] = useState(null);      // ทางออกของการบันทึกที่ไม่สำเร็จ
  const [result, setResult] = useState(null);  // 201/200 ของการบันทึก
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const directory = usePeopleDirectory();
  const dirtyRef = useRef(false);
  /* สวิตช์ "ตรวจแล้ว ไม่ใช่ใบซ้ำ" อยู่เหนือตาราง "ยอดนี้ไปไหน" 10 แถว + คำเตือนปิดท้าย ⇒
     คนที่ยืนอยู่ที่ปุ่มบันทึกเลื่อนผ่านมันไปไกลแล้ว · กดปุ่มที่ติดด่านต้องพากลับไปหาเหตุ */
  const dupSwitchRef = useRef(null);

  const todayIso = businessDate();

  /* เริ่มใบใหม่ทั้งโมดัล — `defaults` ยกมาได้แค่ลูกค้า (AE ว่างเสมอ) · รหัสการคีย์ออกใหม่ที่นี่ */
  const startOver = useCallback((defaults = {}) => {
    setState(emptyHistoricalIntake(defaults));
    setStep("doc");
    setIntakeKey(newHistoricalIntakeKey());
    setPlan(null);
    setPreviewPayload(null);
    setIssues([]);
    setDuplicates([]);
    setAcknowledged(false);
    setBlockedNote(null);
    setExit(null);
    setResult(null);
    setError("");
    dirtyRef.current = false;
  }, []);

  /* ⭐ ปิดแล้วทิ้งเสมอ — ไม่มีร่าง ไม่มีบันทึกค้าง (ม็อก) ⇒ เปิดครั้งหน้าได้รหัสการคีย์ใหม่
     ซึ่งเป็นสิ่งเดียวที่ทำให้ทางออกของ 409 intake_key_conflict ("คีย์ใหม่") เป็นจริง */
  useEffect(() => { if (open) startOver(); }, [open, startOver]);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    cachedFetchJson("/api/customers")
      .then((rows) => { if (alive) setCustomers(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setCustomers([]); });
    return () => { alive = false; };
  }, [open]);

  /* FG ของนิติบุคคลของลูกค้าที่เลือก — `taxSiblings=1` รวมใบอื่นที่เลขผู้เสียภาษีเดียวกัน
     (กติกาเดียวกับหน้าออกใบเสนอราคา) */
  const customerId = state.customerId;
  useEffect(() => {
    if (!open || !customerId) { setProducts([]); return undefined; }
    let alive = true;
    cachedFetchJson(`/api/products?customerId=${encodeURIComponent(customerId)}&taxSiblings=1`)
      .then((rows) => { if (alive) setProducts(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setProducts([]); });
    return () => { alive = false; };
  }, [open, customerId]);

  const customerOptions = useMemo(() => customerSelectOptions(customers), [customers]);
  // ชื่อหมวดสินค้าต่อท้ายรหัส · แบรนด์ — มาตรฐานเดียวกับดรอปดาวน์ FG ของใบเสนอราคา (มติ 2026-09-22)
  const productOptions = useMemo(
    () => productSelectOptions(products, undefined, { withCategory: true }),
    [products],
  );

  /* ⭐ **รายชื่อ AE ไม่กรองตามทีมของผู้คีย์** — ต่างจาก `useDealOwners` ที่ใช้ทีมของคนดู
     เหตุผล: ผู้คีย์คือ AE Supervisor/แอดมิน ซึ่ง `salesPlanningEditScope` = 'all' ⇒
     `validateDealOwner` ฝั่ง server **ไม่มีด่านทีม** ให้คู่นี้ · ถ้ากรองตามทีมของผู้คีย์
     ชีตย้อนหลังที่มี AE ข้ามทีมจะคีย์ไม่ได้เลย ทั้งที่ API ยอมรับ */
  const owners = useMemo(() => assignableOwners(directory, null), [directory]);
  const ownerOptions = useMemo(() => owners.map((person) => ({
    value: person.id,
    label: `${person.name} · ${ROLE_LABELS[person.role] || person.role}`,
    search: `${person.name} ${(person.teams || []).join(" ")}`,
  })), [owners]);
  const ownerPick = useMemo(
    () => owners.find((person) => person.id === state.ownerId) || null,
    [owners, state.ownerId],
  );
  const ownerTeams = useMemo(() => userTeams(ownerPick), [ownerPick]);

  const zeroValue = historicalIntakeZeroValue(state);

  /* แก้ฟอร์มเมื่อไร แผนที่ตรวจไว้ถือว่าหมดอายุทันที — ตัวเลขที่ค้างบนจอต้องไม่ใช่ของคำขอชุดอื่น */
  const patch = useCallback((next) => {
    dirtyRef.current = true;
    setState((current) => ({ ...current, ...next }));
    setPlan(null);
    setPreviewPayload(null);
    setDuplicates([]);
    setAcknowledged(false);
    setBlockedNote(null);
  }, []);

  /**
   * พรีวิว = ด่านของทุกขั้น · คืน `true` เมื่อทั้งใบผ่าน (200 + plan)
   * 🪤 พรีวิวที่ข้อมูลยังไม่ผ่านตอบ **400 พร้อม `errors[]`** ไม่ใช่ 200 พร้อม `plan.errors`
   *    (historicalOrderCommit.js ตอบ 400 ก่อนถึงสาขาพรีวิว) ⇒ ที่นี่แปลง 400 เป็น
   *    "ผลพรีวิวปกติของฟอร์มที่ยังกรอกไม่ครบ" แล้วแมปช่องกลับไปยังขั้น
   */
  const runPreview = useCallback(async () => {
    const payload = historicalIntakeBody(state, { preview: true, intakeKey });
    setBusy(true);
    setError("");
    try {
      const data = await apiJson(HISTORICAL_ENDPOINT, {
        method: "POST", json: payload, fallbackError: "ตรวจข้อมูลก่อนบันทึกไม่สำเร็จ",
      });
      setPlan(data?.plan || null);
      /* ⭐ ของที่ตรวจแล้ว = ของที่บันทึก — เก็บ body โหมดบันทึกของ state ชุดที่เพิ่งผ่าน */
      setPreviewPayload(historicalIntakeBody(state, { preview: false, intakeKey }));
      setDuplicates(data?.plan?.duplicates || []);
      setIssues([]);
      return { ok: true, fieldErrors: null };
    } catch (err) {
      const fieldErrors = Array.isArray(err?.data?.errors) && err.data.errors.length ? err.data.errors : null;
      setPlan(null);
      setPreviewPayload(null);
      if (!fieldErrors) {
        setIssues([]);
        setError(err?.message || "ตรวจข้อมูลก่อนบันทึกไม่สำเร็จ");
      }
      return { ok: false, fieldErrors };
    } finally {
      setBusy(false);
    }
  }, [state, intakeKey]);

  /**
   * เดินไปขั้นถัดไป — สามช่องที่ API เติมค่าให้เงียบ ๆ ตรวจฝั่งจอก่อน แล้วค่อยพรีวิว
   * ⚠️ พรีวิวไม่ผ่านไม่ได้แปลว่าขั้นนี้ผิด: ตอนอยู่ขั้น ① ใบยังไม่มีจุดติดตั้งเสมอ
   *    ⇒ ตกอยู่ที่ **ขั้นแรกที่มีข้อผิดพลาด** ถ้าขั้นนั้นอยู่ก่อนหรือเท่ากับขั้นปัจจุบัน
   *    ไม่งั้นเดินต่อไปได้ตามปกติ (ข้อผิดพลาดของขั้นหลังจะถูกถามอีกทีตอนกดต่อไปที่นั่น)
   */
  const advance = useCallback(async (from, to) => {
    const local = historicalIntakeLocalIssues(state, { ownerTeams });
    if (issuesForStep(local, from).length) { setIssues(local); return; }
    const { ok, fieldErrors } = await runPreview();
    if (ok) { setIssues([]); setStep(to); return; }
    if (!fieldErrors) return;
    const first = firstStepWithIssues(fieldErrors);
    const index = (key) => HISTORICAL_INTAKE_STEP_ORDER.indexOf(key);
    if (first && index(first) <= index(from)) { setIssues(fieldErrors); setStep(first); return; }
    /* ขั้น ④ ต้องมีแผนจริงถึงจะโชว์อะไรได้ ⇒ ไม่ผ่าน = พาไปขั้นที่ช่องแรกอยู่ (ก้อนเดียวบอกทุกช่อง) */
    if (to === "review") { setIssues(fieldErrors); setStep(first || from); return; }
    setIssues([]);
    setStep(to);
  }, [state, ownerTeams, runPreview]);

  const commit = useCallback(async () => {
    if (!previewPayload) { await runPreview(); return; }
    setBusy(true);
    setError("");
    try {
      const data = await apiJson(HISTORICAL_ENDPOINT, {
        method: "POST",
        json: { ...previewPayload, intakeKey, acknowledgeDuplicates: acknowledged },
        fallbackError: "บันทึกใบสั่งขายย้อนหลังไม่สำเร็จ",
      });
      setResult(data);
      setStep("done");
      dirtyRef.current = false;
      onSaved?.(data);
    } catch (err) {
      /* ใบเกิดระหว่างพรีวิวกับบันทึก = กลับขั้น ④ พร้อมรายการชุดใหม่และสวิตช์ปิด **ไม่ใช่จอ
         "บันทึกไม่สำเร็จ"** ซึ่งเหลือปุ่มเดียวคือปิด = เสียใบทั้งใบ (ตัวตัดสินอยู่ใน lib) */
      const next = historicalSaveFailureState(historicalSaveExit(err));
      setExit(next.exit);
      setError(next.error);
      if (next.duplicates) { setDuplicates(next.duplicates); setAcknowledged(next.acknowledged); }
      setStep(next.step);
    } finally {
      setBusy(false);
    }
  }, [previewPayload, intakeKey, acknowledged, runPreview, onSaved]);

  const requestClose = useCallback(() => {
    if (busy) return;
    if (step === "done" || step === "failed" || !dirtyRef.current) { onClose?.(); return; }
    setConfirmDiscard(true);
  }, [busy, step, onClose]);

  /* ── รางขั้น ─────────────────────────────────────────────────────────── */
  const stepIndex = HISTORICAL_INTAKE_STEP_ORDER.indexOf(step);
  const stepRail = (step === "done" || step === "failed") ? null : (
    <ol className={styles.steps} aria-label="ขั้นของการคีย์ใบสั่งขายย้อนหลัง">
      {HISTORICAL_INTAKE_STEPS.map((s, index) => {
        const now = s.key === step;
        const done = index < stepIndex;
        return (
          <li key={s.key} data-active={now ? "yes" : undefined} data-done={done ? "yes" : undefined}
            aria-current={now ? "step" : undefined}>
            <span className={styles.stepNo} aria-hidden="true">{done ? <Check size={12} /> : index + 1}</span>
            {s.label}
          </li>
        );
      })}
    </ol>
  );

  const customerLabel = customerOptions.find((option) => option.value === state.customerId)?.label || null;
  const contextStrip = (extra) => (
    <div className={styles.context}>
      <Check size={14} aria-hidden="true" className={styles.contextMark} />
      <span className={styles.contextText}>{extra}</span>
      {step === "lines" && (
        <Button size="sm" tone="neutral" variant="quiet" disabled={busy} onClick={() => setStep("doc")}>
          แก้ข้อมูลใบ
        </Button>
      )}
    </div>
  );

  /* ── เนื้อหาและแถบท้ายของแต่ละขั้น ────────────────────────────────────── */
  let body = null;
  let footer = null;

  if (step === "doc") {
    body = (
      <HistoricalOrderDocStep
        state={state}
        onChange={patch}
        customerOptions={customerOptions}
        ownerOptions={ownerOptions}
        ownerTeams={ownerTeams}
        issues={issuesForStep(issues, "doc")}
        plan={plan}
        orderNumberPreview={orderNumberPreview()}
        todayIso={todayIso}
        busy={busy}
      />
    );
    const here = issuesForStep(issues, "doc");
    /* 🪤 `issues` ว่าง = "ยังไม่มีใครตรวจ" ไม่ใช่ "ไม่ขาดอะไร" — ฟอร์มเปล่าที่เพิ่งเปิดเคยอ่านว่า
       "ครบแล้ว" · ตัวที่บอกว่าพรีวิวเคยผ่านคือ `plan` (patch() ทิ้งมันทุกครั้งที่แก้ฟอร์ม) */
    footer = (
      <>
        <span className={styles.footNote} data-ok={!here.length && plan ? "yes" : undefined}>
          {here.length ? `ยังขาด ${here.length} ข้อ` : (plan ? "ครบแล้ว" : "ยังไม่ตรวจ")}
        </span>
        <Button tone="neutral" variant="quiet" disabled={busy} onClick={requestClose}>ยกเลิก</Button>
        <Button tone="primary" disabled={busy} onClick={() => advance("doc", "lines")}
          icon={<ArrowRight size={15} aria-hidden="true" />}>
          {busy ? "กำลังตรวจ…" : "ต่อไป: จุดติดตั้ง"}
        </Button>
      </>
    );
  }

  if (step === "lines") {
    body = (
      <>
        {contextStrip(historicalDocSummary(state, {
          customerLabel,
          ownerLabel: ownerPick?.name || null,
        }))}
        <HistoricalOrderLinesStep
          state={state}
          onChange={patch}
          productOptions={productOptions}
          issues={issuesForStep(issues, "lines")}
          plan={plan}
          busy={busy}
        />
      </>
    );
    footer = (
      <>
        <span className={styles.footNote}>
          {`${(state.lines || []).length} จุดติดตั้ง · ก่อน VAT ${plan ? fmtMoney(plan.header.subtotal) : NA}`}
          {` · VAT ${plan ? fmtMoney(plan.header.vatAmount) : NA} · รวม ${plan ? fmtMoney(plan.header.totalAmount) : NA}`}
        </span>
        <Button tone="neutral" disabled={busy} onClick={() => setStep("doc")}
          icon={<ArrowLeft size={15} aria-hidden="true" />}>ย้อนกลับ</Button>
        <Button tone="primary" disabled={busy} onClick={() => advance("lines", "money")}
          icon={<ArrowRight size={15} aria-hidden="true" />}>
          {busy ? "กำลังตรวจ…" : "ต่อไป: งวดและด่านเงิน"}
        </Button>
      </>
    );
  }

  if (step === "money") {
    const note = historicalMoneyFootNote(state, { zeroValue });
    body = (
      <>
        {contextStrip([
          customerLabel,
          /* รูปวันที่เดียวกับขั้น ② และ ④ — ค่าดิบของ DateInput เป็น ISO ซึ่งไม่ใช่รูปที่ใครอ่านที่นี่ */
          state.orderDate ? fmtDate(state.orderDate) : null,
          `${(state.lines || []).length} จุดติดตั้ง`,
          plan ? `รวม ${fmtMoney(plan.header.totalAmount)}` : null,
        ].filter(Boolean).join(" · "))}
        <HistoricalOrderMoneyStep
          state={state}
          onChange={patch}
          issues={issuesForStep(issues, "money")}
          plan={plan}
          zeroValue={zeroValue}
          busy={busy}
        />
      </>
    );
    footer = (
      <>
        <span className={styles.footNote} data-ok={note.tone === "ok" ? "yes" : undefined}>{note.text}</span>
        <Button tone="neutral" disabled={busy} onClick={() => setStep("lines")}
          icon={<ArrowLeft size={15} aria-hidden="true" />}>ย้อนกลับ</Button>
        <Button tone="primary" disabled={busy} onClick={() => advance("money", "review")}
          icon={<ArrowRight size={15} aria-hidden="true" />}>
          {busy ? "กำลังตรวจ…" : "ตรวจก่อนบันทึก"}
        </Button>
      </>
    );
  }

  if (step === "review") {
    const gate = historicalDuplicateGate({ duplicates, acknowledged, warnings: plan?.warnings });
    body = plan ? (
      <HistoricalOrderReviewStep
        plan={plan}
        orderNumberPreview={orderNumberPreview()}
        acknowledged={acknowledged}
        onAcknowledge={(next) => { setAcknowledged(next); setBlockedNote(null); }}
        duplicates={duplicates}
        blockedNote={blockedNote}
        switchRef={dupSwitchRef}
        busy={busy}
      />
    ) : (
      <StatusNotice tone="warning" title="ข้อมูลเปลี่ยนหลังตรวจ — ตรวจใหม่ก่อนบันทึก">
        กด “ตรวจอีกครั้ง” เพื่อให้ของที่ตรวจตรงกับของที่จะบันทึก
      </StatusNotice>
    );
    footer = (
      <>
        <span className={styles.footNote} data-blocked={gate.gated ? "yes" : undefined}>{gate.footNote}</span>
        <Button tone="neutral" disabled={busy} onClick={() => setStep("money")}
          icon={<ArrowLeft size={15} aria-hidden="true" />}>ย้อนกลับ</Button>
        {plan ? (
          /* ⭐ ปุ่มติดด่าน = **โชว์แล้วบอกเหตุตอนกด** ไม่ใช่ซ่อนหรือจางเฉย ๆ (กฎบ้าน) */
          <Button
            tone="primary"
            disabled={busy}
            aria-disabled={gate.gated ? "true" : undefined}
            title={gate.buttonTitle || undefined}
            onClick={() => {
              if (gate.gated) {
                /* เหตุผลของด่านอยู่ข้างสวิตช์ซึ่งเลื่อนพ้นจอไปแล้ว — ไม่พาไปหา = ปุ่มอ่านเหมือนปุ่มตาย */
                setBlockedNote(gate.blockedNote);
                dupSwitchRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
                dupSwitchRef.current?.focus();
                return;
              }
              commit();
            }}
          >
            {busy ? "กำลังบันทึก…" : historicalSaveLabel(plan)}
          </Button>
        ) : (
          /* 🪤 พรีวิวรอบนี้อาจตอบ 400 พร้อม `errors[]` ซึ่ง `runPreview` ตั้งใจไม่โชว์เอง
             (มันเป็นหน้าที่ของ `advance`) ⇒ ต้องรับผลมาพาไปขั้นที่ช่องแรกอยู่ ไม่งั้นกดแล้วเงียบ */
          <Button tone="primary" disabled={busy} onClick={async () => {
            const { ok, fieldErrors } = await runPreview();
            if (!ok && fieldErrors) { setIssues(fieldErrors); setStep(firstStepWithIssues(fieldErrors) || "doc"); }
          }}>
            {busy ? "กำลังตรวจ…" : "ตรวจอีกครั้ง"}
          </Button>
        )}
      </>
    );
  }

  if (step === "failed" && exit) {
    body = (
      <>
        <StatusNotice tone="error" title="บันทึกไม่สำเร็จ">{exit.message}</StatusNotice>
        {exit.hint ? <p className={styles.hint}>{exit.hint}</p> : null}
        {exit.errors?.length ? (
          <ul className={styles.warnList}>
            {exit.errors.map((issue) => <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>)}
          </ul>
        ) : null}
      </>
    );
    /* ⭐ ปุ่มของจอนี้มาจากตัวตัดสิน ไม่ใช่เงื่อนไขในวงเล็บของ JSX สี่ก้อน — ถอดทีละอันแล้ว
       ชุดเทสต์ยังเขียวมาก่อน ทั้งที่ "เปิดใบที่สร้างไว้" เป็นที่เดียวบนจอที่มี id ของใบนั้น */
    footer = historicalExitActions(exit).map((action) => {
      if (action.key === "close") {
        return (
          <Button key="close" tone="neutral" variant="quiet" disabled={busy} onClick={onClose}>
            {action.label}
          </Button>
        );
      }
      if (action.key === "edit") {
        return (
          <Button key="edit" tone="neutral" disabled={busy} onClick={() => {
            setIssues(action.errors);
            /* ไม่มี error รายช่อง = ข้อความของ server คือเหตุผลเดียวที่มี — ต้องพกไปที่ขั้นปลายทาง
               ไม่งั้นผู้คีย์ไปโผล่ที่ขั้น ① โดยไม่มีอะไรบนจอบอกว่าทำไมถึงกลับมา */
            setError(action.carryMessage || "");
            setExit(null);
            setStep(action.goToStep);
          }}>
            {action.label}
          </Button>
        );
      }
      if (action.key === "open") {
        return (
          <Button key="open" tone="neutral" as={Link} href={ORDER_PATH(action.orderId)}
            icon={<ExternalLink size={15} aria-hidden="true" />}>
            {action.label}
          </Button>
        );
      }
      /* รหัสเดิม + ข้อมูลเดิม — ถ้าใบลงฐานไปแล้วจะได้ใบเดิมคืน (replayed) */
      return (
        <Button key="retry" tone="primary" disabled={busy}
          onClick={() => { setExit(null); setStep("review"); commit(); }}>
          {action.label}
        </Button>
      );
    });
  }

  if (step === "done" && result) {
    body = <HistoricalOrderDoneStep result={result} />;
    footer = (
      <>
        <Button tone="neutral" variant="quiet" onClick={onClose}>ปิด</Button>
        {/* ⭐ ตั้งต้นให้แค่ลูกค้า — AE ว่างเสมอ (ลูกค้ารายเดียวมี AE ได้สองคน = คนละดีล) */}
        <Button tone="neutral" onClick={() => startOver({ customerId: result.order?.customerId || "" })}>
          คีย์ใบถัดไปของลูกค้านี้
        </Button>
        <Button tone="neutral" as={Link} href={ORDER_PATH(result.order?.id)}>
          เปิดใบ {naText(result.order?.orderNumber)}
        </Button>
      </>
    );
  }

  return (
    <>
      <Modal
        open={open}
        onClose={requestClose}
        dismissible={!busy}
        title="เพิ่มใบสั่งขายย้อนหลัง"
        subtitle={step === "doc"
          ? "งานบริการที่ขายนอกระบบ · ไม่นับ Actual / FC / เป้า (ยังอาจมีงวดที่ต้องเก็บอยู่)"
          : undefined}
        size="lg"
        toolbar={stepRail}
        footer={<div className={styles.footer}>{footer}</div>}
      >
        {body}
        {error && step !== "failed" ? <p className="form-error" role="alert">{error}</p> : null}
      </Modal>
      <ConfirmDialog
        open={confirmDiscard}
        title="ทิ้งข้อมูลที่คีย์ไว้?"
        message="ปิดแล้วข้อมูลในโมดัลหายทั้งหมด — ไม่มีร่าง ไม่มีบันทึกค้าง"
        detail="เปิดใหม่จะได้รหัสการคีย์ชุดใหม่ ต้องคีย์ตั้งแต่ต้น"
        confirmLabel="ทิ้งข้อมูล"
        cancelLabel="กลับไปคีย์ต่อ"
        danger
        onConfirm={() => { setConfirmDiscard(false); onClose?.(); }}
        onClose={() => setConfirmDiscard(false)}
      />
    </>
  );
}
