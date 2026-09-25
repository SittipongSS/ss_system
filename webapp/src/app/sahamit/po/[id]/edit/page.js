"use client";
// แก้ PO — หน้าเต็ม ใช้ฟอร์มตัวเดียวกับหน้าสร้าง (PoForm) ตามมติผู้ใช้ 2026-07-17
// ต่างกันแค่: บรรทัดที่ผูกแล้ว (เชื่อมดีล/วัสดุ/แบ่งส่ง/ส่งของแล้ว) ถูกล็อก และกรอกได้
// เฉพาะหน่วยชิ้น (ค่าใน DB เป็นชิ้น — สลับเป็นลังจะทำให้เลขที่โหลดมาเปลี่ยนความหมาย)
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import StatusNotice from "@/components/ui/StatusNotice";
import Button from "@/components/ui/Button";
import PoForm, { emptyPoHeader, poToForm, rowsToLines } from "@/components/sahamit/PoForm";
import { useApiList } from "@/lib/excise/useApiList";
import { sourcesFailureDetail } from "@/lib/ui/loadFailure";
import { sahamitFetch } from "@/lib/sahamit/apiClient";
import { apiCache } from "@/lib/apiCache";
import { lineLockReason } from "@/lib/sahamit/poEdit";
import { ppcOf } from "@/lib/sahamit/units";
import { useCan } from "@/lib/roleContext";
import { fmtNumber } from "@/lib/format";

