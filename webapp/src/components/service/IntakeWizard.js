"use client";
// ── รับใบสั่งขายเข้าไซต์/โซน (เฟส 4) — wizard 2 จังหวะ ────────────────────
//
// ⭐ **TS ไม่ใช่ต้นทางของงาน** — จังหวะแรกไม่ใช่ "สร้างงาน" แต่คือ "ของที่ขายไปแล้ว
//   ไปตั้งที่ไหน" · ทุกแถวที่นี่มีต้นเรื่องเป็นบรรทัดในใบสั่งขายที่อนุมัติแล้วเสมอ
//
// ⚠️ ฟอร์มสร้างไซต์/โซนที่นี่ **เรียก component เดิม** (ServiceSiteModal /
//   ServiceZoneModal) ไม่ได้เขียนฟอร์มชุดที่สอง — กฎ AGENTS.md ข้อแรกของ repo
//   (เคสจริง: ฟอร์มแก้ที่ก๊อปมาแล้วขาดช่องไป 3 ช่องโดยไม่มีใครรู้)
//
// ⚠️ ที่นี่ **เลือกไซต์ได้อย่างเดียว ไม่แก้ทะเบียนลูกค้า** — ที่อยู่ทางภาษีกับที่อยู่
//   หน้างานเป็นคนละความจริง (มติ 2026-08-28) · อยากเพิ่มที่อยู่ต้องไปทะเบียนลูกค้า
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, MapPin, Plus } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import OptionTiles from "@/components/ui/OptionTiles";
import SearchableSelect from "@/components/ui/SearchableSelect";
import StatusBadge from "@/components/ui/StatusBadge";
import ServiceSiteModal from "@/components/service/ServiceSiteModal";
import ServiceZoneModal from "@/components/service/ServiceZoneModal";
import SiteNotFoundPanel from "@/components/service/SiteNotFoundPanel";
import { STANDARD_ML_HINT_TEXT, fgSummary, spreadAllocation, suggestStandardMl } from "@/lib/service/terms";
import { bindTargetError } from "@/lib/service/intake";
import { isHistoricalOrder } from "@/lib/sales/historicalOrders";
import { siteNotFoundOf } from "@/lib/sales/siteNotFound";
import { fmtNumber, naText } from "@/lib/format";
import styles from "./IntakeWizard.module.css";

const NEW_ZONE = "__new__";

