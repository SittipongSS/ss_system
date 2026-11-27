"use client";
// ── หน้าต่าง "ส่งต่องาน" ของดีลใบเดียว — ปุ่มใน Control Panel หน้าดีล (มติเจ้าของ 27/11/2026) ─────────────
// โหลดดีลผ่าน GET /api/sales-planning/handover?dealId= (ตัวตัดสินเดียวกับหน้าโอนงานคนลาออก)
// ⇒ ดีลที่งานจบแล้ว/Lost/ดีลภาชนะ ได้คำตอบจากตัวตัดสินกลาง ไม่ใช่เงื่อนไขที่จอคิดเอง
import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Bell, ClipboardList, FilePenLine, FileText, Handshake, History, Lock, MessageCircleQuestion, MoveRight, StickyNote, UserRoundCheck, Wallet } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import StatusNotice from "@/components/ui/StatusNotice";
import SkeletonRows from "@/components/ui/Skeleton";
import { apiJson } from "@/lib/apiFetch";
import usePeopleDirectory from "@/lib/usePeopleDirectory";
import { contractStatusLabel } from "@/lib/sales/contracts";
import { naText } from "@/lib/format";
import { HandoverPick, handoverItem, useHandoverPeople } from "./HandoverTable";
import styles from "./handover.module.css";

const ORDER_STATUS = { draft: "ร่าง", pending_approval: "รออนุมัติ", rejected: "ตีกลับ", approval_revoked: "ยกเลิกอนุมัติ", approved: "อนุมัติแล้ว" };
const QUOTE_STATUS = { draft: "ร่าง", pending_approval: "รออนุมัติ", approved: "อนุมัติแล้ว", sent: "ส่งแล้ว", accepted: "รับแล้ว", rejected: "ตีกลับ", expired: "หมดอายุ" };

function Effect({ icon: Icon, what, children }) {
  return (
    <div className={styles.effect}>
      <Icon size={14} className={styles.effectIcon} aria-hidden="true" />
      <span className={styles.effectWhat}>{what}</span>
      <span className={styles.effectResult}>{children}</span>
    </div>
  );
}

/**
 * @param dealId ดีลที่จะส่งต่อ
 * @param onDone (result) — หน้าโหลดดีลใหม่
 */
