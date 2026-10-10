import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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

/* ---------- 页面头：标题已统一放到共享顶部栏 ---------- */
export function PageHead() {
  return null;
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
      {label && (
        <div className="text-[13px] font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
          {(label === "Azure 账号" || label === "Foundry 账号" || label === "选择账号") && (
            <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z" />
            </svg>
          )}
          {label === "区域" && (
            <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
          )}
          {label}
        </div>
      )}
      {children}
      {hint && <div className="text-[12px] text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}
function ChevronIcon() {
  return <svg className="h-4 w-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>;
}

export function AzureAccountIcon({ className = "h-5 w-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#0078D4" d="M8.2 3.2h6.1L7.95 21H2.2L8.2 3.2Z" />
      <path fill="#50A6F2" d="M15.1 3.2 21.8 21h-6.1l-1.35-3.8H8.1l3.92-5.74 2.11 5.74h-4.8L15.1 3.2Z" />
    </svg>
  );
}

export function RegionIcon({ className = "h-5 w-5" }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21s6-5.15 6-11a6 6 0 10-12 0c0 5.85 6 11 6 11z" /><circle cx="12" cy="10" r="2.25" /></svg>;
}

export function AccountMark({ account, label, meta, className = "" }) {
  const text = label ?? account?.alias ?? "请选择账号";
  const sub = meta ?? account?.subscription_id ?? "";
  return <span className={cn("flex min-w-0 items-center gap-2", className)}><AzureAccountIcon className="h-5 w-5 shrink-0" /><span className="min-w-0 flex-1"><span className="block truncate text-slate-900">{text}</span>{sub && <span className="block truncate font-mono text-[11px] text-slate-400">{sub}</span>}</span></span>;
}

export function RegionMark({ region, label, code, className = "" }) {
  const display = label ?? region?.label ?? region?.name ?? region?.name_cn ?? region?.code ?? region ?? "请选择区域";
  const regionCode = code ?? region?.code ?? (Array.isArray(region) ? region[0] : "");
  return <span className={cn("flex min-w-0 items-center gap-2", className)}><RegionIcon className="h-5 w-5 shrink-0 text-blue-600" /><span className="min-w-0 flex-1 truncate text-slate-900">{display}</span>{regionCode && <span className="shrink-0 font-mono text-[12px] text-slate-400">{regionCode}</span>}</span>;
}

function SelectPopover({ value, onChange, options, placeholder = "请选择", searchPlaceholder = "搜索...", renderValue, renderOption, className = "", disabled = false }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  const selected = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => String(o.searchText ?? o.label ?? o.value).toLowerCase().includes(s));
  }, [options, q]);

  const choose = (next) => { onChange?.(next); setOpen(false); setQ(""); };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-white px-3 py-1 text-left text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
        <span className="min-w-0 flex-1">{selected ? renderValue(selected) : <span className="text-slate-400">{placeholder}</span>}</span>
        <ChevronIcon />
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="h-8 text-[12px]" autoFocus /></div>
          <div className="max-h-64 overflow-auto py-1">
            {filtered.length === 0 ? <div className="px-3 py-3 text-[12px] text-slate-400">没有匹配项</div> : filtered.map((o) => (
              <button key={o.value} type="button" onClick={() => choose(o.value)} className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-blue-50", String(o.value) === String(value) && "bg-blue-50")}>{renderOption(o)}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AccountSelect({ accounts = [], value, onChange, includeAll = false, allLabel = "全部账户", tiers = {}, className = "", disabled = false }) {
  const options = useMemo(() => [
    ...(includeAll ? [{ value: "all", label: allLabel, searchText: allLabel, all: true }] : []),
    ...accounts.map((a) => ({
      value: String(a.id), label: a.alias || String(a.id), account: a,
      tier: tiers[a.id]?.quota_tier || tiers[a.id] || "",
      searchText: `${a.alias || ""} ${a.subscription_id || ""} ${a.subscription_name || ""} ${tiers[a.id]?.quota_tier || tiers[a.id] || ""}`,
    })),
  ], [accounts, allLabel, includeAll, tiers]);

  return <SelectPopover value={value} onChange={onChange} options={options} placeholder="请选择账号" searchPlaceholder="搜索账号名称或订阅 ID" className={className} disabled={disabled}
    renderValue={(o) => o.all ? <AccountMark label={o.label} /> : <AccountMark account={o.account} meta={o.tier || o.account?.subscription_id} />}
    renderOption={(o) => o.all ? <AccountMark label={o.label} /> : <><AccountMark account={o.account} /><span className="ml-auto shrink-0 text-[11px] text-blue-600">{o.tier}</span></>} />;
}

export function RegionSelect({ regions = [], value, onChange, includeAll = false, allLabel = "全部地区", className = "", disabled = false }) {
  const options = useMemo(() => {
    const list = regions.map((r) => {
      const isArray = Array.isArray(r);
      const code = isArray ? r[0] : (r.code ?? r.value ?? r);
      const label = isArray ? `${r[1] ? `(${r[1]}) ` : ""}${r[2] || r[0]}` : (r.label ?? r.name_cn ?? r.name ?? r);
      return { value: String(code), label, code: String(code), searchText: `${label} ${code}` };
    });
    return [...(includeAll ? [{ value: "all", label: allLabel, code: "", searchText: allLabel, all: true }] : []), ...list];
  }, [allLabel, includeAll, regions]);

  return <SelectPopover value={value} onChange={onChange} options={options} placeholder="请选择区域" searchPlaceholder="搜索区域名称或代码" className={className} disabled={disabled}
    renderValue={(o) => <RegionMark label={o.label} code={o.code} />}
    renderOption={(o) => <RegionMark label={o.label} code={o.code} />} />;
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
