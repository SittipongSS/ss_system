"use client";
// แก้ PO — หน้าเต็ม ใช้ฟอร์มตัวเดียวกับหน้าสร้าง (PoForm) ตามมติผู้ใช้ 2026-07-17
// ต่างกันแค่: บรรทัดที่ผูกแล้ว (วัสดุ/แบ่งส่ง/ส่งของแล้ว) ถูกล็อก และกรอกได้เฉพาะ
// หน่วยชิ้น (ค่าใน DB เป็นชิ้น — สลับเป็นลังจะทำให้เลขที่โหลดมาเปลี่ยนความหมาย)
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import PoForm, { emptyPoHeader, poToForm, rowsToLines } from "@/components/sahamit/PoForm";
import { useApiList } from "@/lib/excise/useApiList";
import { sahamitFetch } from "@/lib/sahamit/apiClient";
import { apiCache } from "@/lib/apiCache";
import { lineLockReason } from "@/lib/sahamit/poEdit";
import { ppcOf } from "@/lib/sahamit/units";
import { useCan } from "@/lib/roleContext";

export default function PoEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;
  const canEdit = useCan("sahamit:edit");
  const { data: pos, loading } = useApiList("/api/sahamit/po");
  const { data: products } = useApiList("/api/sahamit/products");
  const { data: material } = useApiList("/api/sahamit/material");
  const po = useMemo(() => pos.find((p) => p.id === id) || null, [pos, id]);

  const [header, setHeader] = useState(emptyPoHeader);
  const [rows, setRows] = useState([]);
  const [seeded, setSeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // เติมฟอร์มครั้งเดียวตอน PO มาถึง — ไม่งั้นทุกครั้งที่ list รีเฟรชจะทับสิ่งที่พิมพ์ค้างไว้
  useEffect(() => {
    if (!po || seeded) return;
    const seed = poToForm(po);
    setHeader(seed.header);
    setRows(seed.rows);
    setSeeded(true);
  }, [po, seeded]);

  // บรรทัดที่ผูกแล้ว = ล็อก. material ผูกด้วย poLineId; แบ่งส่งดูจาก splitFromPoLineId
  // ของบรรทัดลูกใน PO ยอดเหลือ (กติกาเดียวกับฝั่ง server — server บังคับซ้ำอยู่ดี)
  const materialLineIds = useMemo(
    () => new Set(material.filter((m) => m.tracking).map((m) => m.poLineId)),
    [material],
  );
  const splitParentIds = useMemo(() => {
    const s = new Set();
    for (const p of pos) for (const l of p.lines || []) if (l.splitFromPoLineId) s.add(l.splitFromPoLineId);
    return s;
  }, [pos]);
  const lockOf = (row) => (row.id
    ? lineLockReason(
        (po?.lines || []).find((l) => l.id === row.id) || row,
        { hasMaterial: materialLineIds.has(row.id), isSplitParent: splitParentIds.has(row.id) },
      )
    : null);

  const productIndex = useMemo(() => {
    const m = new Map();
    for (const p of products) m.set(String(p.fgCode).trim().toLowerCase(), p);
    return m;
  }, [products]);
  const ppcForRow = (r) => ppcOf(r.known ? productIndex.get(String(r.fgCode).trim().toLowerCase()) : null);

  const totalQty = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);

  const submit = async () => {
    const { lines } = rowsToLines(rows, "piece", ppcForRow);
    if (!header.poNumber.trim()) { setError("ระบุเลขที่ PO"); return; }
    if (!lines.length) { setError("PO ต้องมีรายการสินค้าอย่างน้อย 1 (มีจำนวน > 0)"); return; }
    setBusy(true); setError("");
    try {
      await sahamitFetch(`/api/sahamit/po/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...header, poNumber: header.poNumber.trim(), dueDate: header.dueDate || null, lines }),
      });
      // กระทบยอด/วัสดุอ่านจากบรรทัด — แคชเดิมจะค้างถ้าไม่ล้าง
      apiCache.delete("/api/sahamit/po");
      apiCache.delete("/api/sahamit/material");
      router.push(`/sahamit/po/${id}`);
    } catch (e) { setError(e.message); setBusy(false); }
  };

  const shell = (body) => (
    <Workspace
      icon={<FileText size={22} />}
      title={po ? `แก้ไข PO ${po.poNumber}` : "แก้ไข PO"}
      subtitle="ฟอร์มเดียวกับตอนสร้าง · รายการที่ผูกวัสดุ/แบ่งส่ง/ส่งของแล้วจะถูกล็อก"
      back={{ href: `/sahamit/po/${id}`, label: "รายละเอียด PO" }}
    >
      {body}
    </Workspace>
  );

  if (!canEdit) {
    return shell(
      <div className="empty-state dashed" style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }}>
        <FileText size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
        <div style={{ fontWeight: 600, fontSize: 15 }}>ไม่มีสิทธิ์แก้ PO</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>บัญชีนี้ดูข้อมูลได้อย่างเดียว</div>
      </div>,
    );
  }
  if (loading && !po) return shell(<div style={{ padding: 24, color: "var(--text-3)" }}>กำลังโหลด...</div>);
  if (!po) return shell(<div style={{ padding: 24, color: "var(--red)" }}>ไม่พบ PO นี้</div>);

  return shell(
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 900 }}>
      <PoForm
        header={header}
        onHeader={(patch) => setHeader((h) => ({ ...h, ...patch }))}
        rows={rows}
        onRows={setRows}
        products={products}
        entryUnit="piece"
        onEntryUnit={() => {}}
        allowUnitToggle={false}
        lockOf={lockOf}
        disabled={busy}
      />
      {error && <div role="alert" style={{ color: "var(--red)", fontSize: 13 }}>{error}</div>}
      <div className="form-action-bar page">
        <span style={{ fontSize: 13, color: "var(--text-3)" }}>
          {rows.length ? `${rows.length} รายการ · รวม ${totalQty.toLocaleString("th-TH")} ชิ้น` : "ยังไม่มีรายการ"}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn" onClick={() => router.push(`/sahamit/po/${id}`)} disabled={busy}>ยกเลิก</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || !rows.length}>
            {busy ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
          </button>
        </div>
      </div>
    </div>,
  );
}