export default function PoEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;
  const canEdit = useCan("sahamit:edit");
  const { data: pos, loading, error: posError, staleError: posStale, errorDetail: posDetail, reload: reloadPos } = useApiList("/api/sahamit/po");
  const { data: products, loading: lProducts, error: productsError, staleError: productsStale, errorDetail: productsDetail, loaded: productsLoaded, reload: reloadProducts } = useApiList("/api/sahamit/products");
  const { data: material, loading: lMaterial, error: materialError, staleError: materialStale, errorDetail: materialDetail, loaded: materialLoaded, reload: reloadMaterial } = useApiList("/api/sahamit/material");
  const po = useMemo(() => pos.find((p) => p.id === id) || null, [pos, id]);

  /* ── โหลดพัง = ห้ามเปิดฟอร์ม และต้องไม่ตอบว่า "ไม่พบ PO นี้" ─────────────────────
     ท่าเดียวกับหน้าแก้รอบ FC (sahamit/forecast/[id]/edit) — ป้ายเดียวคลุมทั้งหน้า เพราะของบนหน้ามีชิ้นเดียว
     คือ `PoForm` ที่กินสามลิสต์นี้พร้อมกัน

     🐞 กับดักเฉพาะหน้านี้: PO ที่จะแก้มาจาก `pos.find(...)` ⇒ โหลดลิสต์ไม่สำเร็จ `pos` ค้างที่ `[]`
     แล้ว `po` เป็น null ทุกครั้ง จอเดิมจึงตอบ "ไม่พบ PO นี้" เป็นตัวแดง ซึ่งอ่านว่า PO ถูกลบไปแล้ว
     — ทั้งที่ PO ยังอยู่ครบ แค่โหลดไม่ขึ้น ⇒ ทางแยกนี้ต้องตัดสิน **ก่อน** บรรทัด "ไม่พบ PO นี้" เสมอ
     🪤 "มีของในมือ" ของสาย PO คือ **PO ใบนี้** (`!po`) ไม่ใช่ `pos.length` — แคชระดับโมดูลที่ถ่ายไว้ก่อน
        เพื่อนร่วมงานลง PO ใหม่ มี PO อื่นเต็มลิสต์แต่ไม่มีใบที่เปิดอยู่
     ⭐ สองลิสต์รองก็บล็อกฟอร์มเมื่อไม่เคยโหลดสำเร็จ (`loaded`) — ฟอร์มที่กรอกได้แต่บันทึกไม่ได้/บันทึกผิด
        แย่กว่าฟอร์มที่บอกตรง ๆ ว่ายังเปิดไม่ได้:
        · รายการสินค้าหาย ⇒ ช่องเลือกสินค้าว่าง รหัสที่พิมพ์เพิ่มติด ⚠ "ไม่รู้จัก" และมูลค่าทุกบรรทัด/ยอดรวม/VAT
          ขึ้น ฿0.00 (ราคาอ่านจากรายการสินค้า) = ตัวเลข 0 ที่มาจากความไม่รู้
        · สถานะวัสดุหาย ⇒ บรรทัดที่ผูกวัสดุแล้วไม่ถูกล็อก ดูเหมือนแก้ได้ แต่เซิร์ฟเวอร์ตีกลับ 409 ทั้งคำขอ
          (lineLockReason ตัวเดียวกัน) ⇒ ผู้ใช้กรอกฟอร์มทั้งใบที่บันทึกไม่ได้
     ⚠️ ป้ายกับการบล็อกคนละคำถาม: มี `error` (หรือรอบเบื้องหลังล้ม `staleError`) = ขึ้นป้ายเสมอ ·
        บล็อกเฉพาะตอนไม่มีของในมือ — มีแคชอยู่ก็กรอกต่อได้ ป้ายบอกว่าเป็นของรอบก่อน (เซิร์ฟเวอร์ยังเป็นด่านจริง)
     ⭐ เหตุผลที่ "ยังแก้ไม่ได้" ผูกไว้กับ **สายที่ล้ม** — "(ไม่ได้แปลว่า PO นี้ถูกลบไปแล้ว)" พูดเฉพาะตอนสาย PO ล้ม
        ไม่ใช่ตอนหัวจอโชว์เลข PO อยู่ชัด ๆ แล้วตัวที่ล้มคือรายการสินค้า
     ⭐ **สายไหนบล็อกอะไร** — สาย PO (`blocks: "page"`) ตัดสินว่ามี PO ใบนี้ไหม ⇒ ทางแยกของมันอยู่ **เหนือ** "ไม่พบ PO นี้"
        · สองสายรอง (`blocks: "form"`) พักแค่ฟอร์ม ⇒ ทางแยกของมันอยู่ **ใต้** "ไม่พบ PO นี้": ลิสต์ PO ตอบแล้วว่าไม่มีใบนี้
        คือไม่มีใบนี้จริง — ป้าย "ยังแก้ไม่ได้เพราะไม่มีรายการสินค้า" ใต้หัว "แก้ไข PO" จะอ่านว่ามี PO ให้แก้ ซึ่งไม่จริง
     🪤 `empty` ของสาย PO = ไม่มีใบในมือ **และรอบหน้าบ้านล่าสุดล้ม** (`posError`) ไม่ใช่ `staleError` — รอบเบื้องหลังล้มได้
        ก็ต่อเมื่อรอบหน้าบ้านก่อนหน้าสำเร็จแล้ว และรอบนั้นตอบไปแล้วว่าไม่มีใบนี้ ⇒ "ไม่พบ PO นี้" ที่ยืนยันแล้วต้องไม่พลิกเป็น
        "(ไม่ได้แปลว่า PO นี้ถูกลบไปแล้ว)" เพราะสลับแท็บแล้วเน็ตสะดุด
     ⭐ `pending` = สายรองที่ไม่เคยโหลดสำเร็จและยังโหลดอยู่ — ฟอร์มที่เปิดตอนนี้ได้บรรทัดที่ต้องล็อกแต่ไม่ล็อก/ราคา ฿0.00
        เหมือนตอนล้ม (ค่าที่พิมพ์ลงไปค้างใน `rows` หลังลิสต์มาถึง แล้วบันทึกโดน 409) ⇒ รอให้ครบก่อนเปิดฟอร์ม */
  const sources = [
    {
      label: "PO", error: posError || posStale, empty: !po && !!posError, detail: posDetail, reload: reloadPos, blocks: "page",
      blockedNote: "ยังแก้ PO นี้ไม่ได้ (ไม่ได้แปลว่า PO นี้ถูกลบไปแล้ว)",
    },
    {
      label: "รายการสินค้า", error: productsError || productsStale, empty: !productsLoaded, detail: productsDetail, reload: reloadProducts, blocks: "form",
      pending: lProducts && !productsLoaded,
      blockedNote: "ยังแก้ไม่ได้เพราะไม่มีรายการสินค้าให้ตรวจรหัสและราคา",
    },
    {
      label: "สถานะวัสดุ", error: materialError || materialStale, empty: !materialLoaded, detail: materialDetail, reload: reloadMaterial, blocks: "form",
      pending: lMaterial && !materialLoaded,
      blockedNote: "ยังแก้ไม่ได้เพราะยังไม่รู้ว่าบรรทัดไหนผูกวัสดุแล้วต้องล็อก",
    },
  ];
  const failing = sources.filter((s) => s.error);
  const blocked = failing.filter((s) => s.empty);
  const pageBlocked = blocked.some((s) => s.blocks === "page");
  const formPending = sources.some((s) => s.pending);
  // 🪤 พ่วงทุกข้อความ ไม่ใช่ตัวแรก — ตัวที่ถูกทิ้งมักเป็นตัวที่บอกสาเหตุจริง
  const causes = [...new Set(failing.map((s) => s.error))].join(" · ");
  const loadError = failing.length
    ? `ดึงข้อมูลไม่ได้: ${failing.map((s) => s.label).join(" · ")} — ${blocked.length
      ? blocked.map((s) => s.blockedNote).join(" · ")
      : "ฟอร์มกำลังใช้ข้อมูลรอบก่อน ไม่ใช่ล่าสุด"} · ${causes}`
    : null;
  // ⭐ สตริงดิบของทุกสายที่ล้ม — บรรทัดรองของกล่อง (มติ 23/09 "ไทยนำ + ดิบเป็นบรรทัดเล็ก")
  const loadErrorDetail = sourcesFailureDetail(failing);
  // หน้านี้ไม่ได้ส่ง `loading` ให้ Workspace (ฟอร์มหายกลางคันไม่ได้) ⇒ ปุ่มต้องบอกเองว่ากำลังลองอยู่
  const retrying = loading || lProducts || lMaterial;
  const notice = loadError ? (
    <StatusNotice
      tone="error"
      detail={loadErrorDetail}
      action={(
        <Button size="sm" variant="ghost" onClick={() => failing.forEach((s) => s.reload())} disabled={retrying}>
          {retrying ? "กำลังลองใหม่…" : "ลองใหม่"}
        </Button>
      )}
    >
      {loadError}
    </StatusNotice>
  ) : null;

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
  // ของบรรทัดลูกใน PO ยอดเหลือ; เชื่อมดีล/QT แล้วดูจาก settledLineIds ที่ API list
  // คำนวณราย poLineId มาให้ (กติกาเดียวกับฝั่ง server — server บังคับซ้ำอยู่ดี)
  const materialLineIds = useMemo(
    () => new Set(material.filter((m) => m.tracking).map((m) => m.poLineId)),
    [material],
  );
  const splitParentIds = useMemo(() => {
    const s = new Set();
    for (const p of pos) for (const l of p.lines || []) if (l.splitFromPoLineId) s.add(l.splitFromPoLineId);
    return s;
  }, [pos]);
  const settledLineIds = useMemo(() => new Set(po?.settledLineIds || []), [po]);
  const lockOf = (row) => (row.id
    ? lineLockReason(
        (po?.lines || []).find((l) => l.id === row.id) || row,
        {
          hasMaterial: materialLineIds.has(row.id),
          isSplitParent: splitParentIds.has(row.id),
          isSettled: settledLineIds.has(row.id),
        },
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
      icon={<ShoppingCart size={22} />}
      title={po ? `แก้ไข PO ${po.poNumber}` : "แก้ไข PO"}
      subtitle="ฟอร์มเดียวกับตอนสร้าง · รายการที่เชื่อมดีล/ผูกวัสดุ/แบ่งส่ง/ส่งของแล้วจะถูกล็อก"
      back={{ href: `/sahamit/po/${id}`, label: "รายละเอียด PO" }}
    >
      {body}
    </Workspace>
  );

  if (!canEdit) {
    return shell(
      <div className="empty-state dashed" style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }}>
        <ShoppingCart size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
        <div style={{ fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-9)" }}>ไม่มีสิทธิ์แก้ PO</div>
        <div style={{ fontSize: "var(--fs-7)", marginTop: 6 }}>บัญชีนี้ดูข้อมูลได้อย่างเดียว</div>
      </div>,
    );
  }
  // ใช้สองที่ (ลิสต์ PO ยังไม่มา · สายรองยังไม่มา) — ประกาศครั้งเดียว
  const loadingBody = <div style={{ padding: 24, color: "var(--text-3)" }}>กำลังโหลด...</div>;
  if (loading && !po) return shell(loadingBody);
  // ⚠️ ต้องอยู่เหนือ "ไม่พบ PO นี้" — ดูเหตุผลที่คอมเมนต์ก้อน sources
  if (pageBlocked) return shell(notice);
  if (!po) return shell(<div style={{ padding: 24, color: "var(--red)" }}>ไม่พบ PO นี้</div>);
  // สายรองไม่เคยโหลดสำเร็จ — ล้ม = ป้าย (ปุ่มลองใหม่บอกสถานะเอง) · ยังโหลดอยู่ = รอ · ทั้งสองทางฟอร์มยังไม่เปิด
  if (blocked.length) return shell(notice);
  if (formPending) return shell(loadingBody);

  return shell(
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 900 }}>
      {notice}
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
      {error && <div role="alert" style={{ color: "var(--red)", fontSize: "var(--fs-7)" }}>{error}</div>}
      <div className="form-action-bar is-page">
        <span style={{ fontSize: "var(--fs-7)", color: "var(--text-3)" }}>
          {rows.length ? `${rows.length} รายการ · รวม ${fmtNumber(totalQty)} ชิ้น` : "ยังไม่มีรายการ"}
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
