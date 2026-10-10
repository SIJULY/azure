import { createContext, useCallback, useContext, useState } from "react";
import { Link } from "react-router-dom";

/* ---------- 卡片 ---------- */
export function Card({ title, sub, extra, children, className = "" }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl ${className}`}>
      {(title || extra) && (
        <div className="flex items-start justify-between p-4 pb-2">
          <div>
            {title && <h3 className="text-[14px] font-semibold text-slate-900">{title}</h3>}
            {sub && <p className="text-[12px] text-slate-500 mt-0.5">{sub}</p>}
          </div>
          {extra && <div className="flex items-center gap-2 shrink-0">{extra}</div>}
        </div>
      )}
      <div className="px-4 pb-4">{children}</div>
    </div>
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
const btnBase =
  "inline-flex items-center justify-center gap-1.5 text-sm font-medium rounded-md px-4 h-9 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";
const btnVariants = {
  primary: "bg-blue-600 hover:bg-blue-700 text-white",
  secondary: "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50",
  dangerOutline: "bg-white border border-red-300 text-red-600 hover:bg-red-50",
  danger: "bg-red-600 hover:bg-red-700 text-white",
  ghost: "text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-2",
  dark: "bg-slate-900 hover:bg-slate-800 text-white",
};
export function Btn({ variant = "primary", className = "", ...rest }) {
  return (
    <button className={`${btnBase} ${btnVariants[variant] || ""} ${className}`} {...rest} />
  );
}

/* ---------- 表单 ---------- */
const inputCls =
  "w-full text-[13px] border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400";
export const Input = (p) => <input {...p} className={`${inputCls} ${p.className || ""}`} />;
export const Select = (p) => (
  <select {...p} className={`${inputCls} ${p.className || ""}`}>
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
    <div className={`overflow-x-auto -mx-5 px-5 ${className}`}>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-slate-50 text-slate-500 text-left">
            {cols.map((c, i) => (
              <th key={i} className="font-medium px-3 py-2.5 whitespace-nowrap first:rounded-l-lg last:rounded-r-lg">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = (p) => (
  <td {...p} className={`px-3 py-3 text-slate-700 align-middle ${p.className || ""}`} />
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
const badgeColors = {
  gray: "bg-slate-100 text-slate-600",
  blue: "bg-blue-50 text-blue-700",
  green: "bg-green-50 text-green-700",
  red: "bg-red-50 text-red-700",
  amber: "bg-amber-50 text-amber-700",
};
export function Badge({ color = "gray", children, className = "" }) {
  return (
    <span
      className={`inline-flex items-center text-[12px] font-medium px-2 py-0.5 rounded-full ${badgeColors[color]} ${className}`}
    >
      {children}
    </span>
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
