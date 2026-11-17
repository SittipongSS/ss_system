"use client";
// ── การ์ด "ใบสั่งขายที่ซื้อเพิ่ม" ของคำร้องพัฒนากลิ่น (ม-164 · PR-2 · docs/scent-dev-topup-plan.md §2) ──
//
// ⭐ **การ์ดนี้ถือเฉพาะ SO แนบ** — SO หลักอยู่การ์ดบริบท "ใบสั่งขาย" แถวบนอยู่แล้ว (ของเดียวกันสองที่ = ต้องคอยดูแลให้ตรงกัน)
// ⭐ **ด่านตัวเดียวกับ server** (`lib/requests/scentOrderAttach.js`) · ตัวเลขก่อน/หลังจาก `attachPreviewFromAdds`
// ⭐ **ปุ่มกดไม่ได้ = โชว์เสมอ บอกเหตุตอนกด** (ใบปิด/ยกเลิก) · **ไม่มีสิทธิ์ = ไม่โชว์** (RD · ผู้สังเกตการณ์)
// ⚠️ **บอกผลก่อนกด** (กติกา #1223) — โมดัลแนบโชว์ "จำนวนกลิ่น 2 เป็น 3" · ถอดโชว์ตัวเลขหลังถอดก่อนยืนยัน
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FilePlus2, Receipt } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import Tag from "@/components/ui/Tag";
import StatusNotice from "@/components/ui/StatusNotice";
import { DetailCard } from "@/components/ui/DetailPage";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { apiJson } from "@/lib/apiFetch";
import { fmtDate } from "@/lib/format";
import {
  attachPreviewFromAdds, attachPreviewText, attachRequestError, scentOrderLinesText, slotsAfterDetach,
} from "@/lib/requests/scentOrderAttach";
import { scentSlotNote } from "@/lib/requests/scentOrderLinks";
import styles from "./scentOrders.module.css";

/* ส่วนที่ใบนี้จะเพิ่ม — "+1 กลิ่น · +1 รอบแก้" (บอกบนไทล์ก่อนเลือก) */
const addsText = (adds) => [
  adds?.slots ? `+${adds.slots} กลิ่น` : null,
  adds?.revisions ? `+${adds.revisions} รอบแก้` : null,
].filter(Boolean).join(" · ");

/* ค้นได้ทุกอย่างที่ตาเห็นบนไทล์ (กติกา "ตาเห็นบนแถว = ต้องค้นเจอ") */
const haystackOf = (c) => [c.orderNumber, c.linesText, c.customerName, fmtDate(c.orderDate), addsText(c.adds), c.dismissed?.reason]
  .filter(Boolean).join(" ").toLowerCase();

function AttachModal({ open, request, saving, onClose, onSubmit }) {
  const [state, setState] = useState({ loading: false, error: "", data: null });
  const [pick, setPick] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setPick("");
    setQuery("");
    setState({ loading: true, error: "", data: null });
    apiJson(`/api/sa/requests/${request.id}/sales-orders`, { fallbackError: "โหลดใบสั่งขายไม่สำเร็จ" })
      .then((data) => { if (live) setState({ loading: false, error: "", data }); })
      .catch((e) => { if (live) setState({ loading: false, error: e.message, data: null }); });
    return () => { live = false; };
  }, [open, request.id]);

  const candidates = useMemo(() => state.data?.candidates || [], [state.data]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? candidates.filter((c) => haystackOf(c).includes(q)) : candidates;
  }, [candidates, query]);
  const chosen = candidates.find((c) => c.id === pick) || null;
  const preview = chosen ? attachPreviewFromAdds(request.scentSlots, chosen.adds) : null;
  const hiddenOwned = state.data?.hidden?.owned || 0;

  if (!open) return null;
  return (
    <Modal open dismissible={!saving} onClose={onClose} size="md" title="แนบใบสั่งขายที่ลูกค้าซื้อเพิ่ม">
      <p className={styles.hint}>
        ใช้เมื่อ<strong>ไม่ต้องมีบรีฟใหม่</strong> — แก้กลิ่นที่ส่งไปแล้ว หรือเก็บ direction ที่เคยเสนอในใบนี้
        · ถ้าต้องมีบรีฟใหม่ ให้เปิดคำร้องใหม่จากใบสั่งขายนั้นแทน
      </p>
      {state.loading ? <p className={styles.hint}>กำลังโหลดใบสั่งขายของลูกค้านี้…</p> : null}
      {state.error ? <StatusNotice tone="danger">{state.error}</StatusNotice> : null}
      {state.data && !candidates.length ? (
        <StatusNotice tone="neutral">
          ไม่มีใบสั่งขายของลูกค้านี้ที่แนบได้ — ต้องอนุมัติแล้ว มีบรรทัดออกแบบหรือแก้กลิ่น และยังไม่มีคำร้องรับ
          {hiddenOwned ? ` (มีคำร้องรับไปแล้ว ${hiddenOwned} ใบ)` : ""}
        </StatusNotice>
      ) : null}
      {candidates.length ? (
        <div className="form-group">
          {candidates.length > 4 ? (
            <Input
              type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off"
              placeholder="ค้นเลขที่ใบสั่งขาย · หมวด · วันที่" aria-label="ค้นใบสั่งขาย"
            />
          ) : null}
          <OptionTiles
            value={pick}
            onChange={setPick}
            disabled={saving}
            ariaLabel="ใบสั่งขายที่จะแนบ"
            options={shown.map((c) => ({
              value: c.id,
              label: `${c.orderNumber} · ${c.linesText}`,
              description: [
                c.orderDate ? `วันที่ ${fmtDate(c.orderDate)}` : null,
                addsText(c.adds),
                c.dismissed ? `เคยปัดออกจากคิว: ${c.dismissed.reason}` : null,
              ].filter(Boolean).join(" · "),
            }))}
          />
          {hiddenOwned ? <small className={styles.hint}>ซ่อนไว้ {hiddenOwned} ใบที่มีคำร้องรับไปแล้ว</small> : null}
        </div>
      ) : null}
      <p className={styles.hint}>
        {chosen
          ? `กดแนบแล้ว ${attachPreviewText(preview) || "ตัวเลขของใบไม่เปลี่ยน"} — RD ที่ถือใบนี้ได้แจ้งเตือนในเธรด`
            + (chosen.dismissed ? " · การปัดออกจากคิวของใบนี้จะถูกล้าง" : "")
          : "เลือกใบสั่งขายก่อน แล้วปุ่มแนบจะกดได้"}
      </p>
      <div className="action-bar">
        <Button variant="quiet" disabled={saving} onClick={onClose}>ยกเลิก</Button>
        <Button tone="primary" disabled={saving || !chosen} onClick={() => onSubmit(chosen.id)}>
          แนบใบสั่งขาย
        </Button>
      </div>
    </Modal>
  );
}

