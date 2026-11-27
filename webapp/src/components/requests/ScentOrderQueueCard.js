"use client";
// ── การ์ด "SO ออกแบบกลิ่นรอเปิดคำร้อง" บนหน้า /requests (ม-164 PR-5 · มติเจ้าของ 13/11 ข้อ 5–6) ──────────────
//
// ⭐ สามทางออกของแต่ละใบ — **เปิดคำร้องใหม่** (ตั้งต้น "ต่อจากคำร้อง" เป็นใบล่าสุดของลูกค้า) · **แนบเข้าคำร้องเดิม**
//   (ไม่ต้องมีบรีฟใหม่ + ใบเดิมยังไม่ปิด · เส้นเดียวกับ PR-2) · **ไม่ต้องมีคำร้อง** (เหตุผลบังคับ · คืนเข้าคิวได้)
// ⭐ เจ้าของดีลเห็นใบของตัวเอง · หัวหน้าฝ่ายขายสลับ "ของฉัน / ทั้งหมด" ได้ (ด่านที่ server)
// ⭐ **บอกผลก่อนกด** (#1223) — โมดัลแนบบอกว่าใบที่เลือกจะได้ +กลิ่น/+รอบแก้ · ปัดออกบอกว่าคืนเข้าคิวได้
// ⚠️ ไม่มีอะไรค้างและเห็นภาพรวมไม่ได้ = การ์ดไม่ขึ้น (คนส่วนใหญ่ไม่มีใบค้าง — การ์ดว่างทุกวันคือเสียงรบกวน)
// ⚠️ ไม่มีป้ายตัวเลขบนเมนู — คิวต้องอ่าน SO อนุมัติทั้งทะเบียน แพงเกินสำหรับ `/api/nav/counts` ที่ยิงทุก 2 นาที
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Receipt } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import ChoiceChips from "@/components/ui/ChoiceChips";
import OptionTiles from "@/components/ui/OptionTiles";
import ReasonDialog from "@/components/ui/ReasonDialog";
import StatusNotice from "@/components/ui/StatusNotice";
import Tag from "@/components/ui/Tag";
import { DetailCard } from "@/components/ui/DetailPage";
import { apiJson } from "@/lib/apiFetch";
import { notifyToast } from "@/lib/feedback";
import { fmtDate } from "@/lib/format";
import { REQUEST_STATUS_LABELS } from "@/lib/requests/statuses";
import { scentOrderNewRequestHref } from "@/lib/requests/scentOrderQueue";
import useStickyState from "@/lib/ui/useStickyState";
import styles from "./scentOrders.module.css";

const addsText = (adds) => [
  adds?.slots ? `+${adds.slots} กลิ่น` : null,
  adds?.revisions ? `+${adds.revisions} รอบแก้` : null,
].filter(Boolean).join(" · ");

