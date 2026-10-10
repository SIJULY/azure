import { createContext, useCallback, useContext, useState } from "react";
import { Link } from "react-router-dom";
import { Card as ShadcnCard, CardHeader, CardTitle, CardDescription, CardContent } from "./components/ui/card.jsx";
import { Button } from "./components/ui/button.jsx";
import { Input as ShadcnInput } from "./components/ui/input.jsx";
import { Badge as ShadcnBadge } from "./components/ui/badge.jsx";
import { cn } from "./lib/utils.js";

/* ---------- 卡片 ---------- */
export function Card({ title, sub, extra, children, className = "" }) {
  return (
    <ShadcnCard className={className}>
      {(title || extra) && (
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
          <div>
            {title && <CardTitle className="text-sm">{title}</CardTitle>}
            {sub && <CardDescription className="mt-1">{sub}</CardDescription>}
          </div>
          {extra && <div className="flex items-center gap-2 shrink-0">{extra}</div>}
        </CardHeader>
      )}
      <CardContent className={title || extra ? "" : "pt-6"}>{children}</CardContent>
    </ShadcnCard>
  );
}

/* ---------- 页面头：面包屑 + 副标题 ---------- */
export function PageHead({ crumb, sub }) {
  return (
    <div className="mb-4">
      <div className="text-[15px] text-slate-900">
        <span className="text-slate-500">Azure面板</span>
        <span className="text-slate-300 mx-1.5">/</span>
        <span className="font-medium">{crumb}</span>
      </div>
      {sub && <p className="text-[13px] text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

/* ---------- 按钮 ---------- */
const btnVariantMap = {
  primary: "default",
  secondary: "secondary",
  dangerOutline: "outline",
  danger: "destructive",
  ghost: "ghost",
  dark: "default",
};
export function Btn({ variant = "primary", className = "", ...rest }) {
  const v = btnVariantMap[variant] || "default";
  return <Button variant={v} className={cn(variant === "dangerOutline" && "text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive", className)} {...rest} />;
}

/* ---------- 表单 ---------- */
export const Input = (p) => <ShadcnInput {...p} className={cn(p.className)} />;
export const Select = (p) => (
  <select
    {...p}
    className={cn(
      "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      p.className
    )}
  >
    {p.children}
  </select>
);
export const Textarea = (p) => (
  <textarea {...p} className={`${inputCls} ${p.className || ""}`} />
);
export function Field({ label, children, hint, className = "" }) {
  return (
    <div className={className}>
      {label && <div className="text-[13px] font-medium text-slate-700 mb-1.5">{label}</div>}
      {children}
      {hint && <div className="text-[12px] text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}
export function Check({ label, ...rest }) {
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer select-none">
      <input type="checkbox" className="w-4 h-4 accent-blue-600" {...rest} />
      {label}
    </label>
  );
}

/* ---------- 弹窗 ---------- */
export function Modal({ title, onClose, children, wide = false, className = "", bodyClassName = "" }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div
        className={`relative bg-white rounded-xl shadow-xl w-full ${
          wide ? "max-w-3xl" : "max-w-lg"
        } max-h-[90vh] flex flex-col ${className}`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none px-1">
            ×
          </button>
        </div>
        <div className={`px-5 py-4 overflow-y-auto ${bodyClassName}`}>{children}</div>
      </div>
    </div>
  );
}

/* ---------- 表格 ---------- */
export function Table({ cols, children, className = "" }) {
  return (
    <div className={cn("relative w-full overflow-auto", className)}>
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b">
          <tr className="border-b transition-colors">
            {cols.map((c, i) => (
              <th key={i} className="h-10 px-2 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = (p) => (
  <td {...p} className={cn("p-2 align-middle", p.className)} />
);

/* ---------- 空状态 ---------- */
export function EmptyState({ icon = "📦", text }) {
  return (
    <div className="py-14 flex flex-col items-center justify-center text-center">
      <div className="text-4xl mb-3 opacity-60">{icon}</div>
      <div className="text-[13px] text-slate-400">{text}</div>
    </div>
  );
}

/* ---------- 徽章 ---------- */
const badgeVariantMap = {
  gray: "secondary",
  blue: "default",
  green: "default",
  red: "destructive",
  amber: "secondary",
  yellow: "secondary",
};
export function Badge({ color = "gray", children, className = "" }) {
  const v = badgeVariantMap[color] || "secondary";
  return (
    <ShadcnBadge
      variant={v}
      className={cn(
        color === "green" && "bg-green-100 text-green-800 border-transparent hover:bg-green-100",
        color === "blue" && "bg-blue-100 text-blue-800 border-transparent hover:bg-blue-100",
        color === "amber" && "bg-amber-100 text-amber-800 border-transparent hover:bg-amber-100",
        color === "yellow" && "bg-yellow-100 text-yellow-800 border-transparent hover:bg-yellow-100",
        className
      )}
    >
      {children}
    </ShadcnBadge>
  );
}

export function StatusBadge({ status }) {
  const map = {
    pending: ["gray", "等待中"],
    running: ["blue", "运行中"],
    success: ["green", "成功"],
    failed: ["red", "失败"],
    healthy: ["green", "已启用"],
    error: ["red", "异常"],
  };
  const [c, t] = map[status] || ["gray", status || "-"];
  return <Badge color={c}>{t}</Badge>;
}

export function Spinner({ className = "" }) {
  return (
    <span
      className={`inline-block w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin ${className}`}
    />
  );
}

export function Loading({ text = "加载中..." }) {
  return (
    <div className="py-14 flex items-center justify-center gap-2 text-slate-400 text-[13px]">
      <Spinner /> {text}
    </div>
  );
}

/* ---------- Toast ---------- */
const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

let toastSeq = 0;
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, opts = {}) => {
    const id = ++toastSeq;
    setToasts((ts) => [...ts, { id, msg, action: opts.action, actionLabel: opts.actionLabel }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), opts.ms || 6000);
  }, []);
  const dismiss = useCallback((id) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2 items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="bg-slate-900 text-white text-[13px] rounded-lg px-4 py-3 shadow-lg flex items-center gap-3 max-w-sm"
          >
            <span>{t.msg}</span>
            {t.action && (
              <Link to={t.action} onClick={() => dismiss(t.id)} className="text-blue-300 hover:text-blue-200 font-medium shrink-0">
                {t.actionLabel || "查看"}
              </Link>
            )}
            <button onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-white">×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- 顶部搜索（过滤当前页表格） ---------- */
const SearchCtx = createContext(["", () => {}]);
export const useSearch = () => useContext(SearchCtx);
export const SearchProvider = SearchCtx.Provider;

/* ---------- 确认框 ---------- */
export function Confirm({ title, text, onOk, onCancel, okLabel = "确定", danger = false }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-[13px] text-slate-600 mb-5">{text}</p>
      <div className="flex justify-end gap-2">
        <Btn variant="secondary" onClick={onCancel}>取消</Btn>
        <Btn variant={danger ? "danger" : "primary"} onClick={onOk}>{okLabel}</Btn>
      </div>
    </Modal>
  );
}
