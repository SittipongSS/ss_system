"use client";
// ── แท็บ "งานบริการ" ของใบสั่งขาย (PR-F · แผน §3.4) ─────────────────────────
//
// ⭐ ตอบสามคำถามที่ฝ่ายขายถามจริงเวลาเปิดใบบริการ:
//   ของที่ขายไป **ลงโซนครบหรือยัง** · ไซต์ **วางรอบแล้วหรือยัง** · **เดินไปกี่รอบแล้ว**
//
// ⚠️ **โหลดตอนกดเข้าแท็บเท่านั้น** — ข้อมูลชุดนี้ยิงถึง 5 ตาราง และใบส่วนใหญ่ในระบบ
//   เป็นสายสินค้าซึ่งไม่มีแท็บนี้เลย ⇒ ยัดรวมใน GET ของใบ = ทุกคนจ่ายค่าคิวรีที่ไม่ได้ใช้
//
// ⚠️ เหตุที่นัดติดด่านมาจาก `evaluateVisitGate` ตัวเดียวกับที่ตารางจัดคิวของ TS ใช้ —
//   ห้ามเขียนคำอธิบายเองที่นี่ ไม่งั้นสองจอบอกคนละเรื่อง (โรคเดิมของโมดูลนี้)
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck2, MapPin, PackageCheck, Repeat } from "lucide-react";
import { DetailCard } from "@/components/ui/DetailPage";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import SkeletonRows from "@/components/ui/Skeleton";
import { TableScroll } from "@/components/ui/Table";
import ServicePlanModal from "@/components/service/ServicePlanModal";
import { canBeServiceAssignee, canEditService } from "@/lib/permissions";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { notifyToast } from "@/lib/feedback";
import { fmtNumber, naText, NA } from "@/lib/format";
import { apiFetch } from "@/lib/apiFetch";

