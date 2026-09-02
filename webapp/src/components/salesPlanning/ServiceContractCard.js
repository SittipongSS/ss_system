"use client";
// ── แผงงานบริการของใบสั่งขาย — **สองการ์ด** (mig 0324 + 0326) ────────────────
//
//   1. "สัญญาบริการของใบนี้" — ผูก/ถอดสัญญา (มติผู้ใช้ 2026-08-31)
//   2. "จำนวนรอบบริการที่ขายไว้" — กรอกรายบรรทัด (มติผู้ใช้ 2026-08-31 รอบสอง)
//
// ⚠️ **แยกเป็นสองการ์ด ไม่ใช่สองบล็อกในการ์ดเดียว** — คนละคำถามคนละด่าน และการ์ด
//   ที่มีปุ่มบันทึกสองปุ่มในกล่องเดียวอ่านกำกวมว่าปุ่มไหนคุมอะไร
//
// ⚠️ **ช่องจำนวนรอบไม่ได้อยู่ในตารางรายการ** ทั้งที่เป็นค่ารายบรรทัด — ตารางนั้นเป็น
//   snapshot อ่านอย่างเดียวทั้งแผง (ราคา/จำนวน/หน่วยแก้ไม่ได้) การแทรกช่องกรอกช่องเดียว
//   เข้าไปจะอ่านเป็น "บรรทัดแก้ได้" ซึ่งไม่จริง
//
// ⭐ **ขึ้นเฉพาะใบที่มีรอบบริการ** — เกณฑ์คือดีลสาย SERVICE **และ** ใบมีบรรทัดหมวด
//   `02-001` อย่างน้อยหนึ่งรายการ ⇒ ทั้งใบนับเป็นใบมีรอบบริการ (มติผู้ใช้ 2026-08-30)
//   ใบสายสินค้าไม่ต้องเห็นการ์ดนี้เลย — มันไม่มีสัญญาบริการให้ผูก
//
// ⭐ **แหล่งความจริงอยู่ที่ใบ ไม่ใช่ที่รอบขายของโซน** — SA ผูกได้ทันทีไม่ต้องรอ TS
//   จัดสรรลงโซน (ซึ่งเป็นตอนที่ `service_zone_terms` เกิด) · งานบริการอ่านสัญญา
//   ผ่านใบแม่สด ๆ ไม่มีสำเนาให้ค้าง
//
// ⚠️ ด่านมาจาก `serviceContractLinkError` ตัวเดียวกับที่ API ใช้ปฏิเสธ — ห้ามคิด
//   เงื่อนไขเองที่นี่ (กติกาเดียวกับทุกปุ่มในโมดูลนี้)
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileSignature, Repeat } from "lucide-react";
import { DetailCard } from "@/components/ui/DetailPage";
import StatusNotice from "@/components/ui/StatusNotice";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import { contractKindLabel, contractStatusLabel } from "@/lib/sales/contracts";
import { serviceContractLinkError, serviceContractOptions } from "@/lib/sales/serviceContractLink";
import { normalizeServiceRounds, serviceRoundLines, serviceRoundsEditError } from "@/lib/sales/serviceRoundsEntry";
import { fmtDate, naText } from "@/lib/format";
import styles from "./ServiceContractCard.module.css";

