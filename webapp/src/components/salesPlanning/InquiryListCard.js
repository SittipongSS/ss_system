"use client";

import Link from "next/link";
import { MessageCircleQuestion, Plus } from "lucide-react";
import { InquiryStatusBadge } from "@/components/salesPlanning/inquiryUi";
import { fmtDate } from "@/lib/format";

export default function InquiryListCard({ inquiries = [], onCreate = null, title = "สอบถาม RD" }) {
  return (
    <section className="glass-panel" style={{ padding: 16 }}>
      <div className="flex items-center gap-2 mb-3">
        <MessageCircleQuestion size={17} aria-hidden="true" />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>
        <span className="ui-badge">{inquiries.length} เรื่อง</span>
        <div className="spacer" />
        {onCreate && <button type="button" className="btn btn-primary sm" onClick={onCreate}><Plus size={13} /> สอบถาม RD</button>}
      </div>
      {inquiries.length ? (
        <div className="premium-glass-table table-responsive">
          <table className="premium-table">
            <thead><tr><th>เลขที่ / เรื่อง</th><th>ผู้รับ RD</th><th>SA คาดหวัง</th><th>RD จะตอบ</th><th>สถานะ</th></tr></thead>
            <tbody>{inquiries.map((q) => <tr key={q.id} className="premium-row">
              <td><Link className="linklike" href={`/sa/inquiries/${q.id}`} style={{ fontWeight: 700 }}>{q.code || q.id} · {q.title}</Link></td>
              <td>{q.assigneeName || "ยังไม่มีผู้รับ"}</td>
              <td>{q.requestedDueDate ? fmtDate(q.requestedDueDate) : "-"}</td>
              <td>{q.committedDueDate ? fmtDate(q.committedDueDate) : "-"}</td>
              <td><InquiryStatusBadge status={q.status} /></td>
            </tr>)}</tbody>
          </table>
        </div>
      ) : <div style={{ padding: 12, color: "var(--text-3)", fontSize: 13 }}>ยังไม่มีเรื่องสอบถาม RD ที่ผูกกับรายการนี้</div>}
    </section>
  );
}
