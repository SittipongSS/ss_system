"use client";
import Select from "@/components/ui/Select";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Users, Plus, Calendar, Clock3 } from "lucide-react";
import { useRole, useCan } from "@/lib/roleContext";
import MeetingFormModal from "@/components/mgmt/MeetingFormModal";
import MeetingDrawer from "@/components/mgmt/MeetingDrawer";
import { MEETING_FOLLOWUP_LABELS, toBuddhistYear } from "@/lib/mgmt/constants";
import { cachedFetchJson } from "@/lib/apiCache";

const nowYear = new Date().getFullYear();
const YEAR_OPTIONS = [nowYear + 1, nowYear, nowYear - 1, nowYear - 2, nowYear - 3];
const fmt = (d) => {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return isNaN(dt.getTime()) ? d : `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
};

export default function MgmtMeetingsPage() {
  const role = useRole();
  const router = useRouter();
  const canEdit = useCan("mgmt:edit");
  const canMgmt = useCan("mgmt:view");

  const [year, setYear] = useState(nowYear);
  const [meetings, setMeetings] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formMeeting, setFormMeeting] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => { if (role && !canMgmt) router.replace("/home"); }, [role, canMgmt, router]);

  useEffect(() => {
    fetch("/api/mgmt/departments").then((r) => (r.ok ? r.json() : [])).then((d) => setDepartments(Array.isArray(d) ? d : [])).catch(() => {});
    cachedFetchJson("/api/pm/assignable-users").then((d) => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/mgmt/meetings?year=${year}`);
      setMeetings(res.ok ? await res.json() : []);
    } catch { setMeetings([]); }
    setLoading(false);
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const upsert = (row) => setMeetings((prev) => {
    const i = prev.findIndex((m) => m.id === row.id);
    if (i === -1) return [row, ...prev];
    const next = [...prev]; next[i] = row; return next;
  });
  const drop = (id) => setMeetings((prev) => prev.filter((m) => m.id !== id));

  const openCreate = () => { setFormMeeting(null); setFormOpen(true); };
  const openEdit = (m) => { setSelected(null); setFormMeeting(m); setFormOpen(true); };

  if (role && !canMgmt) return null;

  return (
    <>
      <div className="premium-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div className="header-content">
          <h1><span className="premium-header-icon"><Users size={22} /></span> การประชุม</h1>
          <p>บันทึกการประชุม · สรุป · ติดตามผล · แนบไฟล์/เอกสาร Google</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="premium-input" style={{ width: 120 }}>
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>ปี {toBuddhistYear(y)}</option>)}
          </Select>
          {canEdit && <button className="btn btn-primary flex items-center gap-1.5" onClick={openCreate}><Plus size={16} /> เพิ่มการประชุม</button>}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 50, textAlign: "center", color: "var(--text-3)" }}>กำลังโหลด...</div>
      ) : meetings.length === 0 ? (
        <div className="glass-panel" style={{ padding: 50, textAlign: "center", color: "var(--text-3)" }}>ยังไม่มีการประชุมในปีนี้</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {meetings.map((m) => (
            <button key={m.id} onClick={() => setSelected(m)} className="glass-panel" style={{ textAlign: "left", padding: 16, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, color: "inherit" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-2)", flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Calendar size={13} /> {fmt(m.meetingDate)}</span>
                {m.timeText && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Clock3 size={13} /> {m.timeText}</span>}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{m.title}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                {m.deptCode && <span className="pill">{m.deptCode}</span>}
                {m.assigneeName && <span style={{ color: "var(--text-3)" }}>{m.assigneeName}</span>}
                <span className={`pill ${m.followUp === "follow" ? "ok" : ""}`}>{MEETING_FOLLOWUP_LABELS[m.followUp] || m.followUp}</span>
              </div>
              {m.summary && <div style={{ fontSize: 12.5, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{m.summary}</div>}
            </button>
          ))}
        </div>
      )}

      <MeetingFormModal open={formOpen} onClose={() => setFormOpen(false)} onSaved={upsert} meeting={formMeeting} departments={departments} users={users} />
      <MeetingDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        meeting={selected}
        canEdit={canEdit}
        onEdit={openEdit}
        onChanged={(row) => { upsert(row); setSelected(row); }}
        onDeleted={drop}
      />
    </>
  );
}
