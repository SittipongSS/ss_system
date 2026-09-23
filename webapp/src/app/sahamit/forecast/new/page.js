"use client";
import { useRouter } from "next/navigation";
import { LineChart } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import StatusNotice from "@/components/ui/StatusNotice";
import Button from "@/components/ui/Button";
import ForecastForm from "@/components/sahamit/ForecastForm";
import { useApiList } from "@/lib/excise/useApiList";
import { apiCache } from "@/lib/apiCache";
import { useCan } from "@/lib/roleContext";

// ลงรอบ FC ใหม่ — หน้าเต็ม. ฟอร์มมาจาก ForecastForm (ตัวเดียวกับหน้าแก้
// /sahamit/forecast/[id]/edit) ตามกฎ component เดียวสองโหมด.
export default function ForecastCreatePage() {
  const router = useRouter();
  const canEdit = useCan("sahamit:edit");
  const { data: products, loading: lProducts, error: productsError, staleError: productsStale, loaded: productsLoaded, reload: reloadProducts } = useApiList("/api/sahamit/products");
  const { data: rounds, loading: lRounds, error: roundsError, staleError: roundsStale, loaded: roundsLoaded, reload: reloadRounds } = useApiList("/api/sahamit/forecast/rounds");

  /* ── โหลดพัง = ห้ามเปิดฟอร์ม ไม่ใช่แค่ขึ้นป้ายเหนือฟอร์ม ──────────────────────
     ⭐ **ป้ายเดียวคลุมทั้งหน้า** — หน้านี้มีของชิ้นเดียวคือ `ForecastForm` และมันกิน
     สองลิสต์นี้พร้อมกัน ⇒ แยกป้ายรายลิสต์ก็ยังเป็นป้ายบนฟอร์มใบเดิม ไม่ได้ความชัดเพิ่ม

     ⚠️ **สองคำถามคนละข้อ** (กติกาเดียวกับ /tax/filings และจอสหมิตรที่เหลือ) —
       1. **ขึ้นป้ายไหม** = มี `error` ก็ขึ้นเสมอ · `apiCache` อยู่ระดับโมดูล อายุเท่าแท็บ
          ⇒ เปิดหน้ารายการมาก่อนแล้วเข้ามาที่นี่ = ฟอร์มได้ของจากแคชครบ กรอกได้ตามปกติ
          แต่ต้องบอกว่ารายชื่อสินค้า/รอบเดิมที่ฟอร์มใช้อยู่เป็นของรอบก่อน ไม่ใช่ล่าสุด
       2. **บล็อกไหม** = error **คู่กับ** ไม่มีของในมือ (`blocked`) เท่านั้น
          ที่ต้องบล็อกเพราะฟอร์มที่ไม่มีรายการสินค้าเลยยัง "ใช้งานได้" แบบหลอก ๆ:
          ปุ่ม "เพิ่มทุกสินค้า (0)" ดับ ทุกแถวที่พิมพ์เองติด ⚠ "ไม่รู้จัก" และถ้ากรอกเป็น
          "ลัง" ตัว `submit()` จะตีกลับว่า "สินค้ายังไม่ได้ตั้งชิ้นต่อลัง" — โทษข้อมูล
          สินค้าทั้งที่ความจริงคือลิสต์ยังโหลดไม่ขึ้น · `rounds` หาย ⇒ ตัวเตือนลงรอบซ้ำ
          วันเดียวกัน (`dupRound`) เงียบไปทั้งตัว

     🪤 "ว่าง" เฉย ๆ ไม่ใช่ข้อผิดพลาด — ระบบที่ยังไม่มีรอบเลยต้องลงรอบแรกได้ตามปกติ */
  /* 🪤 `empty` = **ไม่มีของในมือ** (`loaded` ของ useApiList) ไม่ใช่ `!list.length` —
     ระบบที่ยังไม่มีรอบเลยก็โหลด `[]` มาสำเร็จ นั่นคือคำตอบที่ใช้ได้ ไม่ใช่ความไม่รู้
     `staleError` = รอบเบื้องหลังล้มทั้งที่มีของอยู่ ⇒ ขึ้นป้ายว่าของเก่า แต่ไม่บล็อกฟอร์ม */
  const sources = [
    { label: "รายการสินค้า", error: productsError || productsStale, empty: !productsLoaded, reload: reloadProducts },
    { label: "รอบ FC ที่มีอยู่", error: roundsError || roundsStale, empty: !roundsLoaded, reload: reloadRounds },
  ];
  const failing = sources.filter((s) => s.error);
  const blocked = failing.filter((s) => s.empty);
  // 🪤 พ่วงทุกข้อความ ไม่ใช่ตัวแรก — ตัวที่ถูกทิ้งมักเป็นตัวที่บอกสาเหตุจริง
  const causes = [...new Set(failing.map((s) => s.error))].join(" · ");
  const loadError = failing.length
    ? `ดึงข้อมูลไม่ได้: ${failing.map((s) => s.label).join(" · ")} — ${blocked.length
      ? "ยังลงรอบ FC ไม่ได้ เพราะฟอร์มจะขาดสินค้าหรือตัวกันลงรอบซ้ำ"
      : "ฟอร์มกำลังใช้ข้อมูลรอบก่อน ไม่ใช่ล่าสุด"} · ${causes}`
    : null;
  // หน้านี้ไม่ได้ส่ง `loading` ให้ Workspace (ฟอร์มหายกลางคันไม่ได้) ⇒ ปุ่มต้องบอกเอง
  // ว่ากำลังลองอยู่ ไม่งั้นกดแล้วจอนิ่งสนิทและคนกดซ้ำรัว ๆ
  const retrying = lProducts || lRounds;
  const notice = loadError ? (
    <StatusNotice
      tone="error"
      className="mb-4"
      action={(
        <Button size="sm" variant="ghost" onClick={() => failing.forEach((s) => s.reload())} disabled={retrying}>
          {retrying ? "กำลังลองใหม่…" : "ลองใหม่"}
        </Button>
      )}
    >
      {loadError}
    </StatusNotice>
  ) : null;

  const done = (json) => {
    apiCache.delete("/api/sahamit/forecast/rounds");
    router.push(`/sahamit/forecast${json?.roundNo ? `?round=${json.roundNo}` : ""}`);
  };

  const shell = (body) => (
    <Workspace
      icon={<LineChart size={22} />}
      title="นำเข้ารอบ FC ใหม่"
      subtitle="รับ FC รายเดือนเป็นรอบ · กรอกจำนวนราย SKU × เดือน (ลูกค้า AR-109)"
      back={{ href: "/sahamit/forecast", label: "Forecast" }}
    >
      {body}
    </Workspace>
  );

  if (!canEdit) {
    return shell(
      <div className="empty-state dashed" style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }}>
        <LineChart size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
        <div style={{ fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-9)" }}>ไม่มีสิทธิ์ลงรอบ FC</div>
        <div style={{ fontSize: "var(--fs-7)", marginTop: 6 }}>บัญชีนี้ดูข้อมูลได้อย่างเดียว</div>
      </div>,
    );
  }

  // ไม่มีของในมือเลย = ปิดทางเข้าฟอร์ม เหลือแต่ป้าย (ป้ายที่เหลือขึ้นคู่กับฟอร์มด้านล่าง)
  if (blocked.length) return shell(notice);

  return shell(
    <>
      {notice}
      <ForecastForm
        products={products}
        editRound={null}
        existingRounds={rounds}
        onDone={done}
        onCancel={() => router.push("/sahamit/forecast")}
        onEditExisting={(r) => router.push(`/sahamit/forecast/${r.id}/edit`)}
      />
    </>,
  );
}
