"use client";
// ── การ์ด "สัญญาบริการของใบนี้" (mig 0324 · มติผู้ใช้ 2026-08-31) ────────────
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
import { useMemo, useState } from "react";
import Link from "next/link";
import { FileSignature } from "lucide-react";
import { DetailCard } from "@/components/ui/DetailPage";
import StatusNotice from "@/components/ui/StatusNotice";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { contractKindLabel, contractStatusLabel } from "@/lib/sales/contracts";
import { serviceContractLinkError, serviceContractOptions } from "@/lib/sales/serviceContractLink";
import { fmtDate, naText } from "@/lib/format";

export default function ServiceContractCard({
  order,
  canEdit = false,
  busy = false,
  onLink,          // (contractId | null) => Promise<void>
}) {
  const choices = order?.contractChoices || [];
  const linked = order?.serviceContract || null;
  const options = useMemo(() => serviceContractOptions(choices), [choices]);
  const [picked, setPicked] = useState("");

  const target = choices.find((c) => c.id === picked) || null;
  const gate = serviceContractLinkError(order, target, { canEdit });

  return (
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
              <Button variant="quiet" size="sm" disabled={busy} onClick={() => onLink?.(null)}>
                ถอดสัญญาออกจากใบ
              </Button>
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
                  variant="accent"
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
    </DetailCard>
  );
}
