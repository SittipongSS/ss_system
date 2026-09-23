"use client";
import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { LineChart } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import StatusNotice from "@/components/ui/StatusNotice";
import Button from "@/components/ui/Button";
import ForecastForm from "@/components/sahamit/ForecastForm";
import { useApiList } from "@/lib/excise/useApiList";
import { apiCache } from "@/lib/apiCache";
import { useCan } from "@/lib/roleContext";

// แก้รอบ FC — หน้าเต็ม ใช้ฟอร์มตัวเดียวกับหน้าลงรอบใหม่ (ForecastForm).
export default function ForecastEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;
  const canEdit = useCan("sahamit:edit");
  const { data: products, loading: lProducts, error: productsError, staleError: productsStale, loaded: productsLoaded, reload: reloadProducts } = useApiList("/api/sahamit/products");
  const { data: rounds, loading, error: roundsError, staleError: roundsStale, reload: reloadRounds } = useApiList("/api/sahamit/forecast/rounds");
  const round = useMemo(() => rounds.find((r) => r.id === id) || null, [rounds, id]);

  /* ── โหลดพัง = ห้ามเปิดฟอร์ม และต้องไม่ตอบว่า "ไม่พบรอบ" ────────────────────
     ⭐ **ป้ายเดียวคลุมทั้งหน้า** — มีของชิ้นเดียวคือ `ForecastForm` ที่กินสองลิสต์นี้
     พร้อมกัน (ท่าเดียวกับหน้าลงรอบใหม่ ซึ่งเป็นฟอร์มตัวเดียวกัน)

     🐞 กับดักเฉพาะหน้านี้: รอบที่จะแก้มาจาก `rounds.find(...)` ⇒ โหลดลิสต์ไม่สำเร็จ
     `rounds` ค้างที่ `[]` แล้ว `round` เป็น null ทุกครั้ง จอเดิมจึงตอบ "ไม่พบรอบ FC นี้"
     เป็นตัวแดง ซึ่งอ่านว่ารอบถูกลบไปแล้ว — ทั้งที่รอบยังอยู่ครบ แค่โหลดไม่ขึ้น
     ⇒ ตัวนี้ต้องตัดสิน **ก่อน** บรรทัด "ไม่พบรอบ FC นี้" เสมอ

     🪤 และ "มีของในมือ" ของหน้านี้ไม่ใช่ `rounds.length` แต่คือ **รอบใบนี้** —
     แคชระดับโมดูล (อายุเท่าแท็บ) ที่ถ่ายไว้ก่อนเพื่อนร่วมงานเพิ่มรอบใหม่ จะมีรอบอื่น
     เต็มลิสต์แต่ไม่มีใบที่เปิดอยู่ ⇒ ถ้าวัดด้วย `rounds.length` จะหลุดไปบรรทัด
     "ไม่พบรอบ FC นี้" อีกทางหนึ่ง ทั้งที่ของจริงคือรอบใหม่ยังโหลดไม่เข้ามา

     ⚠️ ป้ายกับการบล็อกคนละคำถาม: มี `error` = ขึ้นป้ายเสมอ (ฟอร์มที่กรอกจากแคชเก่า
     ต้องรู้ว่ามันเป็นของรอบก่อน) · บล็อกเฉพาะตอนไม่มีของที่หน้านี้ต้องใช้จริง ๆ
     — `products` หายทั้งลิสต์ก็แก้ไม่ได้เหมือนกัน: ทุกแถวติด ⚠ "ไม่รู้จัก" และถ้ากรอก
     เป็น "ลัง" ตัว `submit()` จะตีกลับว่า "สินค้ายังไม่ได้ตั้งชิ้นต่อลัง" ซึ่งโทษผิดตัว */
  /* 🪤 `empty` ของรายการสินค้า = **ไม่มีของในมือ** (`loaded` ของ useApiList) ไม่ใช่
     `!products.length` · ส่วนรอบ FC วัดด้วย `!round` ตามเหตุผลด้านบน (แคชเก่าที่มีรอบอื่น
     เต็มลิสต์แต่ไม่มีใบนี้ = ไม่มีของในมือ) · `staleError` = รอบเบื้องหลังล้มทั้งที่มีของอยู่
     ⇒ ขึ้นป้ายว่าเป็นของรอบก่อน แต่ไม่ปิดฟอร์ม
     ⭐ เหตุผลที่ "ยังทำอะไรไม่ได้" ผูกไว้กับ **สายที่ล้ม** ไม่ใช่ประโยคเดียวคลุมทุกกรณี —
     ของเดิมพูดว่า "(ไม่ได้แปลว่ารอบนี้ถูกลบไปแล้ว)" ทั้งที่หัวจอโชว์ชื่อรอบอยู่ชัด ๆ และ
     ตัวที่ล้มคือรายการสินค้า ⇒ ตอบคำถามที่ไม่มีใครถาม แถมกลบสาเหตุจริง */
  const sources = [
    {
      label: "รอบ FC", error: roundsError || roundsStale, empty: !round, reload: reloadRounds,
      blockedNote: "ยังแก้รอบ FC ไม่ได้ (ไม่ได้แปลว่ารอบนี้ถูกลบไปแล้ว)",
    },
    {
      label: "รายการสินค้า", error: productsError || productsStale, empty: !productsLoaded, reload: reloadProducts,
      blockedNote: "ยังแก้ไม่ได้เพราะไม่มีรายการสินค้าให้ตรวจรหัส/หน่วย",
    },
  ];
  const failing = sources.filter((s) => s.error);
  const blocked = failing.filter((s) => s.empty);
  // 🪤 พ่วงทุกข้อความ ไม่ใช่ตัวแรก — ตัวที่ถูกทิ้งมักเป็นตัวที่บอกสาเหตุจริง
  const causes = [...new Set(failing.map((s) => s.error))].join(" · ");
  const loadError = failing.length
    ? `ดึงข้อมูลไม่ได้: ${failing.map((s) => s.label).join(" · ")} — ${blocked.length
      ? blocked.map((s) => s.blockedNote).join(" · ")
      : "ฟอร์มกำลังใช้ข้อมูลรอบก่อน ไม่ใช่ล่าสุด"} · ${causes}`
    : null;
  // หน้านี้ไม่ได้ส่ง `loading` ให้ Workspace (ฟอร์มหายกลางคันไม่ได้) ⇒ ปุ่มต้องบอกเอง
  // ว่ากำลังลองอยู่ ไม่งั้นกดแล้วจอนิ่งสนิทและคนกดซ้ำรัว ๆ
  const retrying = loading || lProducts;
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

  const done = () => {
    apiCache.delete("/api/sahamit/forecast/rounds");
    router.push(`/sahamit/forecast${round?.roundNo ? `?round=${round.roundNo}` : ""}`);
  };

  const shell = (body) => (
    <Workspace
      icon={<LineChart size={22} />}
      title={round ? `แก้ FC รอบที่ ${round.roundNo}` : "แก้ไขรอบ FC"}
      subtitle="ฟอร์มเดียวกับตอนลงรอบใหม่ (ลูกค้า AR-109)"
      back={{ href: "/sahamit/forecast", label: "Forecast" }}
    >
      {body}
    </Workspace>
  );

  if (!canEdit) {
    return shell(
      <div className="empty-state dashed" style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }}>
        <LineChart size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
        <div style={{ fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-9)" }}>ไม่มีสิทธิ์แก้รอบ FC</div>
        <div style={{ fontSize: "var(--fs-7)", marginTop: 6 }}>บัญชีนี้ดูข้อมูลได้อย่างเดียว</div>
      </div>,
    );
  }
  if (loading && !round) return shell(<div style={{ padding: 24, color: "var(--text-3)" }}>กำลังโหลด...</div>);
  // ⚠️ ต้องอยู่เหนือ "ไม่พบรอบ FC นี้" — ดูเหตุผลที่คอมเมนต์ด้านบน
  if (blocked.length) return shell(notice);
  if (!round) return shell(<div style={{ padding: 24, color: "var(--red)" }}>ไม่พบรอบ FC นี้</div>);

  return shell(
    <>
      {notice}
      <ForecastForm
        products={products}
        editRound={round}
        existingRounds={rounds}
        onDone={done}
        onCancel={() => router.push("/sahamit/forecast")}
      />
    </>,
  );
}
