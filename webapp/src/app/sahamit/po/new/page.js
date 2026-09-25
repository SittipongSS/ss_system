"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import StatusNotice from "@/components/ui/StatusNotice";
import Button from "@/components/ui/Button";
import PoForm, { emptyPoHeader, rowsToLines } from "@/components/sahamit/PoForm";
import { useApiList } from "@/lib/excise/useApiList";
import { sourcesFailureDetail } from "@/lib/ui/loadFailure";
import { sahamitFetch } from "@/lib/sahamit/apiClient";
import { ppcOf } from "@/lib/sahamit/units";
import { useCan } from "@/lib/roleContext";
import { fmtNumber } from "@/lib/format";

// สร้าง PO — หน้าเต็ม. ฟอร์มมาจาก PoForm (ตัวเดียวกับหน้าแก้ /sahamit/po/[id]/edit)
export default function PoCreatePage() {
  const router = useRouter();
  const canEdit = useCan("sahamit:edit");
  const { data: products, loading: lProducts, error: productsError, staleError: productsStale, errorDetail: productsDetail, loaded: productsLoaded, reload: reloadProducts } = useApiList("/api/sahamit/products");

  /* ── รายการสินค้าไม่เคยโหลดขึ้น = ห้ามเปิดฟอร์ม ไม่ใช่แค่ขึ้นป้ายเหนือฟอร์ม ─────────────
     ท่าเดียวกับหน้าแก้ PO (sahamit/po/[id]/edit — ฟอร์ม PoForm ตัวเดียวกัน) และหน้าลงรอบ FC ใหม่
     🐞 ทรงเดิม: แกะแค่ `data` ⇒ `/api/sahamit/products` ล้มเมื่อไร `products` ค้างที่ `[]` แล้วฟอร์มยัง "ใช้ได้" แบบหลอก ๆ
        · ช่องค้นหาสินค้าว่างเปล่า = อ่านว่าไม่มีสินค้าให้เลือก
        · รหัสที่พิมพ์เองติด ⚠ "ไม่รู้จัก" ทุกแถว + แถบ "มีรหัสที่ไม่รู้จัก (บันทึกได้ แต่ยังไม่ผูกสินค้า)" — ไม่จริง
          (เซิร์ฟเวอร์ผูกสินค้าจากรหัสเองตอนบันทึก) · ราคา/มูลค่า/ยอดรวมหายเป็นขีดทั้งใบ
        · กรอกเป็น "ลัง" แล้วกดบันทึก ⇒ ตีกลับว่า "สินค้ายังไม่ได้ตั้งชิ้นต่อลัง" — โทษข้อมูลสินค้า ทั้งที่ความจริงคือลิสต์โหลดไม่ขึ้น
        ⇒ ฟอร์มที่กรอกได้แต่บอกเรื่องไม่จริงแย่กว่าฟอร์มที่บอกตรง ๆ ว่ายังเปิดไม่ได้
     ⚠️ ป้ายกับการบล็อกคนละคำถาม: มี `error` (หรือรอบเบื้องหลังล้ม `staleError`) = ขึ้นป้ายเสมอ ·
        บล็อกเฉพาะตอนไม่เคยโหลดสำเร็จ (`loaded`) — มีแคชอยู่ก็กรอกต่อได้ ป้ายบอกว่าเป็นของรอบก่อน (เซิร์ฟเวอร์ยังเป็นด่านจริง)
     🪤 `empty` = **ไม่มีของในมือ** (`!loaded`) ไม่ใช่ `!products.length` — ลิสต์ที่โหลดสำเร็จแล้วตอบ `[]` คือคำตอบที่ใช้ได้
     ⭐ `pending` = ไม่เคยโหลดสำเร็จและยังโหลดอยู่ — ฟอร์มที่เปิดตอนนี้ได้ ⚠ "ไม่รู้จัก" กับราคาขีดเหมือนตอนล้ม
        (แถวที่เพิ่มไว้ค้าง `known: false` ต่อแม้ลิสต์จะมาถึงทีหลัง) ⇒ รอให้ครบก่อนเปิดฟอร์ม
     ⚠️ ไม่มีทางที่ฟอร์มจะถูกซ่อนทับของที่พิมพ์ค้างไว้: `loaded` เป็น true แล้วไม่กลับเป็น false (URL คงที่) ⇒ บล็อกได้
        แค่ก่อนฟอร์มเคยเปิด · รอบที่ล้มหลังจากนั้นเป็นแค่ป้าย "ของรอบก่อน" */
  const sources = [
    {
      label: "รายการสินค้า", error: productsError || productsStale, empty: !productsLoaded, detail: productsDetail, reload: reloadProducts,
      pending: lProducts && !productsLoaded,
      blockedNote: "ยังบันทึก PO ใหม่ไม่ได้ เพราะไม่มีรายการสินค้าให้เลือกและตรวจรหัส/ราคา",
    },
  ];
  const failing = sources.filter((s) => s.error);
  const blocked = failing.filter((s) => s.empty);
  const formPending = sources.some((s) => s.pending);
  // 🪤 พ่วงทุกข้อความ ไม่ใช่ตัวแรก — ตัวที่ถูกทิ้งมักเป็นตัวที่บอกสาเหตุจริง
  const causes = [...new Set(failing.map((s) => s.error))].join(" · ");
  const loadError = failing.length
    ? `ดึงข้อมูลไม่ได้: ${failing.map((s) => s.label).join(" · ")} — ${blocked.length
      ? blocked.map((s) => s.blockedNote).join(" · ")
      : "ฟอร์มกำลังใช้รายการสินค้ารอบก่อน ไม่ใช่ล่าสุด"} · ${causes}`
    : null;
  // ⭐ สตริงดิบของทุกสายที่ล้ม — บรรทัดรองของกล่อง (มติ 23/09 "ไทยนำ + ดิบเป็นบรรทัดเล็ก")
  const loadErrorDetail = sourcesFailureDetail(failing);
  // ตอนป้ายบล็อกฟอร์ม เนื้อหน้าไม่ได้เข้า skeleton (ป้ายคือเนื้อ) ⇒ ปุ่มต้องบอกเองว่ากำลังลองอยู่ ไม่งั้นคนกดซ้ำรัว ๆ
  const retrying = lProducts;
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
  const [entryUnit, setEntryUnit] = useState("piece");
  // บันทึกย้อนหลัง: PO ที่ส่งของครบไปแล้ว → ทุกบรรทัดขึ้น 'delivered' + วันที่ส่งมอบจริง
  const [backfill, setBackfill] = useState({ delivered: false, deliveredDate: "" });
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
        body: JSON.stringify({
          ...header, poNumber: header.poNumber.trim(), dueDate: header.dueDate || null, lines,
          delivered: backfill.delivered,
          deliveredDate: backfill.delivered ? (backfill.deliveredDate || null) : null,
        }),
      });
      router.push("/sahamit/po");
    } catch (e) { setError(e.message); setBusy(false); }
  };

  // `loading` = เนื้อเป็น skeleton (ใช้ตอนรอรายการสินค้ารอบแรก) — หัวจอกับทางกลับยังอยู่
  const shell = (body, loading = false) => (
    <Workspace
      icon={<ShoppingCart size={22} />}
      title="บันทึก PO ใหม่"
      subtitle="กำหนดรับ + สถานที่ส่ง = ทั้ง PO · รายการใส่แค่จำนวน (ลูกค้า AR-109)"
      back={{ href: "/sahamit/po", label: "Purchase Orders" }}
      loading={loading}
    >
      {body}
    </Workspace>
  );

  // viewer (ไม่มี sahamit:edit) เข้าหน้าสร้าง PO ไม่ได้ — โชว์ข้อความอย่างเดียว
  if (!canEdit) {
    return shell(
      <div className="empty-state dashed" style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }}>
        <ShoppingCart size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
        <div style={{ fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-9)" }}>ไม่มีสิทธิ์สร้าง PO</div>
        <div style={{ fontSize: "var(--fs-7)", marginTop: 6 }}>บัญชีนี้ดูข้อมูลได้อย่างเดียว</div>
      </div>,
    );
  }

  // ไม่มีรายการสินค้าในมือเลย = ปิดทางเข้าฟอร์ม เหลือแต่ป้าย (ป้ายของรอบก่อนขึ้นคู่กับฟอร์มด้านล่าง)
  if (blocked.length) return shell(notice);
  if (formPending) return shell(null, true);

  return shell(
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 900 }}>
      {notice}
      <PoForm
        header={header}
        onHeader={(patch) => setHeader((h) => ({ ...h, ...patch }))}
        rows={rows}
        onRows={setRows}
        products={products}
        entryUnit={entryUnit}
        onEntryUnit={setEntryUnit}
        backfill={backfill}
        onBackfill={(patch) => setBackfill((b) => ({ ...b, ...patch }))}
        disabled={busy}
      />
      {error && <div style={{ color: "var(--red)", fontSize: "var(--fs-7)" }}>{error}</div>}
      <div className="form-action-bar is-page">
        <span style={{ fontSize: "var(--fs-7)", color: "var(--text-3)" }}>
          {rows.length ? `${rows.length} รายการ · รวม ${fmtNumber(totalQty)} ${entryUnit === "case" ? "ลัง" : "ชิ้น"}` : "ยังไม่มีรายการ"}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn" onClick={() => router.push("/sahamit/po")} disabled={busy}>ยกเลิก</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || !rows.length}>
            {busy ? "กำลังบันทึก..." : "บันทึก PO"}
          </button>
        </div>
      </div>
    </div>,
  );
}
