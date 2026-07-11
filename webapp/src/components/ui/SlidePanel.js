"use client";
import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export default function SlidePanel({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  footer,
  width = 'max-w-md' // standard widths: max-w-md, max-w-lg, max-w-xl, max-w-2xl
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
    <div className="fixed inset-0 z-[200] overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="absolute inset-y-0 right-0 flex max-w-full">
        <div className={`w-screen ${width} transform transition-transform duration-300 ease-in-out`}>
          <div className="flex h-full flex-col bg-[var(--panel)] shadow-xl border-l border-[var(--border)]">
            
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
              <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
              <button
                type="button"
                className="rounded-full p-2 text-[var(--text-3)] hover:bg-[var(--panel-2)] hover:text-[var(--text)] transition-colors"
                onClick={onClose}
              >
                <span className="sr-only">Close panel</span>
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="relative flex-1 overflow-y-auto p-6">
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border)] bg-[var(--panel-2)]/50">
                {footer}
              </div>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
}