export default function SalesOrderServiceTab({ orderId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  /* ⭐ **ปุ่มวางรอบเป็นของฝ่ายบริการ ไม่ใช่ของฝ่ายขาย** — มติผู้ใช้ 2026-08-30
     ("ระบบธุรกิจบริการ เข้าใช้ได้เฉพาะ TS") ยังยืนอยู่ และ `POST /api/service/plans`
     บังคับ `canEditService` อยู่แล้ว ⇒ ถามด่านตัวเดียวกันที่จอ: ฝ่ายขายเห็นตารางสรุป
     เหมือนเดิมแต่ไม่มีปุ่ม (กติกา "ไม่มีสิทธิ์ = ไม่โชว์") ส่วน TS/แอดมินที่เปิดใบนี้อยู่
     วางรอบได้เลยไม่ต้องเด้งไปหน้าไซต์แล้วเดินกลับมา
     ⚠️ ประกอบ user จากสี่ context ให้ครบ — `canEditService` อ่าน department ซึ่ง
        `useRole()` ตัวเดียวตอบไม่ได้ (ท่าเดียวกับหน้าไซต์) */
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const canPlan = useMemo(
    () => canEditService({ role, team, teams, department }),
    [role, team, teams, department],
  );
  const [planSite, setPlanSite] = useState(null);   // ไซต์ที่กำลังวางรอบ · null = ปิด
  const [technicians, setTechnicians] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/sales-planning/sales-orders/${orderId}/service`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "โหลดสรุปงานบริการไม่สำเร็จ");
      setData(body);
    } catch (e) {
      setError(e.message || "โหลดสรุปงานบริการไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [orderId]);
  useEffect(() => { load(); }, [load]);

  // รายชื่อเจ้าหน้าที่โหลดเมื่อจะ "เลือก" เท่านั้น (ท่าเดียวกับหน้าไซต์)
  useEffect(() => {
    if (!planSite || technicians.length) return;
    (async () => {
      try {
        const res = await apiFetch("/api/pm/assignable-users");
        const rows = await res.json().catch(() => null);
        if (!res.ok) throw new Error(rows?.error || "โหลดรายชื่อเจ้าหน้าที่บริการไม่สำเร็จ");
        setTechnicians((Array.isArray(rows) ? rows : []).filter(canBeServiceAssignee));
      } catch (e) {
        notifyToast.error(e.message);
      }
    })();
  }, [planSite, technicians.length]);

  /* วางรอบใหม่เท่านั้น — การ *แก้* รอบเดิมยังอยู่ที่หน้าไซต์ ซึ่งเป็นที่ที่เห็นรอบทั้งหมด
     ของไซต์นั้นพร้อมกัน · ที่นี่เห็นแค่ไซต์ที่ใบนี้ลงไป จะแก้ของที่มองไม่เห็นไม่ได้
     ⚠️ กด **สร้างนัดทันที** (route gen ให้เอง) ⇒ กล่องยืนยันของโมดัลต้องบอกไว้แล้ว */
  const savePlan = async (form) => {
    const res = await apiFetch("/api/service/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || "บันทึกไม่สำเร็จ");
    const count = Array.isArray(body?.generated) ? body.generated.length : 0;
    notifyToast.success(count ? `วางรอบแล้ว · สร้างนัดให้ ${count} ครั้ง` : "วางรอบแล้ว · ยังไม่มีนัดที่ต้องสร้าง");
    await load();
  };

  if (loading) return <DetailCard icon={MapPin} title="งานบริการของใบนี้"><SkeletonRows rows={4} /></DetailCard>;
  if (error) return <StatusNotice tone="error" title="โหลดสรุปงานบริการไม่สำเร็จ">{error}</StatusNotice>;
  if (!data) return null;

  const { allocation, plans, visits, rounds } = data;

  return (
    <>
      {/* ── 1. ของที่ขายไปลงโซนครบหรือยัง ─────────────────────────────── */}
      <DetailCard
        icon={PackageCheck}
        eyebrow="ALLOCATION"
        title="การจัดสรรลงโซน"
        meta={allocation.complete
          ? `ลงครบแล้ว ${allocation.sites.length} ไซต์`
          : `ยังเหลือ ${fmtNumber(allocation.remaining)} หน่วยที่ยังไม่ได้ลงโซน`}
      >
        {/* ⚠️ นับ FG + จำนวน ไม่ใช่จำนวนบรรทัด — บรรทัดเป็นรูปร่างของเอกสารขาย
            ไม่ใช่ขนาดของงาน (มติผู้ใช้ 2026-08-29 · เกณฑ์เดียวกับคิวรับงานของ TS) */}
        <TableScroll surface="embedded" cells="stacked" minWidth={640}>
          <table className="w-full text-sm">
            <thead><tr>
              <th>รายการที่ขาย</th>
              <th className="num">ขายไว้</th>
              <th className="num">ยังไม่ลงโซน</th>
            </tr></thead>
            <tbody>
              {allocation.fg.map((group) => (
                <tr key={group.key} className="premium-row">
                  <td>
                    {group.fgCode ? <span className="mono">{group.fgCode}</span> : null}
                    <span className="cell-sub cell-ellipsis">{naText(group.description)}</span>
                  </td>
                  <td className="num mono">{fmtNumber(group.qty)} {group.unit || ""}</td>
                  <td className={`num mono ${group.remaining > 0 ? "cell-num-bad" : "cell-num-ok"}`}>
                    {group.remaining > 0 ? fmtNumber(group.remaining) : "ครบ"}
                  </td>
                </tr>
              ))}
              {!allocation.fg.length && (
                <tr><td colSpan={3} className="cell-num-idle">ใบนี้ยังไม่มีรายการที่ต้องจัดสรร</td></tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      </DetailCard>

      {/* ── 2. ไซต์ที่ใบนี้ลงไปแล้ว + สถานะรอบ ────────────────────────── */}
      <DetailCard
        icon={MapPin}
        eyebrow="SITES"
        title="ไซต์ที่งานนี้ลงไป"
        meta={plans.sitesWithoutPlan
          ? `${plans.sitesWithoutPlan} ไซต์ยังไม่มีรอบบริการ — ฝ่ายบริการต้องวางรอบก่อนถึงจะมีนัด`
          : `วางรอบครบแล้ว ${plans.total} รอบ`}
      >
        <TableScroll surface="embedded" cells="stacked" minWidth={640}>
          <table className="w-full text-sm">
            <thead><tr>
              <th>ไซต์ / ลูกค้า</th>
              <th>โซนที่ผูก</th>
              <th className="num">จำนวนที่ลง</th>
              <th>รอบบริการ</th>
              <th aria-label="การกระทำ" />
            </tr></thead>
            <tbody>
              {allocation.sites.map((row) => (
                <tr key={row.siteId} className="premium-row">
                  <td>
                    {naText(row.site?.name)}
                    <span className="cell-sub">{naText(row.site?.customerName)}</span>
                  </td>
                  <td className="cell-ellipsis">{row.zones.map((z) => z.name).join(" · ") || NA}</td>
                  <td className="num mono">{row.packageQty ? fmtNumber(row.packageQty) : NA}</td>
                  {/* ⭐ **ยอดรวมบนหัวการ์ดตอบไม่ได้ว่าไซต์ไหนคือไซต์ที่ค้าง** — เดิมบอกแค่
                      "N ไซต์ยังไม่มีรอบ" แล้วปล่อยให้ไล่เปิดทีละไซต์เอง */}
                  {/* 🔴 **สามสภาพ ไม่ใช่สอง** — ไซต์ที่มีรอบของ *ใบอื่น* อยู่ ไม่ใช่
                      "วางแล้ว" (ใบนี้ยังไม่มีรอบของตัวเอง เลข n/N จึงยังเป็น 0) และไม่ใช่
                      "ยังไม่วาง" เฉย ๆ ด้วย (มีนัดเดินอยู่จริงที่ไซต์นั้น กดสร้างซ้ำโดยไม่รู้
                      = นัดซ้อนวันเดียวกันสองชุด · `ensureVisits` กันซ้ำแค่ภายในรอบเดียวกัน)
                      ⇒ ของเดิมกลืนสภาพนี้เข้ากับ "วางแล้ว" แล้วซ่อนปุ่ม ⇒ ใบที่สอง
                      (ต่อสัญญา/ขายเพิ่มที่ไซต์เดิม) วางรอบของตัวเองจากหน้าใบไม่ได้เลย */}
                  <td>
                    <StatusBadge
                      size="sm"
                      tone={row.hasPlan ? "success" : row.hasForeignPlan ? "info" : "warning"}
                      label={row.hasPlan ? "วางแล้ว" : row.hasForeignPlan ? "มีรอบของใบอื่น" : "ยังไม่วาง"}
                    />
                  </td>
                  <td>
                    {/* กติกา "ติดด่าน = โชว์แล้วบอกเหตุ" — ปุ่มไม่หายเพราะไซต์มีรอบของใบอื่น
                        แต่ต้องบอกก่อนกดว่ากำลังจะสร้างรอบซ้อนของที่มีอยู่ */}
                    {canPlan && !row.hasPlan && (
                      <Button
                        tone="accent"
                        size="sm"
                        title={row.hasForeignPlan
                          ? "ไซต์นี้มีรอบบริการเดินอยู่แล้วแต่เป็นของใบอื่น — รอบที่สร้างจากที่นี่จะผูกกับใบนี้ ตรวจที่หน้าไซต์ก่อนว่าไม่ซ้อนกัน"
                          : undefined}
                        onClick={() => setPlanSite(row)}
                      >
                        วางรอบ
                      </Button>
                    )}
                    <Button as={Link} prefetch={false} href={`/service/sites/${row.siteId}`} tone="neutral" size="sm">
                      เปิดหน้าไซต์
                    </Button>
                  </td>
                </tr>
              ))}
              {!allocation.sites.length && (
                <tr>
                  <td colSpan={5} className="cell-num-idle">
                    ยังไม่มีไซต์ — ฝ่ายบริการต้องรับใบนี้เข้าไซต์แล้วจัดสรรลงโซนก่อน
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      </DetailCard>

      {/* ── 3. นัดข้างหน้า + กระทบยอดรอบ ──────────────────────────────── */}
      <DetailCard icon={CalendarCheck2} eyebrow="VISITS" title="นัดข้างหน้าและรอบที่เดินไปแล้ว">
        <div className="form-grid cols-2">
          <div className="form-field">
            <span className="form-field-label">นัดข้างหน้า</span>
            <span>
              {visits.ahead ? `${fmtNumber(visits.ahead)} นัด` : "ยังไม่มีนัดข้างหน้า"}
              {visits.ahead ? ` — ผ่านด่าน ${fmtNumber(visits.passed)} · ติด ${fmtNumber(visits.blocked)}` : ""}
            </span>
          </div>
          <div className="form-field">
            <span className="form-field-label">
              <Repeat size={14} aria-hidden="true" /> รอบที่เดินไปแล้ว
            </span>
            {/* ⚠️ "ขายไว้" ยังไม่ระบุ = ขีด ไม่ใช่ n/0 ซึ่งอ่านเหมือนขายศูนย์รอบ */}
            <span className={rounds.sold && rounds.done >= rounds.sold ? "cell-num-ok" : undefined}>
              {rounds.sold ? `${fmtNumber(rounds.done)} / ${fmtNumber(rounds.sold)} รอบ` : `${fmtNumber(rounds.done)} รอบ (ยังไม่ระบุจำนวนที่ขาย)`}
            </span>
          </div>
        </div>

        {/* เหตุที่ติดมาจากด่านตัวจริง — บอกเหตุที่พบบ่อยที่สุดข้อเดียว ไม่ไล่ทุกนัด
            (ถ้าอยากเห็นรายนัด กดเข้าไปที่ตารางจัดคิวของฝ่ายบริการ) */}
        {visits.blocked > 0 && visits.topReason && (
          <StatusNotice tone="warning" title={`มีนัดติดด่าน ${fmtNumber(visits.blocked)} นัด`}>
            เหตุที่พบบ่อยที่สุด: {visits.topReason.reason}
          </StatusNotice>
        )}

        <div className="form-actions-buttons">
          <Button as={Link} prefetch={false} href="/service/schedule" tone="neutral" size="sm">
            เปิดตารางจัดคิวของฝ่ายบริการ
          </Button>
        </div>
      </DetailCard>

      {/* ⭐ **โมดัลตัวเดียวกับหน้าไซต์** — ห้ามก๊อปฟอร์มที่สอง (AGENTS.md)
          ส่ง `salesOrderId` ของใบไปด้วย ⇒ รอบที่วางจากที่นี่ผูกกับใบจริง ๆ ซึ่งเป็นสิ่งที่
          คอลัมน์ "รอบที่เดิน n/N" บนทะเบียนใบสั่งขายอ่านมาตลอดแต่ไม่เคยมีใครเขียนให้
          ⚠️ `roundsSold` ที่ส่งไปคือของ **ใบนี้** ไม่ใช่ของทั้งไซต์ — โมดัลเปลี่ยนคำ
             ให้ตามที่มา ("ใบนี้ระบุไว้" vs "ฝ่ายขายระบุไว้") */}
      <ServicePlanModal
        open={!!planSite}
        siteId={planSite?.siteId}
        technicians={technicians}
        roundsSold={rounds?.sold ?? null}
        salesOrderId={orderId}
        onClose={() => setPlanSite(null)}
        onSave={savePlan}
      />
    </>
  );
}