export default function HandoverDealDialog({ open, dealId, onClose, onDone, onToast }) {
  const directory = usePeopleDirectory();
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [pick, setPick] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState("");

  useEffect(() => {
    if (!open || !dealId) return undefined;
    let alive = true;
    setState({ loading: true, error: "", data: null });
    setPick(null);
    setNote("");
    setMissing("");
    apiJson(`/api/sales-planning/handover?dealId=${encodeURIComponent(dealId)}`, { fallbackError: "โหลดข้อมูลดีลไม่สำเร็จ" })
      .then((data) => { if (alive) setState({ loading: false, error: "", data }); })
      .catch((error) => { if (alive) setState({ loading: false, error: error.message, data: null }); });
    return () => { alive = false; };
  }, [open, dealId]);

  const deal = state.data?.deals?.[0] || null;
  const people = useHandoverPeople(directory, { excludeId: deal?.ownerId });
  const current = pick || (deal ? { team: deal.team || "", toUserId: "", acOwnerId: deal.acOwnerId || "", aeSupervisorId: deal.aeSupervisorId || "" } : null);
  const toName = useMemo(() => directory.find((u) => String(u.id) === String(current?.toUserId))?.name || "คนรับ", [directory, current?.toUserId]);

  const notEligible = !state.loading && !state.error && !deal
    ? (state.data?.counts?.historical
      ? "ดีลของใบสั่งขายย้อนหลังย้ายเจ้าของได้ที่ฟอร์มแก้ไขดีลทีละใบ (ต้องตรวจดีลภาชนะของลูกค้ารายเดียวกัน)"
      : state.data?.counts?.lost ? "ดีลนี้ปิดเป็น Lost แล้ว — อยู่กับคนเดิม" : "ดีลนี้งานจบแล้ว (SO อนุมัติ · เก็บเงินครบ · สัญญาจบ) — ไม่มีงานให้ส่งต่อ")
    : "";

  const save = async () => {
    if (!current?.toUserId) { setMissing("ยังขาด: คนรับ"); return; }
    setBusy(true);
    try {
      const data = await apiJson("/api/sales-planning/handover", {
        method: "POST", json: { items: [handoverItem(deal, "deal", current)], note }, fallbackError: "ส่งต่องานไม่สำเร็จ",
      });
      const result = data.results?.[0];
      if (!result?.ok) { setMissing(result?.error || "ส่งต่องานไม่สำเร็จ"); return; }
      onToast?.({
        kind: result.warning ? "warning" : "success",
        msg: `ส่งต่อ ${result.label} ให้ ${result.toName} แล้ว${result.moved?.orders ? ` · ย้ายตาม SO ${result.moved.orders} ใบ` : ""}${result.moved?.contracts ? ` · สัญญา ${result.moved.contracts} ใบ` : ""}${result.warning ? ` · ${result.warning}` : ""}`,
      });
      onDone?.(result);
      onClose?.();
    } catch (error) {
      setMissing(error.message);
    } finally {
      setBusy(false);
    }
  };

  const docs = deal?.docs || [];
  const orders = docs.filter((d) => d.kind === "sales_order");
  const contracts = docs.filter((d) => d.kind === "contract");
  const quotes = docs.filter((d) => d.kind === "quotation");
  const fromName = deal?.ownerName || "เจ้าของเดิม";

  return (
    <Modal open={open} onClose={onClose} size="lg"
      title={deal ? `ส่งต่องาน ${deal.code || deal.title}` : "ส่งต่องาน"}
      subtitle="ดีลพร้อมใบที่ยังไม่จบย้ายไปให้คนรับ · ยอดขายและประวัติไม่ย้าย"
      footer={deal ? (
        <>
          {missing ? <span className={`drawer-footer-note ${styles.rowError}`} role="status">{missing}</span> : null}
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button tone="primary" icon={<ArrowRightLeft size={15} />} disabled={busy} onClick={save}>ส่งต่องาน</Button>
        </>
      ) : <Button onClick={onClose}>ปิด</Button>}
    >
      {state.loading ? <SkeletonRows rows={5} /> : null}
      {state.error ? <StatusNotice tone="error">{state.error}</StatusNotice> : null}
      {notEligible ? <StatusNotice tone="info">{notEligible}</StatusNotice> : null}
      {deal && current ? (
        <>
          <div className={styles.context}>
            <strong>{deal.title || deal.code}</strong>
            <span>เจ้าของตอนนี้ <strong>{fromName}</strong></span>
            <span>ทีม {naText(deal.team)}</span>
            {deal.reasons?.length ? <span>งานที่ค้าง: {deal.reasons.map((r) => r.label).join(" · ")}</span> : null}
          </div>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}><UserRoundCheck size={15} aria-hidden="true" />ส่งให้ใคร <span className={styles.required}>*</span></h3>
            <HandoverPick pick={current} people={people} current={{ acOwnerId: deal.acOwnerId, aeSupervisorId: deal.aeSupervisorId }}
              onChange={(next) => { setPick(next); if (next.toUserId) setMissing(""); }} />
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}><MoveRight size={15} aria-hidden="true" />ย้ายตามไปด้วย</h3>
            <div className={styles.effects}>
              <Effect icon={Handshake} what={`ดีล ${deal.code || ""}`}>เจ้าของดีล + ทีม → {toName} · ขึ้นในคิว &quot;ของฉัน&quot; ของคนรับ</Effect>
              {orders.filter((o) => o.moves === "with").map((o) => (
                <Effect key={o.id} icon={ClipboardList} what={`${o.number || "ใบสั่งขาย"} · ${ORDER_STATUS[o.status] || o.status}`}>
                  คนรับแก้และกดยื่นได้ · ถูกตีกลับจะกลับไปหาคนรับ · อนุมัติแล้วยอดเป็นของคนรับ
                </Effect>
              ))}
              {contracts.map((c) => (
                <Effect key={c.id} icon={FilePenLine} what={`${c.number || (c.contractKind === "service" ? "สัญญาบริการ" : "สัญญา")} · ${contractStatusLabel(c.status)}`}>
                  {c.status === "signed" ? "ผู้ดูแลสัญญา → คนรับ (บันทึกเพิ่มเติม/Rev. ถัดไป)" : "ผู้ดูแลสัญญา → คนรับ · กระดิ่งและคิว \"รอฉัน\" ของสัญญาไปหาคนรับ"}
                </Effect>
              ))}
              {quotes.map((q) => (
                <Effect key={q.id} icon={FileText} what={`${q.number || "ใบเสนอราคา"} · ${QUOTE_STATUS[q.status] || q.status}`}>
                  ชื่อผู้เสนอราคาบนใบพิมพ์เป็นคนรับ · บรรทัดเบอร์โทรหายไป (เบอร์ที่ตรึงไว้เป็นของคนเดิม) · ไม่ต้องออก Rev.
                </Effect>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}><Lock size={15} aria-hidden="true" />ไม่ย้าย</h3>
            <div className={`${styles.effects} ${styles.effectsStay}`}>
              <Effect icon={Wallet} what="ยอดขาย (Actual)">
                {orders.some((o) => o.moves === "stays") ? `${orders.filter((o) => o.moves === "stays").map((o) => o.number).join(", ")} อนุมัติแล้ว — ยอดนับให้คนปิดเสมอ` : "SO ที่อนุมัติแล้วนับให้คนปิดเสมอ — ดีลนี้ยังไม่มี"}
              </Effect>
              <Effect icon={History} what="ประวัติ">ใครยื่น/อนุมัติ/รับใบ ยังเป็นชื่อเดิมตามที่เกิดจริง</Effect>
              <Effect icon={MessageCircleQuestion} what="คำร้อง">ผู้ขอของคำร้องไม่เปลี่ยน</Effect>
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}><Bell size={15} aria-hidden="true" />กระดิ่ง</h3>
            <p className={styles.hint}>
              {toName} ได้กระดิ่ง &quot;ได้รับงานส่งต่อ&quot; · {fromName} หยุดได้กระดิ่งเธรดของดีลนี้ ยกเว้นถูก @ ถึง
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}><StickyNote size={15} aria-hidden="true" />หมายเหตุถึงคนรับ (ไม่บังคับ)</h3>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น ลูกค้ายืนยันแล้ว รอยื่น SO · ติดต่อคุณ… ที่ไซต์" />
          </section>
        </>
      ) : null}
    </Modal>
  );
}