function AttachTargetModal({ row, onClose, onDone, onToast }) {
  const [state, setState] = useState({ loading: true, error: "", rows: [] });
  const [pick, setPick] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return undefined;
    let live = true;
    setPick("");
    setState({ loading: true, error: "", rows: [] });
    const q = new URLSearchParams({ customerId: row.customerId || "" });
    apiJson(`/api/sa/requests/continue-candidates?${q}`, { fallbackError: "โหลดคำร้องของลูกค้าไม่สำเร็จ" })
      // แนบได้เฉพาะใบที่ยังไม่ปิด (ใบปิดแล้วต้องเปิดใบใหม่ "ต่อจากคำร้อง")
      .then((d) => { if (live) setState({ loading: false, error: "", rows: (d?.candidates || []).filter((r) => r.status !== "closed") }); })
      .catch((e) => { if (live) setState({ loading: false, error: e.message, rows: [] }); });
    return () => { live = false; };
  }, [row]);

  if (!row) return null;
  const chosen = state.rows.find((r) => r.id === pick) || null;
  const submit = async () => {
    setSaving(true);
    try {
      await apiJson(`/api/sa/requests/${chosen.id}/sales-orders`, {
        method: "POST", json: { salesOrderId: row.id }, fallbackError: "แนบใบสั่งขายไม่สำเร็จ",
      });
      onToast?.({ kind: "success", msg: `แนบ ${row.orderNumber} เข้า ${chosen.docNo || chosen.id} แล้ว` });
      onDone?.();
    } catch (e) {
      onToast?.({ kind: "error", msg: e.message });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open dismissible={!saving} onClose={onClose} size="md" title={`แนบ ${row.orderNumber} เข้าคำร้องเดิม`}>
      <div className={styles.stack}>
        <p className={styles.hint}>
          ใช้เมื่อ<strong>ไม่ต้องมีบรีฟใหม่</strong> — แก้กลิ่นที่ส่งไปแล้ว หรือเก็บ direction ที่เคยเสนอในใบเดิม
          · ใบที่ปิดแล้วแนบไม่ได้ (เปิดคำร้องใหม่ &quot;ต่อจากคำร้อง&quot; แทน)
        </p>
        {state.loading ? <p className={styles.hint}>กำลังโหลดคำร้องของลูกค้านี้…</p> : null}
        {state.error ? <StatusNotice tone="danger">{state.error}</StatusNotice> : null}
        {!state.loading && !state.error && !state.rows.length ? (
          <StatusNotice tone="neutral">
            ลูกค้านี้ไม่มีคำร้องพัฒนากลิ่นที่ยังไม่ปิด (ที่คุณเปิดได้) — เปิดคำร้องใหม่แทน
          </StatusNotice>
        ) : null}
        {state.rows.length ? (
          <OptionTiles
            value={pick}
            onChange={setPick}
            disabled={saving}
            ariaLabel="คำร้องที่จะแนบเข้า"
            options={state.rows.map((r) => ({
              value: r.id,
              label: [r.docNo || r.id, r.title].filter(Boolean).join(" · "),
              description: [REQUEST_STATUS_LABELS[r.status] || r.status, r.createdAt ? `เปิด ${fmtDate(r.createdAt)}` : null]
                .filter(Boolean).join(" · "),
            }))}
          />
        ) : null}
        {/* บอกผลก่อนกด (#1223) · ไม่มีใบให้เลือก = ไม่ต้องชวนเลือก (กล่องข้างบนบอกทางออกแล้ว) */}
        {state.rows.length ? (
          <p className={styles.hint}>
            {chosen
              ? `กดแนบแล้ว ${chosen.docNo || "คำร้องที่เลือก"} ได้ ${addsText(row.adds) || "ใบสั่งขายนี้"} — RD ที่ถือใบได้แจ้งเตือนในเธรด และใบนี้ออกจากคิว`
              : "เลือกคำร้องก่อน แล้วปุ่มแนบจะกดได้"}
          </p>
        ) : null}
      </div>
      <div className="action-bar">
        <Button variant="quiet" disabled={saving} onClick={onClose}>ยกเลิก</Button>
        <Button tone="primary" disabled={saving || !chosen} onClick={submit}>แนบใบสั่งขาย</Button>
      </div>
    </Modal>
  );
}

// ผู้เรียกไม่ส่งตัวโชว์ toast มา = ใช้ toast กลางของแอป (หน้า /requests ไม่มี toast ของตัวเอง)
const appToast = ({ kind, msg }) => notifyToast(msg, { kind });