export default function IntakeWizard({
  open, order, sites = [], zonesBySite = new Map(),
  onClose, onDone, onReloadRegistry, onSiteNotFound,
}) {
  const [step, setStep] = useState(1);
  const [siteId, setSiteId] = useState("");
  /* แผง "ไม่พบจุดนี้หน้างาน" ที่เปิดอยู่: null · "order" (ขั้น 1 ทั้งใบ) · groupKey (ขั้น 2 รายกลุ่ม) */
  const [notFoundFor, setNotFoundFor] = useState(null);
  const [withdrawing, setWithdrawing] = useState("");
  /* ⭐ จัดสรร **ระดับ FG** ไม่ใช่ระดับบรรทัด (มติผู้ใช้ 2026-08-29)
     [{ id, groupKey, zoneId, qty, standardMlPerMonth }] — หนึ่งแถว = ของกลุ่มนี้ไปโซนนี้กี่หน่วย */
  const [allocs, setAllocs] = useState([]);
  const [siteModal, setSiteModal] = useState(false);
  const [zoneModalFor, setZoneModalFor] = useState(null);  // allocation id ที่กำลังสร้างโซนให้
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSiteId("");
    setError("");
    setAllocs([]);
    setNotFoundFor(null);
    /* 🪤 ผูกกับ **รหัสใบ** ไม่ใช่ตัวอ็อบเจกต์ — หลังแจ้ง/ถอนการแจ้ง หน้าคิวโหลดใหม่แล้วส่งแถวก้อนใหม่
       ของใบเดิมเข้ามา · ถ้าผูกกับตัวอ็อบเจกต์ วิซาร์ดจะเด้งกลับขั้น 1 แล้วลบสิ่งที่ TS จัดสรรค้างไว้ทิ้ง */
  }, [open, order?.orderId]);

  /* ไซต์ของลูกค้ารายนี้เท่านั้น — ไซต์ของลูกค้าอื่นโผล่มาในดรอปดาวน์เมื่อไร
     คนจะผูกผิดบ้านโดยไม่มีอะไรทัก (โซนไม่มี customerId ให้ตรวจย้อน) */
  const customerSites = useMemo(
    () => sites.filter((s) => s.customerId === order?.customerId),
    [sites, order?.customerId],
  );
  const zones = useMemo(() => (siteId ? (zonesBySite.get(siteId) || []) : []), [zonesBySite, siteId]);

  const site = customerSites.find((s) => s.id === siteId) || null;

  /* 🐞 เลือกไซต์แล้วดรอปดาวน์โซนว่างเปล่า — ของเดิมโหลดโซนตอน "สร้างโซนใหม่" กับ
     ตอนกดบันทึกเท่านั้น ⇒ จังหวะ 2 ไม่มีโซนเดิมให้เลือกเลย ทั้งที่ไซต์มีโซนอยู่
     (แล้วคนจะสร้างโซนซ้ำชื่อเดิมจนชน unique) ⇒ ไซต์เปลี่ยนเมื่อไร ดึงโซนของไซต์นั้นทันที */
  useEffect(() => {
    if (!open || !siteId) return;
    onReloadRegistry?.ensureZones?.(siteId);
  }, [open, siteId, onReloadRegistry]);

  /* กลุ่ม FG ของใบนี้ — คิวส่งมาให้แล้ว (`order.fg`) ถ้าไม่มีก็คำนวณเองจากบรรทัด */
  const groups = useMemo(
    () => (order?.fg?.length ? order.fg : fgSummary(order?.lines || [])),
    [order],
  );
  /* ⭐ ใบสั่งขายย้อนหลัง (mig 0360) — ทางเกิดไซต์ของมันคือ "เพิ่มไซต์ย้อนหลัง" ไม่ใช่ใบคำร้องประเมินพื้นที่ */
  const historical = isHistoricalOrder(order);

  const setAlloc = (id, patch) =>
    setAllocs((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const addAlloc = (groupKey) =>
    setAllocs((prev) => [...prev, {
      id: `${groupKey}-${prev.length}-${prev.reduce((n, a) => n + (a.groupKey === groupKey ? 1 : 0), 0)}`,
      groupKey, zoneId: "", qty: "", standardMlPerMonth: "",
    }]);
  const removeAlloc = (id) => setAllocs((prev) => prev.filter((a) => a.id !== id));

  /* เหลือให้จัดสรรอีกเท่าไรของแต่ละกลุ่ม — คิดสด ๆ จากที่กรอกอยู่
     ⚠️ ช่องจำนวนที่เว้นว่าง = "ยกที่เหลือทั้งหมด" ⇒ นับเป็นใช้หมดกลุ่ม */
  const leftOf = (group) => {
    const mine = allocs.filter((a) => a.groupKey === group.key && a.zoneId);
    if (mine.some((a) => String(a.qty ?? "").trim() === "")) return 0;
    const used = mine.reduce((sum, a) => sum + (Number(a.qty) || 0), 0);
    return Math.max(0, group.remaining - used);
  };

  const overAllocated = groups.filter((g) => {
    const mine = allocs.filter((a) => a.groupKey === g.key && a.zoneId);
    if (mine.some((a) => String(a.qty ?? "").trim() === "")) return false;
    return mine.reduce((sum, a) => sum + (Number(a.qty) || 0), 0) > g.remaining;
  });

  /* ⚠️ ตัดแถวจัดสรรที่กลุ่มของมันหายไปแล้วทิ้ง — จุดที่เพิ่งถูกแจ้งว่า "ไม่พบหน้างาน" หลุดจาก `groups`
     ทันที แต่สิ่งที่ TS กรอกค้างไว้ยังอยู่ใน state ⇒ ถ้านับต่อ ปุ่มบันทึกจะเปิดทั้งที่ไม่มีอะไรจะผูก */
  const groupKeys = useMemo(() => new Set(groups.map((g) => g.key)), [groups]);
  const placed = allocs.filter((a) => a.zoneId && a.zoneId !== NEW_ZONE && groupKeys.has(a.groupKey));
  const ready = placed.length > 0 && !overAllocated.length;

  /* จุดที่ติดธงอยู่ของใบนี้ — คิวส่งมาให้แล้ว (`order.siteNotFoundLines`) */
  const flagged = order?.siteNotFoundLines || [];
  /* จุดของขั้น 1 = ทุกกลุ่มที่ยังรอผูก (ไม่ต้องเลือกไซต์ก่อน) */
  const notFoundPoints = useMemo(() => groups.map((g) => ({
    key: g.key,
    label: g.installationPoint || g.fgCode || g.description || g.key,
    detail: [g.fgCode && g.installationPoint ? g.fgCode : null, `${fmtNumber(g.remaining)}${g.unit ? ` ${g.unit}` : ""}`]
      .filter(Boolean).join(" · "),
    lineIds: g.lines.map((l) => l.id),
  })), [groups]);

  const sendNotFound = async ({ lineIds, reason, note }) => {
    await onSiteNotFound({ salesOrderId: order.orderId, action: "flag", lineIds, reason, note });
    setNotFoundFor(null);
  };
  const withdrawNotFound = async (line) => {
    setWithdrawing(line.id);
    setError("");
    try {
      await onSiteNotFound({ salesOrderId: order.orderId, action: "withdraw", lineIds: [line.id] });
    } catch (e) {
      setError(e.message || "ถอนการแจ้งไม่สำเร็จ");
    } finally {
      setWithdrawing("");
    }
  };

  const submit = async () => {
    if (!placed.length) { setError("ยังไม่ได้จัดสรรของลงโซนไหนเลย"); return; }
    if (overAllocated.length) {
      setError(`จัดสรรเกินจำนวนที่ขาย: ${overAllocated.map((g) => g.fgCode || g.description).join(" · ")}`);
      return;
    }
    /* ⭐ ด่านปลายทางตัวเดียวกับ server (`bindTargetError`) — ดรอปดาวน์ยังโชว์โซนที่ปิดใช้งาน (พร้อมป้าย)
       ⇒ บอกเหตุตอนกด ไม่ใช่ปล่อยให้ server ตีกลับทีหลัง · โซนที่เพิ่งสร้างและยังไม่เข้า state ให้ server ตรวจ */
    const targetErrors = placed.map((a) => {
      const zone = zones.find((z) => z.id === a.zoneId);
      if (!zone) return null;
      const group = groups.find((g) => g.key === a.groupKey);
      return bindTargetError({ order, zone, site, lineLabel: group?.fgCode || group?.description || "" });
    }).filter(Boolean);
    if (targetErrors.length) {
      setError([...new Set(targetErrors)].join(" · "));
      return;
    }
    setSaving(true);
    setError("");
    try {
      /* แปลง "จัดสรรระดับ FG" เป็น "ระดับบรรทัด" ที่ API ต้องการ — คนทำงานไม่ต้องรู้
         ว่าเอกสารขายแบ่งบรรทัดยังไง (spreadAllocation มีเทสต์ของตัวเอง) */
      const allocations = groups.flatMap((group) => spreadAllocation(
        group,
        placed
          .filter((a) => a.groupKey === group.key)
          .map((a) => ({
            zoneId: a.zoneId,
            qty: String(a.qty ?? "").trim() === "" ? null : Number(a.qty),
            standardMlPerMonth: String(a.standardMlPerMonth ?? "").trim() || null,
          })),
      ));
      /* 🐞 เคยส่ง `order.id` ซึ่งไม่มีอยู่จริง — แถวคิวจาก `bindQueue` ใช้ชื่อ `orderId`
         ⇒ body ที่ยิงไปไม่มี salesOrderId แล้ว route ตอบ 400 "ต้องระบุใบสั่งขาย" ทุกครั้ง
         (ตรงกับที่ service_zone_terms ยังว่างเปล่าบนฐานจริง — ไม่เคยมีใครผูกโซนสำเร็จเลย) */
      await onDone({ salesOrderId: order.orderId, allocations });
      onClose();
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (!order) return null;

  return (
    <>
      <Modal
        open={open && !siteModal && !zoneModalFor}
        onClose={onClose}
        title={`รับใบสั่งขาย ${order.code} เข้าไซต์`}
        size="lg"
      >
        <ol className={styles.steps}>
          <li data-active={step === 1 ? "yes" : undefined} data-done={step > 1 ? "yes" : undefined}>
            <Building2 size={14} aria-hidden="true" /> ของไปตั้งที่ไหน
          </li>
          <li data-active={step === 2 ? "yes" : undefined}>
            <MapPin size={14} aria-hidden="true" /> ของไหนลงโซนไหน
          </li>
        </ol>

        {step === 1 && (
          <div className={styles.pane}>
            <p className={styles.lead}>
              {/* ⚠️ บอกขนาดงานเป็น **FG + จำนวน** ไม่ใช่จำนวนบรรทัดเอกสารขาย */}
              ลูกค้า <strong>{naText(order.customerName)}</strong> · ใบนี้มีของรอจัดสรร{" "}
              <strong>{fmtNumber(groups.length)} ชนิด · {fmtNumber(groups.reduce((n, g) => n + g.remaining, 0))} หน่วย</strong>
            </p>
            {/* ⭐ ใบย้อนหลัง: จุดติดตั้งมาจากชีตของฝ่ายขาย (ตรงงานจริงแค่ 25%) — บอกก่อนเลือกไซต์ ไม่ใช่ให้เชื่อชื่อจุด */}
            {historical && (
              <p className={styles.lead}>
                <StatusBadge tone="info" size="sm" label="ย้อนหลัง" />{" "}
                ใบสั่งขายย้อนหลัง{order.historicalRefs?.length ? ` · เลขเดิม ${order.historicalRefs.join(" · ")}` : ""}
                {" "}— จุดติดตั้งของแต่ละรายการมาจากชีตของฝ่ายขาย ตรวจกับหน้างานก่อนเลือกไซต์และโซน
              </p>
            )}
            {/* ⭐ ทางแจ้ง "ไม่พบจุด" ต้องอยู่**ที่ขั้นนี้ด้วย** (มติข้อ 23) — ปุ่ม "จัดสรรลงโซน" ปิดจน
                กว่าจะเลือกไซต์ ⇒ ลูกค้าที่สาขาปิดจนไม่มีไซต์เลย จะไปไม่ถึงขั้น 2 และไม่มีทางบอกใครได้
                ⚠️ ใบย้อนหลังเท่านั้น — ใบปกติมีโซนที่ฝ่ายขายเลือกไว้แล้ว ไม่มีชื่อจุดจากชีตให้ "หาไม่เจอ" */}
            {historical && onSiteNotFound && (
              notFoundFor === "order" ? (
                <SiteNotFoundPanel
                  allowPick
                  points={notFoundPoints}
                  onSubmit={sendNotFound}
                  onCancel={() => setNotFoundFor(null)}
                />
              ) : (
                <div className={styles.inlineAction}>
                  <Button tone="neutral" variant="quiet" size="sm" onClick={() => setNotFoundFor("order")}>
                    ไม่พบจุดของใบนี้หน้างาน
                  </Button>
                  <small className={styles.lead}>เลือกจุดที่ไม่พบ ทีละจุดหรือทุกจุด โดยไม่ต้องเลือกไซต์ก่อน</small>
                </div>
              )
            )}
            {/* จุดที่แจ้งไว้แล้ว — ถอนได้จนกว่าฝ่ายขายจะตัดสิน (ปิดแล้ว = จบ ไม่มีปุ่มถอน) */}
            {flagged.length > 0 && (
              <div className={styles.field}>
                <span>จุดที่แจ้งว่าไม่พบหน้างานแล้ว ({fmtNumber(flagged.length)})</span>
                <ul className={styles.flaggedList}>
                  {flagged.map((line) => {
                    const info = siteNotFoundOf(line);
                    return (
                      <li key={line.id} className={styles.flaggedItem}>
                        <div>
                          <b>{naText(line.installationPoint)}</b>
                          <small>
                            {naText(info?.reasonLabel)}
                            {info?.note ? ` — ${info.note}` : ""}
                            {info?.byName ? ` · ${info.byName}` : ""}
                          </small>
                        </div>
                        {info?.closed ? (
                          <StatusBadge tone="neutral" size="sm" label="ฝ่ายขายปิดจุดนี้แล้ว" />
                        ) : (
                          <Button tone="neutral" variant="quiet" size="sm"
                            disabled={withdrawing === line.id}
                            onClick={() => withdrawNotFound(line)}>
                            {withdrawing === line.id ? "กำลังถอน…" : "ถอนการแจ้ง"}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {/* ⭐ **ไทล์ ไม่ใช่ดรอปดาวน์** — ลูกค้าหนึ่งรายมีไซต์ไม่กี่แห่ง และคนเลือก
                ต้องเห็นว่าแต่ละไซต์มีโซน/อุปกรณ์อยู่แล้วเท่าไร ถึงจะรู้ว่าควรผูกกับ
                ไซต์เดิมหรือตั้งใหม่ (กติกาของระบบ: ตัวเลือกน้อย = ไทล์ที่เห็นข้อมูล ·
                ดรอปดาวน์เก็บไว้ให้รายการยาวที่ต้องค้นหา)
                ⚠️ เกิน 8 ไซต์เมื่อไรค่อยกลับไปใช้ช่องค้นหา — ไทล์ 20 ใบไม่ได้อ่านง่ายกว่า */}
            {customerSites.length > 8 ? (
              <label className={styles.field}>
                <span>ไซต์ที่ของไปตั้ง *</span>
                <SearchableSelect
                  value={siteId}
                  onChange={setSiteId}
                  options={customerSites.map((s) => ({
                    value: s.id,
                    label: s.routeZone ? `${s.name} · ${s.routeZone}` : s.name,
                  }))}
                  placeholder="ค้นหาไซต์ของลูกค้ารายนี้"
                  ariaLabel="ไซต์ที่ของไปตั้ง"
                />
              </label>
            ) : (
              <div className={styles.field}>
                <span>
                  ไซต์ที่ของไปตั้ง *
                  {customerSites.length > 0 && (
                    <span className={styles.countHint}> · ลูกค้ามีไซต์เดิม {customerSites.length} แห่ง</span>
                  )}
                </span>
                {/* ⚠️ ปุ่ม "ตั้งไซต์ใหม่" ถูกถอดไปแล้ว (มติ 2026-08-30) — ข้อความต้อง
                    บอกทางที่มีอยู่จริง ไม่ใช่ชี้ไปที่ปุ่มที่ไม่มี */}
                {customerSites.length === 0 ? (
                  historical ? (
                    /* ⭐ ใบย้อนหลังชี้ไป "เพิ่มไซต์ย้อนหลัง" (มติผู้ใช้ 2026-09-11) — ไซต์ที่ติดตั้งอยู่ก่อนมีระบบ
                       ไม่มีใบประเมินให้เกิด ⇒ บอกทางคำร้องคือส่งคนไปทางตัน · ลิงก์อย่างเดียว ไม่ฝังโมดัล
                       (โมดัลอยู่หลังสิทธิ์ของหน้าทะเบียนไซต์ — ยาม siteOrigin.test) */
                    <p className={styles.lead}>
                      ลูกค้ารายนี้ยังไม่มีไซต์ในทะเบียน — ใบนี้เป็นใบสั่งขายย้อนหลัง ไซต์ที่ติดตั้งอยู่ก่อนมีระบบ
                      ไม่มีใบประเมินพื้นที่ ให้{" "}
                      <Link href="/service/sites" className={styles.siteLink}>เพิ่มไซต์ย้อนหลัง</Link>
                      {" "}ที่หน้าทะเบียนไซต์ก่อน แล้วกลับมาผูกใบนี้
                    </p>
                  ) : (
                    <p className={styles.lead}>
                      ลูกค้ารายนี้ยังไม่มีไซต์ในทะเบียน — ไซต์เกิดจากใบคำร้อง “ประเมินพื้นที่”
                      ที่ฝ่ายขายเปิดให้ลูกค้ารายนี้ แจ้งฝ่ายขายเปิดใบก่อน แล้วกลับมาผูกใบสั่งขายนี้
                    </p>
                  )
                ) : (
                  <OptionTiles
                    value={siteId}
                    onChange={setSiteId}
                    ariaLabel="ไซต์ที่ของไปตั้ง"
                    options={customerSites.map((s) => ({
                      value: s.id,
                      label: s.name,
                      description: [
                        s.code,
                        s.routeZone,
                        `${s.zoneCount ?? (zonesBySite.get(s.id) || []).length} โซน`,
                        s.assetCount != null ? `${s.assetCount} อุปกรณ์` : null,
                      ].filter(Boolean).join(" · "),
                    }))}
                  />
                )}
              </div>
            )}
            {/* 🔴 **ไม่มีปุ่ม "ตั้งไซต์ใหม่" แล้ว** (มติผู้ใช้ 2026-08-30) — ไซต์เกิดได้
                ทางเดียวคือใบคำร้อง "ประเมินพื้นที่" ที่ฝ่ายขายเปิด ⇒ ทุกไซต์มีต้นเรื่อง
                ⚠️ ลูกค้าที่ซื้อโดยไม่เคยประเมินพื้นที่ ต้องให้ SA เปิดใบย้อนหลังก่อน —
                   บอกไว้ตรงนี้ ไม่ใช่ปล่อยให้เจอลิสต์ว่างแล้วเดาเอง */}
            <small className={styles.lead}>
              เห็นเฉพาะไซต์ของลูกค้ารายนี้ · ที่อยู่ของไซต์ก๊อปมาจากทะเบียนลูกค้าเป็นค่าตั้งต้น
              แล้วแก้ได้เอง — ไม่ผูกให้เปลี่ยนตามกัน
            </small>
            {historical ? (
              <small className={styles.lead}>
                ไม่มีไซต์ที่ต้องการ? ไซต์ที่ติดตั้งอยู่ก่อนมีระบบ เพิ่มได้ที่{" "}
                <Link href="/service/sites" className={styles.siteLink}>เพิ่มไซต์ย้อนหลัง</Link>
                {" "}(หน้าทะเบียนไซต์) — เลือกลูกค้ารายนี้ แล้วกลับมาผูกใบนี้เข้ากับไซต์ที่ได้
              </small>
            ) : (
              <small className={styles.lead}>
                ไม่มีไซต์ที่ต้องการ? ไซต์ใหม่เกิดจากใบคำร้อง <b>ประเมินพื้นที่</b> ที่ฝ่ายขายเปิดให้ลูกค้ารายนี้
                — แจ้งฝ่ายขายเปิดใบก่อน แล้วกลับมาผูกใบสั่งขายนี้เข้ากับไซต์ที่ได้
              </small>
            )}
          </div>
        )}

        {step === 2 && (
          <div className={styles.pane}>
            <p className={styles.lead}>
              ไซต์ <strong>{naText(site?.name)}</strong> · จัดสรรของลงโซนเอง — ของชนิดเดียวกัน
              แบ่งลงหลายโซนได้ · ลงโซนเดิมคือ<strong>การต่อสัญญา</strong> ประวัติและยอดการใช้เดินต่อไม่ขาดตอน
            </p>
            {/* ⭐ หน่วยของหน้านี้คือ **FG** ไม่ใช่บรรทัดเอกสารขาย (มติผู้ใช้ 2026-08-29)
                ของจริง: ใบหนึ่งมี 10 บรรทัด แต่เป็น FG แค่ 2 ชนิด — ไล่จับคู่ทีละบรรทัด
                คือให้ TS ทำงานตามรูปร่างเอกสารของฝ่ายขาย */}
            <ul className={styles.lines}>
              {groups.map((group) => {
                const mine = allocs.filter((a) => a.groupKey === group.key);
                const left = leftOf(group);
                const suggestion = suggestStandardMl(group.remaining, group.unit);
                return (
                  <li key={group.key} className={styles.line}>
                    {/* ⭐ จุดติดตั้งตามชีตของใบย้อนหลัง (fgSummary แยกกลุ่มตามจุดแล้ว) — บอก "ไปหาที่ไหน" เหนือรหัส FG */}
                    {group.installationPoint && (
                      <p className={styles.point}>
                        <MapPin size={13} aria-hidden="true" /> จุดติดตั้งตามใบ: <b>{group.installationPoint}</b>
                        {/* ⭐ ปุ่มเงียบรายกลุ่ม — กรณี "เจอบางจุด": ผูกจุดที่เจอในคำขอเดียว
                            ส่วนจุดที่ไม่เจอส่งกลับฝ่ายขายแยกทาง (มติข้อ 23) */}
                        {historical && onSiteNotFound && notFoundFor !== group.key && (
                          <Button tone="neutral" variant="quiet" size="sm"
                            onClick={() => setNotFoundFor(group.key)}>
                            ไม่พบจุดนี้หน้างาน
                          </Button>
                        )}
                      </p>
                    )}
                    {notFoundFor === group.key && (
                      <SiteNotFoundPanel
                        points={notFoundPoints.filter((p) => p.key === group.key)}
                        onSubmit={sendNotFound}
                        onCancel={() => setNotFoundFor(null)}
                      />
                    )}
                    <div className={styles.lineHead}>
                      <b>{naText(group.fgCode)}</b>
                      <span>{naText(group.description)}</span>
                      <span className={styles.qty}>
                        {fmtNumber(group.remaining)}{group.unit ? ` ${group.unit}` : ""}
                        {group.lines.length > 1 && (
                          <em className={styles.fromLines}> · จาก {fmtNumber(group.lines.length)} บรรทัด</em>
                        )}
                      </span>
                    </div>

                    {mine.map((a) => (
                      <div key={a.id} className={styles.lineFields}>
                        <label className={styles.field}>
                          <span>โซน *</span>
                          <Select
                            value={a.zoneId || ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === NEW_ZONE) { setZoneModalFor(a.id); return; }
                              setAlloc(a.id, { zoneId: value });
                            }}
                          >
                            <option value="">เลือกโซน</option>
                            {zones.map((z) => (
                              <option key={z.id} value={z.id}>
                                {z.name}{z.isActive === false ? " (ปิดใช้งาน)" : ""}
                              </option>
                            ))}
                            <option value={NEW_ZONE}>+ สร้างโซนใหม่…</option>
                          </Select>
                        </label>
                        <label className={styles.field}>
                          <span>จำนวน{group.unit ? ` (${group.unit})` : ""}</span>
                          <Input
                            value={a.qty ?? ""}
                            onChange={(e) => setAlloc(a.id, { qty: e.target.value })}
                            inputMode="numeric"
                            placeholder="เว้นว่าง = ที่เหลือทั้งหมด"
                          />
                        </label>
                        <label className={styles.field}>
                          <span>มาตรฐานต่อเดือน (ml)</span>
                          <Input
                            value={a.standardMlPerMonth ?? ""}
                            onChange={(e) => setAlloc(a.id, { standardMlPerMonth: e.target.value })}
                            inputMode="numeric"
                            placeholder="ยังไม่ระบุก็ได้"
                          />
                          {/* ⚠️ ระบบ **ไม่เติมค่านี้ให้เอง** — ไม่มีสูตรที่เป็นทางการ
                              มีแค่หลักฐานจากชีตที่ลงตัว 10 ใน 13 แถว ⇒ เสนอให้กดรับ
                              ไม่ใช่เขียนเงียบ ๆ แล้วให้คนมารู้ทีหลังว่าตัวเลขมาจากไหน */}
                          {suggestion != null && (
                            <small>
                              <button type="button" className={styles.suggest}
                                onClick={() => setAlloc(a.id, { standardMlPerMonth: String(suggestion) })}>
                                ใช้ {fmtNumber(suggestion)} ml
                              </button>
                              {" — "}{STANDARD_ML_HINT_TEXT}
                            </small>
                          )}
                        </label>
                        <Button tone="neutral" variant="quiet" size="sm"
                          onClick={() => removeAlloc(a.id)} aria-label="เอาโซนนี้ออก">
                          เอาออก
                        </Button>
                      </div>
                    ))}

                    <div className={styles.inlineAction}>
                      <Button tone="neutral" variant="quiet" size="sm"
                        icon={<Plus size={15} aria-hidden="true" />}
                        onClick={() => addAlloc(group.key)}>
                        {mine.length ? "เพิ่มโซน" : "เลือกโซน"}
                      </Button>
                      {/* เหลือเท่าไรต้องอ่านออกตลอดเวลา ไม่ใช่รู้ตอนกดบันทึกแล้วโดนตีกลับ */}
                      <small className={left > 0 ? styles.left : styles.leftDone}>
                        {left > 0
                          ? `เหลือให้จัดสรรอีก ${fmtNumber(left)}${group.unit ? ` ${group.unit}` : ""}`
                          : "จัดสรรครบแล้ว"}
                      </small>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="form-actions">
          <Button tone="neutral" onClick={step === 1 ? onClose : () => setStep(1)} disabled={saving}>
            {step === 1 ? "ยกเลิก" : "ย้อนกลับ"}
          </Button>
          {step === 1 ? (
            <Button tone="primary" onClick={() => setStep(2)} disabled={!siteId}
              icon={<ArrowRight size={15} aria-hidden="true" />}>
              จัดสรรลงโซน
            </Button>
          ) : (
            <Button tone="primary" onClick={submit} disabled={saving || !ready}>
              {saving ? "กำลังบันทึก…" : "บันทึกและตั้งรอบต่อ"}
            </Button>
          )}
        </div>
      </Modal>

      {/* ⚠️ **เหลือฟอร์มโซนตัวเดียว** — ฟอร์มไซต์ถูกถอดออกตามมติ 2026-08-30
          (ไซต์เกิดจากคำร้องเท่านั้น) · โซนยังเพิ่มที่นี่ได้ เพราะโซนเป็นรายละเอียด
          ของไซต์ที่มีต้นเรื่องอยู่แล้ว ไม่ใช่ตัวงานใหม่ */}
      <ServiceZoneModal
        open={!!zoneModalFor}
        zone={null}
        onClose={() => setZoneModalFor(null)}
        onSave={async (form) => {
          const created = await onReloadRegistry.createZone(siteId, form);
          setAlloc(zoneModalFor, { zoneId: created.id });
          setZoneModalFor(null);
        }}
      />
    </>
  );
}