export default function ServiceContractCard({
  order,
  canEdit = false,
  busy = false,
  onLink,          // (contractId | null) => Promise<void>
  onSaveRounds,    // ({ [lineId]: จำนวนรอบ }) => Promise<boolean>
}) {
  const choices = order?.contractChoices || [];
  const linked = order?.serviceContract || null;
  const options = useMemo(() => serviceContractOptions(choices), [choices]);
  const [picked, setPicked] = useState("");

  const target = choices.find((c) => c.id === picked) || null;
  const gate = serviceContractLinkError(order, target, { canEdit });
  /* 🪤 **ถอดก็ต้องผ่านด่าน** — ของเดิมปุ่มถอดมีแค่ `disabled={busy}` ⇒ ใบที่ยกเลิก/ถูก
     แทนด้วย Rev. แล้วยังกดได้ แล้ว API ตอบ 409 · ด่านตัวเดียวกัน แค่ถามด้วยปลายทาง
     `null` (= ถอด) แทนสัญญาที่เลือกไว้ */
  const unlinkGate = serviceContractLinkError(order, null, { canEdit });

  /* ── จำนวนรอบบริการรายบรรทัด (mig 0326 · มติผู้ใช้ 2026-08-31 รอบสอง) ──────
     ⭐ อยู่ในการ์ดนี้ ไม่ใช่ในตารางรายการ — ตารางรายการเป็น snapshot อ่านอย่างเดียว
     ทั้งแผง (ราคา/จำนวน/หน่วยแก้ไม่ได้) การแทรกช่องกรอกช่องเดียวเข้าไปจะอ่านเป็น
     "แก้บรรทัดได้" ซึ่งไม่จริง · ที่นี่คือแผงงานบริการของใบ ซึ่งเป็นบ้านที่ถูกของมัน
     ⚠️ ค่าตั้งต้นมาจากบรรทัดของใบเสมอ และรีเซ็ตเมื่อใบถูกโหลดใหม่ ไม่งั้นจอค้าง
     ค่าที่พิมพ์ไว้แล้วบันทึกไม่ผ่าน จนคนเข้าใจว่าบันทึกไปแล้ว */
  const roundLines = useMemo(() => serviceRoundLines(order?.lines), [order?.lines]);
  const [rounds, setRounds] = useState({});
  useEffect(() => {
    setRounds(Object.fromEntries(roundLines.map((l) => [l.id, l.serviceRounds ?? ""])));
  }, [roundLines]);
  const roundsGate = serviceRoundsEditError(order, { canEdit });
  const roundsDirty = roundLines.some(
    (l) => normalizeServiceRounds(rounds[l.id]) !== (l.serviceRounds ?? null),
  );
  const saveRounds = () => onSaveRounds?.(
    Object.fromEntries(roundLines.map((l) => [l.id, normalizeServiceRounds(rounds[l.id])])),
  );

  return (
    <>
    <DetailCard icon={FileSignature} title="สัญญาบริการของใบนี้">
      {linked ? (
        <>
          {/* ⚠️ ใช้คลาสของฟอร์มที่มีอยู่จริง (`form-field` = ป้ายบน ค่าล่าง) ไม่ตั้งคลาส
              ชุดใหม่ของตัวเอง — `audit:ui` เตะคลาสที่ไม่มี selector จริงใน globals.css */}
          <div className="form-grid cols-2">
            <div className="form-field">
              <span className="form-field-label">เลขที่สัญญา</span>
              <Link href={`/sa/contracts/${linked.id}`} className="linklike mono">{linked.contractNo}</Link>
            </div>
            <div className="form-field">
              <span className="form-field-label">ชนิด</span>
              <span>{contractKindLabel(linked.kind)} · {contractStatusLabel(linked.status)}</span>
            </div>
            <div className="form-field">
              <span className="form-field-label">มีผล</span>
              <span>{naText(fmtDate(linked.effectiveDate))}</span>
            </div>
            <div className="form-field">
              <span className="form-field-label">สิ้นสุด</span>
              <span>{naText(fmtDate(linked.expiryDate))}</span>
            </div>
          </div>
          {canEdit && (
            <div className="form-actions-buttons">
              <Button
                variant="quiet"
                size="sm"
                disabled={busy || !!unlinkGate}
                title={unlinkGate || undefined}
                onClick={() => onLink?.(null)}
              >
                ถอดสัญญาออกจากใบ
              </Button>
              {/* เหตุผลต้องเป็นตัวหนังสือด้วย ไม่ใช่ tooltip อย่างเดียว — จอสัมผัสไม่มีทางเห็น */}
              {unlinkGate ? <span className={styles.gate} role="status">{unlinkGate}</span> : null}
            </div>
          )}
        </>
      ) : (
        <>
          {/* ⚠️ ลิสต์ว่าง = ดีลนี้ยังไม่มีสัญญาที่ใช้ได้ ไม่ใช่จอพัง ⇒ ต้องบอกว่าทำอะไรต่อ
              (กติกา `emptyText` ที่ตอบว่าทำไม — docs/form-design-rules §5) */}
          {options.length ? (
            <div className="form-grid cols-2">
              <label className="form-field span-2">
                <span className="form-field-label">เลือกสัญญาของดีลนี้</span>
                <Select
                  value={picked}
                  onChange={(e) => setPicked(e.target.value)}
                  disabled={busy || !canEdit}
                  options={options.map((o) => ({
                    value: o.value,
                    label: o.hint ? `${o.label} · ${o.hint}` : o.label,
                  }))}
                />
                <span className="hint">แสดงเฉพาะสัญญาที่ลงนามและผ่านการรับรองแล้ว</span>
              </label>
              <div className="form-actions-buttons span-2">
                <Button
                  tone="primary"
                  size="sm"
                  disabled={busy || !picked || !!gate}
                  title={gate || undefined}
                  onClick={() => onLink?.(picked)}
                >
                  ผูกสัญญาเข้าใบนี้
                </Button>
              </div>
            </div>
          ) : (
            <StatusNotice tone="warning" title="ยังไม่มีสัญญาที่ผูกได้">
              ดีลนี้ยังไม่มีสัญญาที่ลงนามและผ่านการรับรองแล้ว — ออกสัญญาที่เมนู “สัญญา”
              หรือใช้เอกสารภายนอกแทนสัญญาแล้วให้ AE Supervisor อนุมัติก่อน
            </StatusNotice>
          )}
        </>
      )}

      {/* ⭐ ข้อผูกพันจำนวนครั้งที่ต้องไปหน้างาน — ไม่กระทบยอดเงินและไม่อยู่บนเอกสาร
          ที่ออกไปแล้ว ⇒ แก้ได้แม้ใบอนุมัติแล้ว โดยไม่ต้องออก Rev. (มติผู้ใช้)
          ⚠️ เป็นตัวเลขอ้างอิง ไม่ได้บังคับจำนวนนัดที่ระบบสร้าง — รอบจริงเลื่อน/งดได้ */}
    </DetailCard>

    {/* ⭐ ข้อผูกพันจำนวนครั้งที่ต้องไปหน้างาน — ไม่กระทบยอดเงินและไม่อยู่บนเอกสาร
        ที่ออกไปแล้ว ⇒ แก้ได้แม้ใบอนุมัติแล้ว โดยไม่ต้องออก Rev. (มติผู้ใช้)
        ⚠️ เป็นตัวเลขอ้างอิง ไม่ได้บังคับจำนวนนัดที่ระบบสร้าง — รอบจริงเลื่อน/งดได้ */}
    {roundLines.length > 0 && (
      <DetailCard icon={Repeat} title="จำนวนรอบบริการที่ขายไว้">
        <p className={styles.roundsHint}>
          ฝ่ายบริการเห็นตัวเลขนี้ตอนรับงานและตอนวางรอบ — เป็นข้อผูกพันอ้างอิง
          ไม่ได้บังคับจำนวนนัดที่ระบบสร้างให้
        </p>

        <div className={styles.roundsList}>
          {roundLines.map((line) => (
            <div className={styles.roundsRow} key={line.id}>
              <span className={styles.roundsName}>
                {line.fgCode ? <span className={styles.roundsCode}>{line.fgCode}</span> : null}
                {/* ชื่อสินค้ายาวกว่าช่องได้เสมอ — ตัดบนจอ เก็บเต็มไว้ใน title */}
                <span className={styles.roundsDesc} title={line.description || undefined}>
                  {naText(line.description)}
                </span>
              </span>
              {/* ⚠️ คนที่แก้ไม่ได้ (ฝ่ายบริการ/บัญชี) เห็น **ตัวเลข** ไม่ใช่ช่องกรอกที่กดไม่ได้ —
                  กติกาเปลือก: ไม่มีสิทธิ์ = ไม่โชว์ตัวควบคุม · ติดด่าน = โชว์แล้วบอกเหตุ
                  (ตัวเลขเองยังต้องเห็น เพราะฝ่ายบริการใช้มันวางรอบ) */}
              {canEdit ? (
                <span className={styles.roundsField}>
                  <Input
                    type="number" min="1" step="1" inputMode="numeric" placeholder="—"
                    value={rounds[line.id] ?? ""}
                    disabled={busy || !!roundsGate}
                    title={roundsGate || undefined}
                    aria-label={`จำนวนรอบบริการของ ${line.fgCode || line.description || "รายการนี้"}`}
                    onChange={(e) => setRounds((prev) => ({ ...prev, [line.id]: e.target.value }))}
                  />
                  <span className={styles.roundsUnit}>รอบ</span>
                </span>
              ) : (
                <span className={styles.roundsField}>
                  <span className={styles.roundsValue}>{line.serviceRounds || naText(null)}</span>
                  <span className={styles.roundsUnit}>รอบ</span>
                </span>
              )}
            </div>
          ))}
        </div>

        {canEdit && (
          <div className={styles.roundsActions}>
            <Button
              tone="primary"
              size="sm"
              disabled={busy || !roundsDirty || !!roundsGate}
              title={roundsGate || (roundsDirty ? undefined : "ยังไม่มีตัวเลขที่เปลี่ยนแปลง")}
              onClick={saveRounds}
            >
              บันทึกจำนวนรอบ
            </Button>
          </div>
        )}
      </DetailCard>
    )}
    </>
  );
}
