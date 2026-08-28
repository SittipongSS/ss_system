"use client";
import { notifyToast } from "@/components/ui/Toast";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Trash2, RotateCcw, ListTodo, Users, Target } from "lucide-react";
import { useRole, useCan } from "@/lib/roleContext";
import SkeletonRows from "@/components/ui/Skeleton";
import { fmtDateTime } from "@/lib/format";
import Workspace from "@/components/ui/Workspace";
import { apiFetch } from "@/lib/apiFetch";

const fmt = (d) => (d ? fmtDateTime(d) : "");

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

  const Section = ({ title, icon: Icon, entity, items, label }) => (
    <div className="glass-panel" style={{ padding: "14px 16px", marginBottom: 14 }}>
      <div style={{ fontSize: "var(--fs-8)", fontWeight: "var(--fw-bold)", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size={16} /> {title} <span style={{ color: "var(--text-3)", fontWeight: "var(--fw-normal)" }}>({items.length})</span>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: "var(--fs-6)", color: "var(--text-3)", fontStyle: "italic" }}>ว่าง</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((it) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "var(--fs-7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label(it)}</div>
                <div style={{ fontSize: "var(--fs-3)", color: "var(--text-3)" }}>ลบเมื่อ {fmt(it.deletedAt)}</div>
              </div>
              {canEdit && (
                <button className="btn" style={{ flexShrink: 0 }} onClick={() => restore(entity, it.id)} disabled={busy}><RotateCcw size={13} /> กู้คืน</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (role && !canMgmt) return null;

  return (
    <Workspace
      icon={<Trash2 size={22} />}
      title="ถังขยะ"
      subtitle="รายการที่ลบไว้ — กู้คืนได้"
    >
      {loading ? (
        <SkeletonRows rows={6} />
      ) : (
        <>
          <Section title="รายการงาน" icon={ListTodo} entity="task" items={data.tasks} label={(it) => it.title} />
          <Section title="การประชุม" icon={Users} entity="meeting" items={data.meetings} label={(it) => it.title} />
          <Section title="Rock & Improve" icon={Target} entity="rock" items={data.rocks} label={(it) => `${it.deptCode} · ปี ${it.year}`} />
        </>
      )}
    </Workspace>
  );
}