export default function ScentOrdersCard({
  request,
  // ฝั่งผู้ขอของใบ (`_mine` ของ server = canManageRequest) — RD/ผู้สังเกตการณ์ไม่เห็นปุ่ม
  canAct = false,
  saving = false,
  onToast,
  // (salesOrderId) => Promise<boolean>
  onAttach,
  onDetach,
}) {
  const [open, setOpen] = useState(false);
  const attached = request?.attachedOrders || [];
  if (!request || (!attached.length && !canAct)) return null;

  const blocked = attachRequestError(request);
  const note = scentSlotNote(request.scentSlots);

  const startAttach = () => {
    // ⭐ ติดด่าน = โชว์ปุ่มแล้วบอกเหตุตอนกด (กติกา UI ของระบบ)
    if (blocked) { onToast?.({ kind: "error", msg: blocked }); return; }
    setOpen(true);
  };
  const submitAttach = async (salesOrderId) => {
    const ok = await onAttach?.(salesOrderId);
    if (ok) setOpen(false);
  };
  const askDetach = async (row) => {
    const after = slotsAfterDetach(request, row.salesOrderId);
    const before = request.scentSlots?.slots ?? after;
    const yes = await confirmAction({
      title: `ถอด ${row.orderNumber || row.salesOrderId} ออกจากคำร้องนี้?`,
      description: (before !== after ? `จำนวนกลิ่นของใบนี้จะเหลือ ${after} (จาก ${before})` : "จำนวนกลิ่นของใบนี้ไม่เปลี่ยน")
        + " · ใบสั่งขายกลับไปเป็น \"ยังไม่มีคำร้อง\" แนบใหม่หรือเปิดคำร้องใหม่ได้",
      confirmLabel: "ถอดใบสั่งขาย",
      tone: "danger",
    });
    if (yes) await onDetach?.(row.salesOrderId);
  };

  return (
    <DetailCard
      icon={Receipt}
      eyebrow="ใบสั่งขาย"
      title="ใบสั่งขายที่ซื้อเพิ่ม"
      meta={note || "ใบที่ลูกค้าจ่ายเพิ่มแล้วไม่ต้องมีบรีฟใหม่ แนบเข้าใบนี้ได้"}
      actions={canAct ? (
        <Button variant="outline" icon={<FilePlus2 size={16} aria-hidden="true" />} disabled={saving} onClick={startAttach}>
          แนบใบสั่งขายที่ซื้อเพิ่ม
        </Button>
      ) : null}
    >
      {attached.length ? (
        <ul className={styles.list}>
          {attached.map((row) => (
            <li key={row.linkId || row.salesOrderId} className={styles.row}>
              <div className={styles.main}>
                <Link href={`/sa/sales-orders/${row.salesOrderId}`} className={styles.code}>
                  {row.orderNumber || row.salesOrderId}
                </Link>
                <Tag tone="info" label="แนบ" />
                {row.countedOrderId && row.countedOrderId !== row.salesOrderId ? (
                  <Tag tone="neutral" label={`นับจาก ${row.countedOrderNumber || row.countedOrderId}`} />
                ) : null}
              </div>
              <div className={styles.sub}>
                {[scentOrderLinesText(row.lines), row.createdAt ? `แนบ ${fmtDate(row.createdAt)}` : null,
                  row.createdByName ? `โดย ${row.createdByName}` : null].filter(Boolean).join(" · ")}
              </div>
              {canAct ? (
                <Button variant="quiet" tone="danger" size="sm" disabled={saving} onClick={() => askDetach(row)}>
                  ถอด
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.hint}>ยังไม่มีใบสั่งขายที่ซื้อเพิ่มแนบเข้าใบนี้</p>
      )}
      <AttachModal
        open={open}
        request={request}
        saving={saving}
        onClose={() => setOpen(false)}
        onSubmit={submitAttach}
      />
    </DetailCard>
  );
}
