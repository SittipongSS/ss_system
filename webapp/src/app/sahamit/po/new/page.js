"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import PoForm, { emptyPoHeader, rowsToLines } from "@/components/sahamit/PoForm";
import { useApiList } from "@/lib/excise/useApiList";
import { sahamitFetch } from "@/lib/sahamit/apiClient";
import { ppcOf } from "@/lib/sahamit/units";
import { useCan } from "@/lib/roleContext";

// สร้าง PO — หน้าเต็ม. ฟอร์มมาจาก PoForm (ตัวเดียวกับหน้าแก้ /sahamit/po/[id]/edit)
export default function PoCreatePage() {
  const router = useRouter();
  const canEdit = useCan("sahamit:edit");
  const { data: products } = useApiList("/api/sahamit/products");

  const [header, setHeader] = useState(emptyPoHeader);
  const [rows, setRows] = useState([]);
  const [entryUnit, setEntryUnit] = useState("piece");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const productIndex = useMemo(() => {
    const m = new Map();
    for (const p of products) m.set(String(p.fgCode).trim().toLowerCase(), p);
    return m;
  }, [products]);
  const ppcForRow = (r) => ppcOf(r.known ? productIndex.get(String(r.fgCode).trim().toLowerCase()) : null);

  const totalQty = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);

  const submit = async () => {
    const { lines, missingPpc } = rowsToLines(rows, entryUnit, ppcForRow);
    if (!header.poNumber.trim()) { setError("ระบุเลขที่ PO"); return; }
    if (entryUnit === "case" && missingPpc.length) {
      setError(`กรอกเป็นลังไม่ได้ — สินค้ายังไม่ได้ตั้ง "ชิ้นต่อลัง": ${missingPpc.join(", ")} (ตั้งที่ข้อมูลสินค้า หรือสลับหน่วยเป็นชิ้น)`);
      return;
    }
    if (!lines.length) { setError("เพิ่มรายการสินค้าอย่างน้อย 1 (มีจำนวน > 0)"); return; }
    setBusy(true); setError("");
    try {
      await sahamitFetch("/api/sahamit/po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...header, poNumber: header.poNumber.trim(), dueDate: header.dueDate || null, lines }),
      });
      router.push("/sahamit/po");
    } catch (e) { setError(e.message); setBusy(false); }
  };

  // viewer (ไม่มี sahamit:edit) เข้าหน้าสร้าง PO ไม่ได้ — โชว์ข้อความอย่างเดียว
  if (!canEdit) {
    return (
      <Workspace
        icon={<FileText size={22} />}
        title="บันทึก PO ใหม่"
        subtitle="กำหนดรับ + สถานที่ส่ง = ทั้ง PO · รายการใส่แค่จำนวน (ลูกค้า AR-109)"
        back={{ href: "/sahamit/po", label: "Purchase Orders" }}
      >
        <div className="empty-state dashed" style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }}>
          <FileText size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 600, fontSize: 15 }}>ไม่มีสิทธิ์สร้าง PO</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>บัญชีนี้ดูข้อมูลได้อย่างเดียว</div>
        </div>
      </Workspace>
    );
  }

  return (
    <Workspace
      icon={<FileText size={22} />}
      title="บันทึก PO ใหม่"
      subtitle="กำหนดรับ + สถานที่ส่ง = ทั้ง PO · รายการใส่แค่จำนวน (ลูกค้า AR-109)"
      back={{ href: "/sahamit/po", label: "Purchase Orders" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 900 }}>
        <PoForm
          header={header}
          onHeader={(patch) => setHeader((h) => ({ ...h, ...patch }))}
          rows={rows}
          onRows={setRows}
          products={products}
          entryUnit={entryUnit}
          onEntryUnit={setEntryUnit}
          disabled={busy}
        />
        {error && <div style={{ color: "var(--red)", fontSize: 13 }}>{error}</div>}
        <div className="form-action-bar page">
          <span style={{ fontSize: 13, color: "var(--text-3)" }}>
            {rows.length ? `${rows.length} รายการ · รวม ${totalQty.toLocaleString("th-TH")} ${entryUnit === "case" ? "ลัง" : "ชิ้น"}` : "ยังไม่มีรายการ"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn" onClick={() => router.push("/sahamit/po")} disabled={busy}>ยกเลิก</button>
            <button type="button" className="btn btn-primary px-6" onClick={submit} disabled={busy || !rows.length}>
              {busy ? "กำลังบันทึก..." : "บันทึก PO"}
            </button>
          </div>
        </div>
      </div>
    </Workspace>
  );
}
