import styles from "./Table.module.css";

export function TableToolbar({ children, className = "", ...props }) {
  return <div className={`${styles.toolbar} ${className}`.trim()} {...props}>{children}</div>;
}

export function TableScroll({
  children,
  family = "list",
  minWidth,
  className = "",
  ...props
}) {
  return (
    <div
      className={`${styles.scroll} ${className}`.trim()}
      data-family={family}
      style={minWidth ? { "--table-min-width": `${minWidth}px` } : undefined}
      {...props}
    >
      {children}
    </div>
  );
}

export function TableEmpty({
  title = "ยังไม่มีรายการ",
  description,
  action,
  colSpan,
}) {
  const content = (
    <div className={styles.empty}>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div className={styles.emptyAction}>{action}</div> : null}
    </div>
  );
  return colSpan ? <tr><td colSpan={colSpan}>{content}</td></tr> : content;
}

export function TableShell({
  title,
  description,
  actions,
  toolbar,
  footer,
  family = "list",
  minWidth,
  className = "",
  children,
}) {
  return (
    <section className={`${styles.shell} ${className}`.trim()} data-table-family={family}>
      {(title || description || actions) ? (
        <header className={styles.header}>
          <div className={styles.heading}>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </header>
      ) : null}
      {toolbar ? <TableToolbar>{toolbar}</TableToolbar> : null}
      <TableScroll family={family} minWidth={minWidth}>{children}</TableScroll>
      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
    </section>
  );
}

export default TableShell;
