"use client";
// ── หน้าต่าง "ส่งต่องาน" ของลูกค้า — ปุ่มใน Control Panel ("จัดการลูกค้า") ของหน้าลูกค้า (มติเจ้าของ 27/11/2026) ──
// ตารางเดียวกับหน้าโอนงานคนลาออก + คอลัมน์ "เจ้าของตอนนี้" (ลูกค้ารายหนึ่งมีดีลหลายเจ้าของได้)
import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import SkeletonRows from "@/components/ui/Skeleton";
import { apiJson } from "@/lib/apiFetch";
import usePeopleDirectory from "@/lib/usePeopleDirectory";
import HandoverTable, { useHandoverPeople } from "./HandoverTable";
import styles from "./handover.module.css";

export default function HandoverCustomerDialog({ open, customerId, customerName, onClose, onDone, onToast }) {
  const directory = usePeopleDirectory();
  const people = useHandoverPeople(directory);
  const [state, setState] = useState({ loading: true, error: "", deals: [], leads: [] });
  const [moved, setMoved] = useState(0);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const data = await apiJson(`/api/sales-planning/handover?customerId=${encodeURIComponent(customerId)}`, { fallbackError: "โหลดงานของลูกค้าไม่สำเร็จ" });
      setState({ loading: false, error: "", deals: data.deals || [], leads: data.leads || [] });
    } catch (error) {
      setState({ loading: false, error: error.message, deals: [], leads: [] });
    }
  }, [customerId]);

  useEffect(() => {
    if (open && customerId) { setMoved(0); load(); }
  }, [open, customerId, load]);

  const drop = (key) => (done) => {
    const ids = new Set(done.map((r) => r.id));
    setState((s) => ({ ...s, [key]: s[key].filter((row) => !ids.has(row.id)) }));
    setMoved((n) => n + done.length);
  };
  const close = () => {
    if (moved) onDone?.();
    onClose?.();
  };
  const left = state.deals.length + state.leads.length;

  return (
    <Modal open={open} onClose={close} size="xl" className={styles.wideDialog}
      title={`ส่งต่องานของ ${customerName || "ลูกค้ารายนี้"}`}
      subtitle="ดีลเปิดและดีล Won ที่งานยังไม่จบของลูกค้ารายนี้ · เลือกทีมและคนรับทีละใบ หรือติ๊กหลายใบแล้วส่งให้คนเดียว"
      footer={(
        <>
          <span className="drawer-footer-note">
            {state.loading ? "" : left ? `เหลือ ${left} รายการ${moved ? ` · ส่งต่อแล้ว ${moved}` : ""}` : moved ? `ส่งต่อครบแล้ว ${moved} รายการ` : ""}
          </span>
          <Button onClick={close}>ปิด</Button>
        </>
      )}
    >
      {state.loading ? <SkeletonRows rows={5} /> : null}
      {state.error ? <StatusNotice tone="error">{state.error}</StatusNotice> : null}
      {!state.loading && !state.error && !left ? (
        <StatusNotice tone={moved ? "success" : "info"}>
          {moved ? "ส่งต่อครบทุกรายการแล้ว" : "ลูกค้ารายนี้ไม่มีดีลเปิด ดีล Won ที่งานยังค้าง หรือลีดเปิด — ไม่มีงานให้ส่งต่อ"}
        </StatusNotice>
      ) : null}
      {state.deals.length ? (
        <HandoverTable kind="deal" rows={state.deals} people={people} showOwner showReasons={state.deals.some((d) => d.group === "won_open")}
          onTransferred={drop("deals")} onToast={onToast} />
      ) : null}
      {state.leads.length ? (
        <>
          <p className={styles.hint}>ลีดเปิดของลูกค้ารายนี้</p>
          <HandoverTable kind="lead" rows={state.leads} people={people} onTransferred={drop("leads")} onToast={onToast} />
        </>
      ) : null}
    </Modal>
  );
}
