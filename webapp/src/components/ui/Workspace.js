"use client";

// Generic page shell shared across modules (tax, master data, …). Collapses the
// header + loading-spinner + section spacing that pages would otherwise
// copy-paste, so each page only describes its content. Originally lived as
// TaxWorkspace; promoted to the shared UI layer (generic name) per the
// shared-ui rollout.
//
// Props:
//   icon        — lucide icon element (e.g. <Building2 size={22} />)
//   title       — page title
//   subtitle    — one-line description under the title
//   headerRight — ReactNode shown on the right of the header (counts, buttons)
//   rail        — ReactNode pinned under the header (stage rail / stat cards)
//   toolbar     — ReactNode (search / filters) shown above the body
//   loading     — when true, render a centred spinner instead of children
//   children    — page body
export default function Workspace({ icon, title, subtitle, headerRight, rail, toolbar, loading, children }) {
  return (
    <>
      <div className="premium-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="header-content">
          <h1>
            {icon && <span className="premium-header-icon">{icon}</span>} {title}
          </h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {headerRight && <div className="flex items-center gap-3">{headerRight}</div>}
      </div>

      {rail && <div className="flex flex-col gap-5 mb-6">{rail}</div>}

      {toolbar && <div className="mb-5">{toolbar}</div>}

      {loading ? <Spinner /> : children}
    </>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center p-12">
      <svg className="animate-spin h-8 w-8 text-[var(--accent)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>
  );
}
