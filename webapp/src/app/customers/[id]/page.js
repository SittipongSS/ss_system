"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { useCan } from "@/lib/roleContext";
import OrderDetailModal from "@/components/OrderDetailModal";
import ProductStatusPill from "@/components/ProductStatusPill";
import OrderStatusPill from "@/components/OrderStatusPill";

export default function CustomerDetails() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;
  const canEdit = useCan("customers:edit");
  const canDelete = useCan("customers:delete");

  const [customer, setCustomer] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mapFile, setMapFile] = useState(null);
  const [formData, setFormData] = useState({
    arCode: "",
    name: "",
    taxId: "",
    phone: "",
    address: "",
    brandsStr: "",
    contactPerson: "",
    email: "",
    creditTerms: "",
  });

  // Table Tabs
  const [activeTab, setActiveTab] = useState("products");
  const [selectedOrder, setSelectedOrder] = useState(null);

  const fetchCustomerData = async () => {
    try {
      const res = await fetch(`/api/customers/${id}`);
      if (res.ok) {
        const data = await res.json();
        setCustomer(data.customer);
        setProducts(data.products || []);
        setOrders(data.orders || []);

        // Populate edit form
        setFormData({
          arCode: data.customer.arCode || "",
          name: data.customer.name || "",
          taxId: data.customer.taxId || "",
          phone: data.customer.phone || "",
          address: data.customer.address || "",
          brandsStr: (data.customer.brands || []).join(", "),
          contactPerson: data.customer.contactPerson || "",
          email: data.customer.email || "",
          creditTerms: data.customer.creditTerms || "",
        });
      } else {
        const errData = await res.json();
        setError(errData.error || "ไม่สามารถโหลดข้อมูลลูกค้าได้");
      }
    } catch (err) {
      console.error(err);
      setError("เกิดข้อผิดพลาดในการโหลดข้อมูล");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (id) {
      fetchCustomerData();
    }
  }, [id]);

  const formatMoney = (amount) => {
    if (amount === undefined || amount === null) return "฿0.00";
    return amount.toLocaleString("th-TH", {
      style: "currency",
      currency: "THB",
      minimumFractionDigits: 2,
    });
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    let mapFileUrl = customer.mapFileUrl;

    // Handle map file upload if present
    if (mapFile) {
      try {
        const uploadData = new FormData();
        uploadData.append("file", mapFile);
        uploadData.append("customerName", formData.name);

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: uploadData,
        });
        if (uploadRes.ok) {
          const result = await uploadRes.json();
          mapFileUrl = result.url;
        } else {
          alert("คำเตือน: อัปโหลดไฟล์แผนที่ไม่สำเร็จ");
        }
      } catch (err) {
        console.error("Upload error", err);
      }
    }

    const payload = {
      arCode: formData.arCode,
      name: formData.name,
      taxId: formData.taxId,
      phone: formData.phone,
      address: formData.address,
      brands: formData.brandsStr
        .split(",")
        .map((b) => b.trim())
        .filter((b) => b),
      contactPerson: formData.contactPerson || null,
      email: formData.email || null,
      creditTerms: formData.creditTerms || null,
      mapFileUrl,
    };

    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsEditing(false);
        setMapFile(null);
        await fetchCustomerData();
      } else {
        const errData = await res.json();
        alert(errData.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    }
    setIsSubmitting(false);
  };

  const handleDelete = async () => {
    if (
      !confirm(
        "ยืนยันว่าต้องการลบข้อมูลลูกค้ารายนี้ออกจากระบบหรือไม่? การลบนี้ไม่สามารถกู้คืนได้",
      )
    )
      return;

    try {
      const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
      if (res.ok) {
        alert("ลบข้อมูลลูกค้าเรียบร้อยแล้ว");
        router.push("/customers");
      } else {
        const errData = await res.json();
        alert(errData.error || "ไม่สามารถลบข้อมูลได้");
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการลบข้อมูล");
    }
  };

  // Calculations for Stats. The order rollup totals already exclude exempt
  // items (their per-item tax is 0), so we can sum them directly.
  const totalExciseTax = orders.reduce((sum, o) => sum + (o.totalExciseTax || 0), 0);
  const totalLocalTax = orders.reduce((sum, o) => sum + (o.totalLocalTax || 0), 0);
  const totalTaxAccrued = totalExciseTax + totalLocalTax;

  const totalPaidTax = orders
    .filter((o) => o.status === "complete")
    .reduce((sum, o) => sum + (o.totalTax || 0), 0);

  // Outstanding = everything not yet paid and not rejected (pending awaiting
  // payment, received, or in the middle of filing).
  const totalPendingTax = orders
    .filter((o) => ["pending", "received", "filing"].includes(o.status))
    .reduce((sum, o) => sum + (o.totalTax || 0), 0);

  if (loading) {
    return (
      <div className="flex justify-center p-24">
        <svg
          className="animate-spin h-10 w-10 text-[var(--accent)]"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="glass-panel p-12 text-center">
        <svg
          className="w-16 h-16 text-[var(--red)] mx-auto mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <h2 className="text-xl font-semibold text-[var(--text)] mb-2">
          {error || "ไม่พบข้อมูลลูกค้ารายนี้"}
        </h2>
        <p className="text-[var(--text-3)] mb-6">
          ลูกค้าที่คุณกำลังพยายามเข้าถึงอาจถูกลบหรือไม่มีอยู่ในระบบ
        </p>
        <Link
          href="/customers"
          className="btn btn-primary px-6 inline-flex items-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          กลับไปยังทะเบียนลูกค้า
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Top Header Section */}
      <Link
        href="/customers"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          color: "var(--text-2)",
          fontSize: "13px",
          fontWeight: 500,
          marginBottom: "14px",
          textDecoration: "none",
        }}
      >
        <ArrowLeft size={16} /> กลับไปทะเบียนลูกค้า
      </Link>
      <div className="premium-header flex justify-between items-center mb-6">
        <div className="header-content">
          <h1 className="flex items-center gap-2 flex-wrap">
            <span className="premium-header-icon">
              <Building2 size={20} />
            </span>
            {customer.name}
            <span className="pill font-mono text-xs">{customer.arCode}</span>
          </h1>
          <p>
            วันที่สร้าง:{" "}
            {new Date(customer.createdAt).toLocaleDateString("th-TH", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        <div className="flex gap-2">
          {canEdit && !isEditing && (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="btn bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[var(--accent-soft)] border border-[var(--border)] px-4 py-2 text-xs font-semibold flex items-center gap-1.5 rounded-lg"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                แก้ไขข้อมูล
              </button>
              {canDelete && (
                <button
                  onClick={handleDelete}
                  className="btn bg-[var(--red-soft)] text-[var(--red)] hover:bg-[var(--red-soft)] border border-[var(--border)] px-4 py-2 text-xs font-semibold flex items-center gap-1.5 rounded-lg"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  ลบลูกค้า
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[22px] mb-[22px]">
        {/* Profile Card / Edit Form */}
        <div className="lg:col-span-2">
          {isEditing ? (
            <div className="glass-panel p-[20px]">
              <h3 className="font-semibold text-[var(--text)] border-b border-[var(--border)] pb-3 mb-5">
                แก้ไขข้อมูลลูกค้า (Edit Customer Profile)
              </h3>
              <form onSubmit={handleEditSubmit}>
                <div className="grid gap-[16px] grid-cols-2">
                  <div className="form-group col-span-2 sm:col-span-1">
                    <label>
                      รหัสลูกค้า (AR Code){" "}
                      <span className="text-[var(--red)]">*</span>
                    </label>
                    <input
                      type="text"
                      name="arCode"
                      value={formData.arCode}
                      onChange={handleInputChange}
                      required
                      className="premium-input w-full font-mono text-xs"
                    />
                  </div>
                  <div className="form-group col-span-2 sm:col-span-1">
                    <label>
                      ชื่อบริษัท / ลูกค้า{" "}
                      <span className="text-[var(--red)]">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      className="premium-input w-full text-xs"
                    />
                  </div>
                  <div className="form-group col-span-2 sm:col-span-1">
                    <label>
                      เลขประจำตัวผู้เสียภาษี{" "}
                      <span className="text-[var(--red)]">*</span>
                    </label>
                    <input
                      type="text"
                      name="taxId"
                      value={formData.taxId}
                      onChange={handleInputChange}
                      required
                      className="premium-input w-full font-mono text-xs"
                    />
                  </div>
                  <div className="form-group col-span-2 sm:col-span-1">
                    <label>เบอร์โทร</label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="เช่น 02-123-4567"
                      className="premium-input w-full font-mono text-xs"
                    />
                  </div>
                  <div className="form-group col-span-2 sm:col-span-1">
                    <label>ผู้ติดต่อ</label>
                    <input
                      type="text"
                      name="contactPerson"
                      value={formData.contactPerson}
                      onChange={handleInputChange}
                      placeholder="ชื่อผู้ติดต่อ"
                      className="premium-input w-full text-xs"
                    />
                  </div>
                  <div className="form-group col-span-2 sm:col-span-1">
                    <label>อีเมล</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="example@email.com"
                      className="premium-input w-full text-xs"
                    />
                  </div>
                  <div className="form-group col-span-2">
                    <label>เงื่อนไขเครดิต (Credit Terms)</label>
                    <input
                      type="text"
                      name="creditTerms"
                      value={formData.creditTerms}
                      onChange={handleInputChange}
                      placeholder="เช่น เครดิต 30 วัน"
                      className="premium-input w-full text-xs"
                    />
                  </div>
                  <div className="form-group col-span-2">
                    <label>
                      ที่อยู่ลูกค้า <span className="text-[var(--red)]">*</span>
                    </label>
                    <textarea
                      name="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      required
                      rows={3}
                      className="premium-input w-full text-xs"
                      style={{ padding: "8px 12px", resize: "none" }}
                    ></textarea>
                  </div>
                  <div className="form-group col-span-2">
                    <label>
                      ชื่อแบรนด์สินค้า (Brands){" "}
                      <span className="text-[var(--red)]">*</span>
                    </label>
                    <input
                      type="text"
                      name="brandsStr"
                      value={formData.brandsStr}
                      onChange={handleInputChange}
                      required
                      placeholder="คั่นด้วยเครื่องหมายคอมมา เช่น Brand A, Brand B"
                      className="premium-input w-full text-xs"
                    />
                    <span className="text-[10px] text-[var(--text-3)] mt-1">
                      คั่นด้วยลูกน้ำ (,)
                    </span>
                  </div>
                  <div className="form-group col-span-2">
                    <label>อัปโหลดแผนที่ลูกค้าใหม่ (Map PDF/Image)</label>
                    <input
                      type="file"
                      accept=".pdf,image/png,image/jpeg"
                      onChange={(e) => setMapFile(e.target.files[0])}
                      className="premium-input w-full text-xs"
                      style={{ padding: "5px" }}
                    />
                    {customer.mapFileUrl && (
                      <span className="text-[10px] text-[var(--accent)] mt-1 block font-mono">
                        ไฟล์เดิม: {customer.mapFileUrl.split("/").pop()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-6 pt-5 border-t border-[var(--border)] ">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setMapFile(null);
                    }}
                    className="btn bg-[var(--panel-2)] text-[var(--text-2)] px-5 text-xs font-semibold py-2 rounded-lg"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn btn-primary px-6 text-xs font-semibold py-2"
                  >
                    {isSubmitting ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="glass-panel p-[20px] h-full flex flex-col justify-between">
              <div>
                <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-3 mb-4 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-[var(--accent)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                  ข้อมูลบริษัท / ลูกค้า (Company Details)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6 text-xs">
                  <div>
                    <span className="text-[var(--text-3)] block mb-1">
                      รหัสลูกค้า AR Code
                    </span>
                    <span className="font-semibold font-mono text-[var(--text)] text-sm bg-[var(--panel-2)] px-2 py-0.5 rounded">
                      {customer.arCode}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-3)] block mb-1">
                      เลขผู้เสียภาษี (Tax ID)
                    </span>
                    <span className="font-semibold font-mono text-[var(--text)] text-sm">
                      {customer.taxId}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-3)] block mb-1">
                      เบอร์โทร (Phone)
                    </span>
                    <span className="font-semibold font-mono text-[var(--text)] text-sm">
                      {customer.phone || "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-3)] block mb-1">
                      ผู้ติดต่อ (Contact)
                    </span>
                    <span className="font-semibold text-[var(--text)] text-sm">
                      {customer.contactPerson || "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-3)] block mb-1">
                      อีเมล (Email)
                    </span>
                    <span className="font-semibold text-[var(--text)] text-sm">
                      {customer.email || "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-3)] block mb-1">
                      เงื่อนไขเครดิต (Credit Terms)
                    </span>
                    <span className="font-semibold text-[var(--text)] text-sm">
                      {customer.creditTerms || "-"}
                    </span>
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-[var(--text-3)] block mb-1">
                      ชื่อจดทะเบียนบริษัท
                    </span>
                    <span className="font-semibold text-[var(--text)] text-sm">
                      {customer.name}
                    </span>
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-[var(--text-3)] block mb-1">
                      ที่อยู่ออกใบเอกสาร
                    </span>
                    <p className="font-medium text-[var(--text)] leading-relaxed">
                      {customer.address}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-[var(--border)] flex items-center justify-between">
                <div>
                  <span className="text-[var(--text-3)] block text-[10px] mb-1">
                    เอกสารแนบ / แผนที่
                  </span>
                  {customer.mapFileUrl ? (
                    <a
                      href={customer.mapFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] hover:underline"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="w-4 h-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                        />
                      </svg>
                      ดูแผนที่ที่อัปโหลดไว้
                    </a>
                  ) : (
                    <span className="text-[var(--text-3)] text-xs italic">
                      ไม่มีแผนที่ในระบบ
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-[var(--text-3)] block text-[10px] mb-1 text-right">
                    แบรนด์สินค้าทั้งหมด
                  </span>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {customer.brands && customer.brands.length > 0 ? (
                      customer.brands.map((b, i) => (
                        <span
                          key={i}
                          className="bg-[var(--panel-2)] px-2.5 py-0.5 rounded-full text-[10.5px] text-[var(--text-2)] font-semibold"
                        >
                          {b}
                        </span>
                      ))
                    ) : (
                      <span className="text-[var(--text-3)] text-xs italic">
                        ไม่มีข้อมูลแบรนด์
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Stats Column */}
        <div className="glass-panel p-[20px] flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-3 mb-4 flex items-center gap-2">
              <svg
                className="w-4 h-4 text-[var(--green)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z"
                />
              </svg>
              สรุปภาษีและข้อมูลสินค้า (Overview)
            </h3>

            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--text-3)]">สินค้าที่ลงทะเบียน</span>
                <span className="font-bold text-[var(--text)] text-sm font-mono">
                  {products.length} รายการ
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--text-3)]">
                  ใบสั่งซื้อทั้งหมด
                </span>
                <span className="font-bold text-[var(--text)] text-sm font-mono">
                  {orders.length} รายการ
                </span>
              </div>
              <div className="border-t border-dashed border-[var(--border)] my-2 pt-2"></div>

              <div className="flex justify-between items-start text-xs">
                <span className="text-[var(--text-3)]">
                  ภาษีที่ชำระแล้ว (Paid)
                </span>
                <div className="text-right">
                  <span className="font-bold text-[var(--green)] text-sm font-mono">
                    {formatMoney(totalPaidTax)}
                  </span>
                  <div className="text-[9px] text-[var(--text-3)]">
                    จาก PO ที่ชำระแล้ว
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-start text-xs">
                <span className="text-[var(--text-3)]">
                  ภาษีค้างชำระ (Pending)
                </span>
                <div className="text-right">
                  <span className="font-bold text-[var(--amber)] text-sm font-mono">
                    {formatMoney(totalPendingTax)}
                  </span>
                  <div className="text-[9px] text-[var(--text-3)]">
                    รอชำระเงินของ Sales
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-[var(--border)] ">
            <span className="text-[var(--text-3)] text-[10px] block mb-1">
              ยอดภาษีรวมสะสม (Total Tax Accrued)
            </span>
            <div className="text-2xl font-bold font-mono text-[var(--accent)] ">
              {formatMoney(totalTaxAccrued)}
            </div>
            <span className="text-[9px] text-[var(--text-3)] mt-1 block">
              ภาษีสรรพสามิต {formatMoney(totalExciseTax)} + ภาษีท้องถิ่น{" "}
              {formatMoney(totalLocalTax)}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Header */}
      <div className="tabs-header">
        <button
          onClick={() => setActiveTab("products")}
          className={`tab-btn ${activeTab === "products" ? "active" : ""}`}
        >
          รายการสินค้า ({products.length})
        </button>
        <button
          onClick={() => setActiveTab("orders")}
          className={`tab-btn ${activeTab === "orders" ? "active" : ""}`}
        >
          รายการสั่งซื้อ ({orders.length})
        </button>
      </div>

      {/* Products Tab */}
      {activeTab === "products" && (
        <div className="glass-panel">
          <div className="px-4 py-3.5 border-b border-[var(--border)] ">
            <h3 className="font-semibold text-sm text-[var(--text)] ">
              สินค้าของลูกค้ารายนี้ ({products.length} รายการ)
            </h3>
          </div>
          <div className="premium-table-wrapper border-none rounded-t-none">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>รหัสสินค้า (FG Code)</th>
                  <th>รายละเอียดสินค้า / แบรนด์</th>
                  <th>ปริมาตร (ml)</th>
                  <th className="num">ราคาขายปลีก</th>
                  <th className="num">ภาษีคำนวณต่อชิ้น</th>
                  <th className="text-center">สถานะการอนุมัติ</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td
                      colSpan="6"
                      className="text-center py-10 text-[var(--text-3)]"
                    >
                      ยังไม่มีสินค้าขึ้นทะเบียนของลูกค้ารายนี้
                    </td>
                  </tr>
                ) : (
                  products.map((p) => {
                    const isExempt = p.isExciseTaxable === false;
                    const taxRate = isExempt ? 0 : p.exciseTax + p.localTax;
                    return (
                      <tr
                        key={p.id}
                        onClick={() =>
                          (window.location.href = `/products/${p.id}`)
                        }
                        className="clickable-row"
                      >
                        <td className="font-semibold font-mono text-[var(--text)] ">
                          {p.fgCode}
                        </td>
                        <td>
                          <div className="font-semibold text-[var(--text)] ">
                            {p.productDescription}
                          </div>
                          <div className="text-[10px] text-[var(--text-3)] font-mono mt-0.5">
                            Brand: {p.brandName}
                          </div>
                        </td>
                        <td className="font-mono">{p.volume} ml</td>
                        <td className="num font-mono text-[var(--text-2)] ">
                          {formatMoney(p.retailPriceIncVat)}
                        </td>
                        <td className="num font-mono text-[var(--text-2)] ">
                          {isExempt ? (
                            <span className="status-pill success text-[10px]">
                              ไม่ต้องเสียภาษี
                            </span>
                          ) : (
                            formatMoney(taxRate)
                          )}
                        </td>
                        <td className="text-center">
                          <ProductStatusPill status={p.status} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Orders Tab */}
      {activeTab === "orders" && (
        <div className="glass-panel">
          <div className="px-4 py-3.5 border-b border-[var(--border)] ">
            <h3 className="font-semibold text-sm text-[var(--text)] ">
              รายการสั่งซื้อ ({orders.length} รายการ)
            </h3>
          </div>
          <div className="premium-table-wrapper border-none rounded-t-none">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>เลขที่ใบเสนอราคา</th>
                  <th>PO Reference</th>
                  <th className="text-center">จำนวนรายการ</th>
                  <th className="num">ยอดภาษีรวม</th>
                  <th className="text-center">กำหนดส่ง</th>
                  <th className="text-center">สถานะชำระเงิน</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td
                      colSpan="6"
                      className="text-center py-10 text-[var(--text-3)]"
                    >
                      ยังไม่มีรายการสั่งซื้อในระบบ
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => {
                    const isExempt = (o.totalTax || 0) === 0;
                    const itemCount = o.items?.length || 0;
                    return (
                      <tr
                        key={o.id}
                        className="clickable-row"
                        onClick={() => setSelectedOrder(o)}
                      >
                        <td className="font-semibold font-mono text-[var(--text)] ">
                          {o.quotationRef}
                        </td>
                        <td className="font-mono text-xs text-[var(--text-2)]">
                          {o.poReference || "-"}
                        </td>
                        <td className="text-center font-mono font-semibold">
                          {itemCount}
                        </td>
                        <td className="num font-mono font-bold text-[var(--text)] ">
                          {isExempt ? (
                            <span className="status-pill success text-[10px]">
                              ไม่ต้องเสียภาษี
                            </span>
                          ) : (
                            formatMoney(o.totalTax)
                          )}
                        </td>
                        <td className="text-center text-xs">
                          {o.deliveryDate || "-"}
                        </td>
                        <td className="text-center">
                          <OrderStatusPill status={o.status} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <OrderDetailModal
        order={selectedOrder}
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
    </>
  );
}
