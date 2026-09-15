"use client";
import { notifyToast } from "@/components/ui/Toast";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Trash2, RotateCcw, ListTodo, Users, Target } from "lucide-react";
import { useRole, useCan } from "@/lib/roleContext";
import EmptyState from "@/components/ui/EmptyState";
import { fmtDateTime } from "@/lib/format";
import Workspace, { ListPanel } from "@/components/ui/Workspace";
import { apiFetch } from "@/lib/apiFetch";

const fmt = (d) => (d ? fmtDateTime(d) : "");

/* แผงของที่ลบไว้หนึ่งชนิด — รายการทุกชุดเป็นแผงเดียว (มติผู้ใช้ 2026-09-15)
   ⚠️ ประกาศระดับโมดูล ไม่ประกาศในตัวหน้า — ฟังก์ชันคอมโพเนนต์ที่เกิดใหม่ทุกรอบ render
   React มองเป็นคนละชนิดกัน ⇒ ถอดแล้วต่อใหม่ทั้งแผงทุกครั้งที่ busy เปลี่ยน (ปุ่มกู้คืนหลุดโฟกัส) */
function TrashPanel({ title, icon: Icon, items, label, loading, canEdit, busy, onRestore }) {
  return (
    <ListPanel
      icon={<Icon size={17} aria-hidden="true" />}
      title={title}
      subtitle={canEdit ? "กดกู้คืนเพื่อนำกลับไปใช้งาน" : "ดูได้อย่างเดียว — กู้คืนต้องมีสิทธิ์แก้ไขงานบริหาร"}
      count={loading ? null : `${items.length} รายการ`}
      loading={loading}
      skeletonRows={3}
    >
      {items.length === 0 ? (
        <EmptyState plain icon={Icon}>ไม่มีรายการที่ลบไว้</EmptyState>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((it) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "var(--fs-7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label(it)}</div>
                <div style={{ fontSize: "var(--fs-3)", color: "var(--text-3)" }}>ลบเมื่อ {fmt(it.deletedAt)}</div>
              </div>
              {canEdit && (
                <button className="btn" style={{ flexShrink: 0 }} onClick={() => onRestore(it.id)} disabled={busy}><RotateCcw size={13} /> กู้คืน</button>
              )}
            </div>
          ))}
        </div>
      )}
    </ListPanel>
  );
}

export default function MgmtTrashPage() {
  const role = useRole();
  const router = useRouter();
  const canEdit = useCan("mgmt:edit");
  const canMgmt = useCan("mgmt:view");
  const [data, setData] = useState({ tasks: [], meetings: [], rocks: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (role && !canMgmt) router.replace("/home"); }, [role, canMgmt, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/mgmt/trash");
      setData(res.ok ? await res.json() : { tasks: [], meetings: [], rocks: [] });
    } catch { setData({ tasks: [], meetings: [], rocks: [] }); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const restore = async (entity, id) => {
    setBusy(true);
    try {
      const res = await apiFetch("/api/mgmt/trash", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, id }),
      });
      if (res.ok) setData((d) => ({ ...d, [`${entity}s`]: d[`${entity}s`].filter((x) => x.id !== id) }));
      else notifyToast.error((await res.json().catch(() => ({}))).error || "กู้คืนไม่สำเร็จ");
    } finally { setBusy(false); }
  };

  if (role && !canMgmt) return null;

  const shared = { loading, canEdit, busy };
  return (
    <Workspace
      icon={<Trash2 size={22} />}
      title="ถังขยะ"
      subtitle="รายการที่ลบไว้ — กู้คืนได้"
    >
      <TrashPanel {...shared} title="งานที่ลบ" icon={ListTodo} items={data.tasks} label={(it) => it.title} onRestore={(id) => restore("task", id)} />
      <TrashPanel {...shared} title="การประชุมที่ลบ" icon={Users} items={data.meetings} label={(it) => it.title} onRestore={(id) => restore("meeting", id)} />
      <TrashPanel {...shared} title="Rock & Improve ที่ลบ" icon={Target} items={data.rocks} label={(it) => `${it.deptCode} · ปี ${it.year}`} onRestore={(id) => restore("rock", id)} />
    </Workspace>
  );
}