export default function ScentOrderQueueCard({ onToast = appToast }) {
  /* ขอบเขต/กองจำไว้ (useStickyState · คำขอเจ้าของ 27/11) — กดเลข SO เข้าใบแล้วกลับมาต้องได้กองเดิม
     · คีย์มีคำนำหน้า เพราะการ์ดอยู่ใต้ pathname ของหน้าคิวคำร้อง */
  const [scope, setScope] = useStickyState("scentQueue.scope", "mine");
  const [view, setView] = useStickyState("scentQueue.view", "pending");
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [attachRow, setAttachRow] = useState(null);
  const [dismiss, setDismiss] = useState(null); // { row, reason, error }
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    apiJson(`/api/sa/scent-orders/queue?scope=${scope}`, { fallbackError: "โหลดคิว SO รอเปิดคำร้องไม่สำเร็จ" })
      .then((data) => { if (live) setState({ loading: false, error: "", data }); })
      .catch((e) => { if (live) setState({ loading: false, error: e.message, data: null }); });
    return () => { live = false; };
  }, [scope]);
  useEffect(() => load(), [load]);

  const data = state.data;
  const pending = data?.pending || [];
  const dismissed = data?.dismissed || [];
  if (state.loading && !data) return null;
  if (!state.error && !data?.canSeeAll && !pending.length && !dismissed.length) return null;

  const submitDismiss = async () => {
    setBusy(true);
    try {
      await apiJson(`/api/sa/scent-orders/${encodeURIComponent(dismiss.row.id)}/dismissal`, {
        method: "POST", json: { reason: dismiss.reason }, fallbackError: "ปัดออกไม่สำเร็จ",
      });
      onToast({ kind: "success", msg: `ปัด ${dismiss.row.orderNumber} ออกจากคิวแล้ว — คืนเข้าคิวได้ที่แท็บ "ปัดออกแล้ว"` });
      setDismiss(null);
      load();
    } catch (e) {
      setDismiss((d) => ({ ...d, error: e.message }));
    } finally {
      setBusy(false);
    }
  };
  const undismiss = async (row) => {
    setBusy(true);
    try {
      await apiJson(`/api/sa/scent-orders/${encodeURIComponent(row.id)}/dismissal`, {
        method: "DELETE", fallbackError: "คืนเข้าคิวไม่สำเร็จ",
      });
      onToast({ kind: "success", msg: `คืน ${row.orderNumber} เข้าคิวแล้ว` });
      load();
    } catch (e) {
      onToast({ kind: "error", msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  const rows = view === "pending" ? pending : dismissed;
  return (
    <DetailCard
      icon={Receipt}
      eyebrow="ใบสั่งขาย"
      title="SO ออกแบบกลิ่นรอเปิดคำร้อง"
      meta={`ค้าง ${pending.length} ใบ · ทุกใบสั่งขายออกแบบ/แก้กลิ่นต้องมีคำร้องรับ — เปิดใหม่ แนบเข้าใบเดิม หรือปัดออกพร้อมเหตุผล`}
      actions={(
        <>
          {data?.canSeeAll ? (
            <ChoiceChips
              value={scope} onChange={setScope} ariaLabel="ขอบเขตคิว"
              options={[{ value: "mine", label: "ของฉัน" }, { value: "all", label: "ทั้งหมด" }]}
            />
          ) : null}
          <ChoiceChips
            value={view} onChange={setView} ariaLabel="กองของคิว"
            options={[{ value: "pending", label: `รอเปิดคำร้อง ${pending.length}` }, { value: "dismissed", label: `ปัดออกแล้ว ${dismissed.length}` }]}
          />
        </>
      )}
    >
      {state.error ? <StatusNotice tone="danger">{state.error}</StatusNotice> : null}
      {!rows.length ? (
        <p className={styles.hint}>{view === "pending" ? "ไม่มีใบสั่งขายรอเปิดคำร้องในขอบเขตนี้" : "ยังไม่มีใบที่ปัดออก"}</p>
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.id} className={styles.row}>
              <div className={styles.main}>
                <Link href={`/sa/sales-orders/${row.id}`} className={styles.code}>{row.orderNumber}</Link>
                {row.waitingDays != null ? (
                  <Tag tone={row.waitingDays > 30 ? "warning" : "neutral"} label={`ค้าง ${row.waitingDays} วัน`} />
                ) : null}
              </div>
              <div className={styles.sub}>
                {[row.customerName, row.linesText, row.dealOwnerName ? `เจ้าของดีล ${row.dealOwnerName}` : null]
                  .filter(Boolean).join(" · ")}
                {row.dismissal ? (
                  <> — ปัดออก: {row.dismissal.reason}{row.dismissal.dismissedByName ? ` (${row.dismissal.dismissedByName}` : ""}
                    {row.dismissal.dismissedAt ? ` · ${fmtDate(row.dismissal.dismissedAt)}` : ""}{row.dismissal.dismissedByName ? ")" : ""}</>
                ) : null}
              </div>
              <div className={styles.actions}>
                {view === "pending" ? (
                  <>
                    <Button as={Link} href={scentOrderNewRequestHref(row)} prefetch={false} size="sm" tone="primary">
                      เปิดคำร้องใหม่
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setAttachRow(row)}>
                      แนบเข้าคำร้องเดิม
                    </Button>
                    <Button size="sm" variant="quiet" disabled={busy}
                      onClick={() => setDismiss({ row, reason: "", error: "" })}>
                      ไม่ต้องมีคำร้อง
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => undismiss(row)}>คืนเข้าคิว</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <AttachTargetModal
        row={attachRow}
        onClose={() => setAttachRow(null)}
        onDone={() => { setAttachRow(null); load(); }}
        onToast={onToast}
      />
      <ReasonDialog
        open={!!dismiss}
        title={dismiss ? `${dismiss.row.orderNumber} ไม่ต้องมีคำร้อง` : ""}
        description="ใช้เมื่องานของใบนี้ทำนอกระบบไปแล้ว — ใบจะย้ายไปแท็บ &quot;ปัดออกแล้ว&quot; พร้อมเหตุผลและชื่อคนปัด · คืนเข้าคิวได้ทุกเมื่อ"
        label="เหตุผลที่ไม่ต้องมีคำร้อง"
        value={dismiss?.reason || ""}
        onChange={(reason) => setDismiss((d) => ({ ...d, reason, error: "" }))}
        onConfirm={submitDismiss}
        onClose={() => setDismiss(null)}
        confirmLabel="ปัดออกจากคิว"
        tone="warning"
        busy={busy}
        submitError={dismiss?.error || ""}
        placeholder="เช่น แก้กลิ่นให้ลูกค้าไปแล้วก่อนมีระบบ"
      />
    </DetailCard>
  );
}
