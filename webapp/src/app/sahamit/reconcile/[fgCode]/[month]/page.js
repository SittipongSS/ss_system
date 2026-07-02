"use client";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ClipboardCheck, AlertCircle, Lock, Unlock, ChevronRight } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import CoveragePanel from "@/components/sahamit/CoveragePanel";
import { useApiList } from "@/lib/excise/useApiList";
import { fmtDate } from "@/lib/format";
import { buildReconMatrix, cellDetail, RECON_STATUS_COLOR } from "@/lib/sahamit/reconcileClient";
import { PO_STATUS_LABEL } from "@/lib/sahamit/po";
import { predictShifts } from "@/lib/sahamit/predict";
import { FLAG_KIND_LABEL, FLAG_STATUS_LABEL } from "@/lib/sahamit/flags";
import { toLocalISODate } from "@/lib/pm/dateHelpers";

const URGENCY_LABEL = { high: "เร่งด่วน", medium: "ปานกลาง", low: "ยังมีเวลา" };
const URGENCY_COLOR = { high: "var(--red)", medium: "var(--amber)", low: "var(--violet)" };

const C = {
  green: "var(--green)", teal: "var(--teal)", amber: "var(--amber)",
  red: "var(--red)", violet: "var(--violet)", blue: "var(--blue)", "text-3": "var(--text-3)",
};
const nf = (n) => Number(n || 0).toLocaleString("th-TH");
const TABS = [
  { key: "overview", label: "ภาพรวม" },
  { key: "docs", label: "เอกสารอ้างอิง" },
  { key: "coverage", label: "ชดเชยยอดข้ามเดือน" },
];

