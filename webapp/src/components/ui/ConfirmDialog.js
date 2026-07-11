"use client";
import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = "ยืนยันการทำรายการ",
  message = "คุณแน่ใจหรือไม่ว่าต้องการดำเนินการนี้?",
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  isDanger = false,
  isLoading = false
}) {
  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={!isLoading ? onClose : undefined}
      />
      
      {/* Dialog */}
      <div className="relative bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-5">
          <div className="flex gap-4">
            <div className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full ${isDanger ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[var(--text)] mb-1">{title}</h3>
              <p className="text-sm text-[var(--text-2)]">{message}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-[var(--panel-2)]/50 px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium text-[var(--text-2)] bg-transparent border border-transparent rounded-lg hover:bg-black/5 hover:text-[var(--text)] transition-colors disabled:opacity-50"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors shadow-sm disabled:opacity-50
              ${isDanger ? 'bg-red-600 hover:bg-red-700 focus:ring-2 focus:ring-red-500/30' : 'bg-[var(--navy)] hover:bg-opacity-90 focus:ring-2 focus:ring-[var(--navy)]/30'}`}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'กำลังประมวลผล...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
