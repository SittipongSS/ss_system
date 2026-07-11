"use client";
import { useEffect, useMemo, useState } from "react";
import { Flag, AlertCircle, ChevronRight, ChevronDown, Save } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import { useApiList } from "@/lib/excise/useApiList";
import { fmtDate } from "@/lib/format";
import { FLAG_KIND_LABEL, FLAG_STATUS_LABEL } from "@/lib/sahamit/flags";
import { useCan } from "@/lib/roleContext";

const nf = (n) => Number(n || 0).toLocaleString("th-TH");
const KIND_COLOR = { drop: "var(--red)", shift_suspect: "var(--blue)", lockedBreak: "var(--amber)" };
const STATUS_COLOR = { open: "var(--red)", confirmed_shift: "var(--blue)", confirmed_cut: "var(--amber)", ignored: "var(--text-3)" };

function FlagRow({ flag, onSaved, canEdit }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState({});
  useEffect(() => {
    setD({ status: flag.status, shiftToMonth: flag.shiftToMonth || "", note: flag.note || "", customerResponse: flag.customerResponse || "" });
  }, [flag]);

  const save = async (statusOverride) => {
    const status = statusOverride || d.status;
    if (status === "confirmed_shift" && !d.shiftToMonth) { alert("ระบุเดือนปลายทางที่เลื่อนไป"); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/sahamit/flags/${flag.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, shiftToMonth: d.shiftToMonth, note: d.note, customerResponse: d.customerResponse }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      onSaved?.();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  return (
    <>
      <tr>
        <td className="font-mono" style={{ fontWeight: 600 }}>{flag.fgCode}</td>
        <td>{flag.month}</td>
        <td><span className="ui-badge" style={{ color: KIND_COLOR[flag.kind], borderColor: KIND_COLOR[flag.kind] }}>{FLAG_KIND_LABEL[flag.kind] || flag.kind}</span></td>
        <td style={{ textAlign: "right" }}>{nf(flag.prevQty)} → {nf(flag.newQty)} <span style={{ color: "var(--red)" }}>(−{nf(flag.drop)})</span></td>
        <td>#{flag.roundNo}</td>
        <td><span style={{ color: STATUS_COLOR[flag.status], fontWeight: 600 }}>{FLAG_STATUS_LABEL[flag.status] || flag.status}{flag.status === "confirmed_shift" && flag.shiftToMonth ? ` → ${flag.shiftToMonth}` : ""}</span></td>
        <td style={{ textAlign: "right" }}>{canEdit && <button className="btn-icon" onClick={() => setOpen((v) => !v)} title="เคลียร์">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} style={{ background: "var(--panel-2)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", padding: "8px 2px" }}>
              <div className="form-group" style={{ width: 150 }}>
                <label>เลื่อนไปเดือน</label>
                <input type="month" className="premium-input" style={{ height: 30 }} value={d.shiftToMonth} onChange={(e) => setD({ ...d, shiftToMonth: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: "1 1 180px", minWidth: 150 }}>
                <label>คำตอบลูกค้า / เหตุผล</label>
                <input className="premium-input" style={{ height: 30 }} value={d.customerResponse} onChange={(e) => setD({ ...d, customerResponse: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: "1 1 160px", minWidth: 140 }}>
                <label>หมายเหตุ</label>
                <input className="premium-input" style={{ height: 30 }} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
              </div>
              <button className="btn btn-primary sm" onClick={() => save("confirmed_shift")} disabled={busy}>ยืนยันเลื่อน</button>
              <button className="btn btn-warning sm" onClick={() => save("confirmed_cut")} disabled={busy}>ลูกค้าตัดจริง</button>
              <button className="btn sm" onClick={() => save("open")} disabled={busy}><Save size={13} /> รอลูกค้าตอบ</button>
              <button className="btn ghost sm" onClick={() => save("ignored")} disabled={busy}>ไม่นับ</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const TABS = [{ key: "open", label: "ต้องตรวจ" }, { key: "all", label: "ทั้งหมด" }];

export default function ReviewPage() {
  const { data: flags, loading, error, reload } = useApiList("/api/sahamit/flags");
  const canEdit = useCan("sahamit:edit");
  const [tab, setTab] = useState("open");
  const shown = useMemo(() => (tab === "open" ? flags.filter((f) => f.status === "open") : flags), [flags, tab]);

  return (
    <Workspace
      icon={<Flag size={22} />}
      title="ตรวจการเปลี่ยน FC"
      subtitle="เลื่อนจริงหรือแอบตัด — เคลียร์ + เก็บหลักฐาน (ลูกค้า AR-109)"
      back={{ href: "/sahamit", label: "งานสหมิตร" }}
      headerRight={
        <div className="segmented">
          {TABS.map((t) => <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>{t.label}</button>)}
        </div>
      }
    >
      {error && (
        <div className="glass-panel" style={{ padding: 14, borderLeft: "3px solid var(--red)", color: "var(--red)", display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}
      {loading ? <Spinner /> : error ? null : shown.length === 0 ? (
        <div className="empty-state dashed" style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }}>
          <Flag size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 600, fontSize: 15 }}>{tab === "open" ? "ไม่มีรายการต้องตรวจ 🎉" : "ยังไม่มีธง"}</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>ระบบจะตั้งธงให้อัตโนมัติเมื่อ FC ลด/หาย/แก้ช่องที่ล็อก ตอนนำเข้ารอบใหม่</div>
        </div>
      ) : (
        <div className="premium-table-wrapper">
          <table className="premium-table">
            <thead>
              <tr><th>สินค้า</th><th>เดือน</th><th>ชนิด</th><th style={{ textAlign: "right" }}>เปลี่ยน</th><th>รอบ</th><th>สถานะ</th><th></th></tr>
            </thead>
            <tbody>
              {shown.map((f) => <FlagRow key={f.id} flag={f} onSaved={reload} canEdit={canEdit} />)}
            </tbody>
          </table>
        </div>
      )}
    </Workspace>
  );
}