export default function ReconcileCellPage() {
  const params = useParams();
  const fgCode = decodeURIComponent(params.fgCode);
  const month = decodeURIComponent(params.month);

  const { data: rounds, loading: l1, error: e1 } = useApiList("/api/sahamit/forecast/rounds");
  const { data: pos, loading: l2, error: e2 } = useApiList("/api/sahamit/po");
  const { data: locks, reload: reloadLocks } = useApiList("/api/sahamit/locks");
  const { data: coverages, reload: reloadCoverages } = useApiList("/api/sahamit/coverage");
  const { data: flags } = useApiList("/api/sahamit/flags");
  const [tab, setTab] = useState("overview");

  const loading = l1 || l2;
  const error = e1 || e2;

  const matrix = useMemo(() => buildReconMatrix(rounds, pos, coverages), [rounds, pos, coverages]);
  const row = useMemo(() => matrix.rows.find((r) => r.fgCode === fgCode), [matrix, fgCode]);
  const cell = row?.cells[month] || null;
  const detail = useMemo(() => cellDetail(rounds, pos, fgCode, month), [rounds, pos, fgCode, month]);
  const lock = useMemo(() => locks.find((lk) => lk.fgCode === fgCode && lk.month === month), [locks, fgCode, month]);

  // เฟส S3: เชื่อมชั้นคาดการณ์ (predict) กับชั้นหลักฐาน (flags) ในหน้าเดียว
  const today = useMemo(() => toLocalISODate(new Date()), []);
  const prediction = useMemo(
    () => predictShifts(rounds, pos, { today, locks }).get(`${fgCode}||${month}`) || null,
    [rounds, pos, today, locks, fgCode, month],
  );
  const relatedFlags = useMemo(
    () => (flags || []).filter((f) => f.fgCode === fgCode && f.month === month),
    [flags, fgCode, month],
  );

  const color = cell ? (C[RECON_STATUS_COLOR[cell.status]] || C["text-3"]) : C["text-3"];
  const fcQty = cell?.fcQty || 0;
  const poQty = cell?.poQty || 0;
  const diff = poQty - fcQty;
  const pct = fcQty > 0 ? Math.min(100, Math.round((poQty / fcQty) * 100)) : poQty > 0 ? 100 : 0;
  const diffMsg =
    !cell ? "" :
    cell.status === "match" ? "ครบพอดีตามแผน" :
    cell.status === "pending" ? `ยังไม่มี PO — ขาด ${nf(fcQty)} ชิ้น` :
    cell.status === "discrepancy" ? `PO ไม่ครบ — ขาดอีก ${nf(fcQty - poQty)} ชิ้น` :
    cell.status === "over" ? `PO เกินแผน +${nf(diff)} ชิ้น` :
    cell.status === "unforecasted" ? `สั่ง PO นอกแผน ${nf(poQty)} ชิ้น (ไม่มี FC)` :
    cell.label;

  const toggleLock = async () => {
    try {
      if (lock) {
        await fetch(`/api/sahamit/locks/${lock.id}`, { method: "DELETE" });
      } else {
        const res = await fetch("/api/sahamit/locks", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fgCode, month, lockedQty: fcQty }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "ล็อกไม่สำเร็จ");
      }
      reloadLocks();
    } catch (e) { alert(e.message); }
  };

  return (
    <Workspace
      icon={<ClipboardCheck size={22} />}
      title={`${row?.productName || fgCode}`}
      subtitle={`${fgCode} · เดือน ${month}`}
      back={{ href: "/sahamit/reconcile", label: "กระทบยอด" }}
    >
      {error && (
        <div className="glass-panel" style={{ padding: 14, borderLeft: "3px solid var(--red)", color: "var(--red)", display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : error ? null : !cell ? (
        <div className="empty-state dashed" style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }}>
          <ClipboardCheck size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 600, fontSize: 15 }}>ไม่พบข้อมูลช่องนี้</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>{fgCode} · {month}</div>
        </div>
      ) : (
        <>
          <div className="tabs-header">
            {TABS.map((t) => (
              <button key={t.key} className={`tab-btn ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>

          {tab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 620 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span className="ui-badge" style={{ color, borderColor: color, fontSize: 13 }}>{cell.label}</span>
                {lock ? (
                  <button className="btn ghost sm" onClick={toggleLock}><Unlock size={14} /> ปลดล็อก (ล็อกที่ {nf(lock.lockedQty)})</button>
                ) : (
                  <button className="btn sm" onClick={toggleLock}><Lock size={14} /> ล็อก (ตกลงแล้ว)</button>
                )}
              </div>

              <div className="glass-panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", gap: 32 }}>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--text-3)" }}>Forecast (FC)</div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{nf(fcQty)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--text-3)" }}>Purchase Order (PO)</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{nf(poQty)}</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color }}>{diffMsg}</div>
                <div className="progress"><span style={{ width: `${pct}%`, background: color }} /></div>
                <div style={{ fontSize: 11, color: "var(--text-3)", textAlign: "right" }}>ครอบคลุม {pct}%</div>
                {(cell.coverageIn > 0 || cell.coverageOut > 0) && (
                  <div style={{ fontSize: 12, color: "var(--blue)" }}>
                    ⇄ มีการชดเชยข้ามเดือน (รับเข้า {nf(cell.coverageIn)} / ส่งออก {nf(cell.coverageOut)}) — ดูแท็บ “ชดเชยยอดข้ามเดือน”
                  </div>
                )}
              </div>

              {/* คาดการณ์ (S3): ช่องนี้มี FC แต่ยังไม่มี PO → ระบบเดาว่าน่าจะเลื่อน */}
              {prediction && (
                <div className="glass-panel" style={{ padding: 16, borderLeft: `3px solid ${URGENCY_COLOR[prediction.urgency]}`, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    ✨ ระบบคาดว่าจะเลื่อนไป {prediction.toMonth}
                    <span className="ui-badge" style={{ color: URGENCY_COLOR[prediction.urgency], borderColor: URGENCY_COLOR[prediction.urgency] }}>
                      {URGENCY_LABEL[prediction.urgency]}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-2)" }}>
                    ยังไม่มี PO ({prediction.pattern} · เหลือ {prediction.daysLeft} วันถึงสิ้นเดือน) — สอบถามลูกค้าว่าเลื่อนหรือตัด แล้วบันทึกในหน้า
                    <Link href="/sahamit/review" style={{ color: "var(--accent)", marginLeft: 4 }}>ตรวจการเปลี่ยน FC</Link>
                    หรือชดเชยข้ามเดือนในแท็บด้านบน
                  </div>
                </div>
              )}

              {/* หลักฐานที่เกี่ยวข้อง (S3): ธงของช่องนี้จากการนำเข้ารอบ FC */}
              {relatedFlags.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontWeight: 600, display: "flex", alignItems: "center" }}>
                    ธงที่เกี่ยวข้อง ({relatedFlags.length})
                    <Link href="/sahamit/review" className="flex items-center" style={{ marginLeft: "auto", fontSize: 13, color: "var(--accent)" }}>
                      เปิดหน้าตรวจ <ChevronRight size={14} />
                    </Link>
                  </div>
                  {relatedFlags.map((f) => (
                    <div key={f.id} className="glass-panel" style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                      <span className="ui-badge">{FLAG_KIND_LABEL[f.kind] || f.kind}</span>
                      <span style={{ color: "var(--text-2)" }}>#{f.roundNo} · {nf(f.prevQty)} → {nf(f.newQty)}</span>
                      <span style={{ marginLeft: "auto", fontWeight: 600 }}>
                        {FLAG_STATUS_LABEL[f.status] || f.status}{f.status === "confirmed_shift" && f.shiftToMonth ? ` → ${f.shiftToMonth}` : ""}
                      </span>
                    </div>
                  ))}
                  {relatedFlags.some((f) => f.customerResponse) && (
                    <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                      คำตอบลูกค้า: {relatedFlags.filter((f) => f.customerResponse).map((f) => f.customerResponse).join(" · ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "docs" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <div>
                <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Forecast (ตามรอบ)</h3>
                {detail.fcs.length === 0 ? (
                  <div style={{ color: "var(--text-3)", fontSize: 13 }}>— ไม่มี FC เดือนนี้ —</div>
                ) : (
                  <div className="premium-table-wrapper">
                    <table className="premium-table">
                      <thead><tr><th>รอบที่</th><th>วันที่รับ</th><th style={{ textAlign: "right" }}>จำนวน</th></tr></thead>
                      <tbody>
                        {detail.fcs.map((f, i) => (
                          <tr key={i}><td>#{f.roundNo}</td><td>{f.receivedDate ? fmtDate(f.receivedDate) : "—"}</td><td style={{ textAlign: "right" }}>{nf(f.qty)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div>
                <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Purchase Orders (ส่งเดือนนี้)</h3>
                {detail.poLines.length === 0 ? (
                  <div style={{ color: "var(--text-3)", fontSize: 13 }}>— ไม่มี PO เดือนนี้ —</div>
                ) : (
                  <div className="premium-table-wrapper">
                    <table className="premium-table">
                      <thead><tr><th>เลขที่ PO</th><th style={{ textAlign: "right" }}>จำนวน</th><th>กำหนดส่ง</th><th>คาดส่ง</th><th>ส่งจริง</th><th>สถานะ</th></tr></thead>
                      <tbody>
                        {detail.poLines.map((p, i) => (
                          <tr key={i}>
                            <td className="font-mono">{p.poNumber}</td>
                            <td style={{ textAlign: "right" }}>{nf(p.qty)}</td>
                            <td>{p.dueDate ? fmtDate(p.dueDate) : "—"}</td>
                            <td>{p.expectedDate ? fmtDate(p.expectedDate) : "—"}</td>
                            <td>{p.actualDeliveredDate ? fmtDate(p.actualDeliveredDate) : "—"}</td>
                            <td>{PO_STATUS_LABEL[p.status] || p.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "coverage" && (
            <div style={{ maxWidth: 620 }}>
              <CoveragePanel fgCode={fgCode} month={month} coverages={coverages} matrix={matrix} onChanged={reloadCoverages} />
            </div>
          )}
        </>
      )}
    </Workspace>
  );
}
