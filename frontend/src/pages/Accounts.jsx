import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { publishAccountOverview } from "../overviewSync.js";
import {
  Badge, Btn, Check, Confirm, EmptyState, Field, Input, Loading,
  Modal, Select, StatusBadge, Textarea, useSearch, useToast,
} from "../ui.jsx";

const Svg = ({ d }) => (
  <svg className="w-[16px] h-[16px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const toFlagEmoji = (code) => {
  const cc = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  return cc.replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
};

const CountryMark = ({ code }) => {
  const cc = String(code || "").trim().toUpperCase();
  const flag = toFlagEmoji(cc);
  if (flag) return <span className="text-base leading-none" title={`注册国家/地区：${cc}`}>{flag}</span>;
  return <span className="text-[12px] text-slate-300" title="暂未检测到注册国家/地区">—</span>;
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const normalized = String(value).replace(" ", "T");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("zh-CN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
};

function AccountIcon() {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
      <Svg d="M3.5 19.5h17M7 16.5V9l5-3 5 3v7.5M9.5 16.5v-4h5v4" />
    </span>
  );
}

function ActionButton({ title, onClick, disabled, danger, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-40 ${danger ? "text-red-500 hover:bg-red-50 hover:text-red-600" : "text-slate-700 hover:bg-blue-50 hover:text-blue-600"}`}
    >
      {children}
    </button>
  );
}

/* ---------- 添加账号弹窗（服务主体凭据 → 查询订阅 → 保存） ---------- */
function AccountModal({ proxies, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ alias: "", tenant_id: "", client_id: "", client_secret: "", proxy_id: "" });
  const [subs, setSubs] = useState(null); // 查询到的订阅列表
  const [subId, setSubId] = useState("");
  const [manual, setManual] = useState(false); // 手动填写订阅 ID
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const querySubs = async () => {
    setErr("");
    if (!f.tenant_id || !f.client_id || !f.client_secret) return setErr("请先填写 Tenant ID、Client ID 和 Client Secret");
    setBusy(true);
    try {
      const r = await api.post("/accounts/test", {
        tenant_id: f.tenant_id.trim(),
        client_id: f.client_id.trim(),
        client_secret: f.client_secret,
      }, { timeout: 45000 });
      const list = r.subscriptions || (r.subscription_id ? [{ subscription_id: r.subscription_id, subscription_name: r.subscription_name || "" }] : []);
      if (list.length === 0) {
        setManual(true);
        return setErr("未返回订阅列表，请手动填写 Subscription ID");
      }
      setSubs(list);
      if (list.length === 1) setSubId(list[0].subscription_id);
      setManual(false);
    } catch (e) {
      // 后端暂无该接口时降级为手动填写
      setManual(true);
      setErr(e.message.includes("404") ? "订阅查询接口暂不可用，请手动填写 Subscription ID" : e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setErr("");
    const sid = manual ? f.subscription_id_manual : subId;
    if (!f.alias || !sid) return setErr("请填写备注并选择/填写订阅");
    setSaving(true);
    try {
      await api.post("/accounts", {
        alias: f.alias.trim(),
        tenant_id: f.tenant_id.trim(),
        client_id: f.client_id.trim(),
        client_secret: f.client_secret,
        subscription_id: sid.trim(),
        proxy_id: f.proxy_id ? Number(f.proxy_id) : null,
      }, { timeout: 60000 });
      toast("账号已添加");
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="服务主体凭据" onClose={onClose}>
      <p className="text-[13px] text-slate-500 mb-4">输入服务主体凭据并通过所选代理查询可访问的订阅，然后选择要添加的订阅。只有一个结果时会自动选中。</p>
      <div className="space-y-3">
        <Field label="Tenant ID"><Input value={f.tenant_id} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" onChange={(e) => setF({ ...f, tenant_id: e.target.value })} /></Field>
        <Field label="Client ID"><Input value={f.client_id} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" onChange={(e) => setF({ ...f, client_id: e.target.value })} /></Field>
        <Field label="Client Secret"><Input type="password" value={f.client_secret} onChange={(e) => setF({ ...f, client_secret: e.target.value })} /></Field>
        <Field label="备注"><Input value={f.alias} placeholder="如：主订阅" onChange={(e) => setF({ ...f, alias: e.target.value })} /></Field>
        <Field label="代理地址">
          <Select value={f.proxy_id} onChange={(e) => setF({ ...f, proxy_id: e.target.value })}>
            <option value="">不使用代理</option>
            {proxies.map((p) => <option key={p.id} value={p.id}>{p.name}（{p.protocol}://{p.host}:{p.port}）</option>)}
          </Select>
        </Field>

        {subs && !manual && (
          <Field label="选择订阅">
            <div className="space-y-2 max-h-44 overflow-y-auto border border-slate-200 rounded-lg p-3">
              {subs.map((s) => (
                <label key={s.subscription_id} className="flex items-start gap-2 text-[13px] cursor-pointer">
                  <input type="radio" name="sub" className="mt-1 accent-blue-600" checked={subId === s.subscription_id} onChange={() => setSubId(s.subscription_id)} />
                  <span>
                    <span className="text-slate-900 font-medium">{s.subscription_name || "—"}</span>
                    <span className="block text-[12px] text-slate-400 font-mono">{s.subscription_id}</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
        )}
        {manual && (
          <Field label="Subscription ID">
            <Input value={f.subscription_id_manual || ""} placeholder="手动填写订阅 ID" onChange={(e) => setF({ ...f, subscription_id_manual: e.target.value })} />
          </Field>
        )}

        {err && <p className="text-[13px] text-red-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="secondary" onClick={onClose}>取消</Btn>
          {!subs && !manual ? (
            <Btn disabled={busy} onClick={querySubs}>{busy ? "查询中..." : "查询订阅"}</Btn>
          ) : (
            <Btn disabled={saving} onClick={save}>{saving ? "保存中..." : "保存账号"}</Btn>
          )}
          <Btn variant="secondary" onClick={onClose}>关闭</Btn>
        </div>
        <p className="text-[12px] text-slate-400">提示：可用 Azure CLI 命令 <span className="font-mono">az ad sp create-for-rbac</span> 创建服务主体。</p>
      </div>
    </Modal>
  );
}

/* ---------- 编辑账号弹窗 ---------- */
function EditModal({ proxies, init, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({
    alias: init?.alias || "",
    tenant_id: "",
    client_id: "",
    client_secret: "",
    subscription_id: "",
    proxy_id: init?.proxy_id || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    setErr("");
    if (!f.alias || !f.tenant_id || !f.client_id || !f.subscription_id)
      return setErr("请填写备注、Tenant ID、Client ID 和 Subscription ID（Client Secret 留空表示不改）");
    setBusy(true);
    try {
      await api.put(`/accounts/${init.id}`, {
        alias: f.alias,
        tenant_id: f.tenant_id,
        client_id: f.client_id,
        client_secret: f.client_secret,
        subscription_id: f.subscription_id,
        proxy_id: f.proxy_id ? Number(f.proxy_id) : null,
      });
      toast("账号已更新");
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="编辑 Azure 账号" onClose={onClose}>
      <div className="space-y-3">
        <Field label="备注"><Input value={f.alias} onChange={(e) => setF({ ...f, alias: e.target.value })} /></Field>
        <Field label="Tenant ID"><Input value={f.tenant_id} placeholder="重新填写" onChange={(e) => setF({ ...f, tenant_id: e.target.value })} /></Field>
        <Field label="Client ID"><Input value={f.client_id} placeholder="重新填写" onChange={(e) => setF({ ...f, client_id: e.target.value })} /></Field>
        <Field label="Client Secret" hint="留空表示不修改"><Input type="password" value={f.client_secret} onChange={(e) => setF({ ...f, client_secret: e.target.value })} /></Field>
        <Field label="Subscription ID"><Input value={f.subscription_id} placeholder="重新填写" onChange={(e) => setF({ ...f, subscription_id: e.target.value })} /></Field>
        <Field label="代理地址">
          <Select value={f.proxy_id} onChange={(e) => setF({ ...f, proxy_id: e.target.value })}>
            <option value="">不使用代理</option>
            {proxies.map((p) => <option key={p.id} value={p.id}>{p.name}（{p.protocol}://{p.host}:{p.port}）</option>)}
          </Select>
        </Field>
        {err && <p className="text-[13px] text-red-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="secondary" onClick={onClose}>取消</Btn>
          <Btn disabled={busy} onClick={save}>{busy ? "保存中..." : "保存"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- 批量导入弹窗 ---------- */
const IMPORT_EXAMPLES = [
  { t: "竖线分隔", s: "主订阅 | 11111111-2222-3333-4444-555555555555 | aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee | 99999999-0000-1111-2222-333333333333 | secret123 | 香港出口 | 备注" },
  { t: "CSV 逗号", s: "主订阅,11111111-2222-3333-4444-555555555555,aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee,99999999-0000-1111-2222-333333333333,secret123,香港出口,备注" },
  { t: "空格分隔", s: "主订阅 11111111-2222-3333-4444-555555555555 aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee 99999999-0000-1111-2222-333333333333 secret123" },
  { t: "制表符", s: "主订阅\t11111111-2222-3333-4444-555555555555\taaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\t99999999-0000-1111-2222-333333333333\tsecret123" },
];
function ImportModal({ proxies, onClose, onSaved }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);

  const parse = () => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 50) throw new Error("最多 50 行");
    return lines.map((l, idx) => {
      let parts;
      if (l.includes("|")) parts = l.split("|").map((s) => s.trim());
      else if (l.includes("\t")) parts = l.split("\t").map((s) => s.trim());
      else if (l.includes(",")) parts = l.split(",").map((s) => s.trim());
      else parts = l.split(/\s+/);
      const [alias, tenant_id, client_id, subscription_id, client_secret, proxyName, _note] = parts;
      if (!alias || !tenant_id || !client_id || !subscription_id || !client_secret)
        throw new Error(`第 ${idx + 1} 行字段不足（需要：显示名称、Tenant ID、Client ID、Subscription ID、Client Secret）`);
      let proxy_id = null;
      if (proxyName) {
        const p = proxies.find((x) => x.name === proxyName);
        if (p) proxy_id = p.id;
      }
      return { alias, tenant_id, client_id, subscription_id, client_secret, proxy_id };
    });
  };

  const run = async () => {
    setErr(""); setResult(null);
    let arr;
    try { arr = parse(); } catch (e) { return setErr(e.message); }
    if (arr.length === 0) return setErr("请输入账户信息");
    setBusy(true);
    try {
      const r = await api.post("/accounts/batch-import", { accounts: arr }, { timeout: 120000 });
      setResult(r);
      toast("批量导入完成");
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="批量导入账户" onClose={onClose} wide>
      <p className="text-[13px] text-slate-500 mb-3">在一个输入框中粘贴账户信息，确认格式后一次提交。</p>
      <div className="mb-3">
        <div className="text-[13px] font-medium text-slate-700 mb-1.5">显示名称 | Tenant ID | Client ID | Subscription ID | Client Secret | 代理 | 备注</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {IMPORT_EXAMPLES.map((e) => (
            <div key={e.t} className="border border-slate-200 rounded-lg p-2.5">
              <div className="text-[12px] font-medium text-slate-500 mb-1">{e.t}</div>
              <div className="text-[12px] text-slate-600 font-mono break-all whitespace-pre-wrap">{e.s}</div>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-slate-400 mt-2">每行一个账户，最多 50 行。</p>
      </div>
      <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-[12px]" placeholder="粘贴账户信息…" />
      {err && <p className="text-[13px] text-red-600 mt-2">{err}</p>}
      {result && (
        <div className="text-[13px] space-y-1 max-h-40 overflow-y-auto border border-slate-100 rounded-lg p-3 mt-2">
          {result.map((r, i) => (
            <div key={i} className={r.ok ? "text-green-700" : "text-red-600"}>
              {r.alias}: {r.ok ? "成功" : r.error}
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2 mt-3">
        <Btn variant="secondary" onClick={onClose}>关闭</Btn>
        <Btn disabled={busy || !text.trim()} onClick={run}>{busy ? "导入中..." : "开始批量导入"}</Btn>
      </div>
    </Modal>
  );
}

const STATUS_OPTS = [
  ["all", "全部状态"], ["healthy", "可用"], ["error", "异常"],
  ["inactive", "非活跃"], ["disabled", "已禁用"], ["verifying", "验证中"], ["unchecked", "未检查"],
];

function AccountsView({ query, setQuery, statusF, setStatusF, filtered, items, loading, sel, toggle, toggleAll, refreshAll, setImportOpen, setAddOpen, setConfirmDel, testing, testOne, setEditInit }) {
  return (
    <>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[20px] font-semibold tracking-tight text-slate-950">
            <span className="text-slate-500">AzureIn</span>
            <span className="mx-2 text-slate-300">/</span>
            <span>Azure 账号</span>
          </div>
          <p className="mt-1 text-[13px] text-slate-500">管理服务主体凭据和请求代理。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Btn variant="secondary" className="h-10 rounded-xl bg-slate-50 px-4 text-slate-900 hover:bg-slate-100" onClick={refreshAll}>
            <Svg d="M16 4h5v5M21 4l-8.5 8.5M21 12a9 9 0 11-2.6-6.4" /> 批量刷新状态
          </Btn>
          <Btn variant="secondary" className="h-10 rounded-xl bg-slate-50 px-4 text-slate-900 hover:bg-slate-100" onClick={() => setImportOpen(true)}>
            <Svg d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" /> 批量导入账户
          </Btn>
          <Btn className="h-10 rounded-xl px-5 text-[14px] shadow-sm" onClick={() => setAddOpen(true)}>
            <Svg d="M12 5v14M5 12h14" /> 添加 Azure 账号
          </Btn>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-slate-950">账号列表</h2>
            <p className="mt-1 text-sm text-slate-500">管理已接入的 Azure 账号、订阅状态和请求代理。</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-[360px]">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Svg d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 110-15 7.5 7.5 0 010 15z" />
              </span>
              <Input placeholder="搜索账户名称、Tenant ID 或订阅 ID" className="h-9 rounded-md pl-10 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="h-9 w-full rounded-md sm:w-36 text-sm">
              {STATUS_OPTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </Select>
          </div>
        </div>

        <div className="p-4">
          <div className="mb-5 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <Check label="全选当前列表" checked={sel.length === filtered.length && filtered.length > 0} onChange={toggleAll} />
            <Btn variant="danger" className="rounded-xl bg-red-500 px-4 hover:bg-red-600" disabled={sel.length === 0}
              title={sel.length === 0 ? "请先选择要删除的账号" : ""}
              onClick={() => sel.length > 0 && setConfirmDel("batch")}>
              <Svg d="M19 7l-.9 12.1A2 2 0 0116.1 21H7.9a2 2 0 01-2-1.9L5 7M10 11v6M14 11v6M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
              批量删除{sel.length > 0 ? `（${sel.length}）` : ""}
            </Btn>
          </div>

          {loading ? <Loading /> : filtered.length === 0 ? (
            <EmptyState icon="🔑" text="还没有 Azure 账号" />
          ) : (
            <>
              <div className="w-full overflow-hidden">
                <table className="w-full table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-[27%]" />
                    <col className="w-[16%]" />
                    <col className="w-[20%]" />
                    <col className="w-[13%]" />
                    <col className="w-[12%]" />
                    <col className="w-[12%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="px-3 h-10 font-medium text-xs align-middle text-center">名称</th>
                      <th className="px-3 h-10 font-medium text-xs align-middle text-center">账户类型</th>
                      <th className="px-3 h-10 font-medium text-xs align-middle text-center pl-8">代理</th>
                      <th className="px-3 h-10 font-medium text-xs align-middle text-center">订阅状态</th>
                      <th className="px-3 h-10 font-medium text-xs align-middle text-center">最后检测</th>
                      <th className="px-3 h-10 font-medium text-xs align-middle text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => {
                      return (
                        <tr key={a.id} className="border-b border-slate-100 transition hover:bg-slate-50/70">
                          <td className="p-3 align-middle">
                            <div className="flex min-w-0 items-center gap-3">
                              <input type="checkbox" className="h-4 w-4 shrink-0 rounded border-slate-300 accent-blue-600" checked={sel.includes(a.id)} onChange={() => toggle(a.id)} />
                              <AccountIcon />
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-950">
                                  <span className="truncate" title={a.alias}>{a.alias}</span>
                                  <CountryMark code={a.country_code} />
                                </div>
                                <div className="mt-1 truncate font-mono text-[12px] leading-5 text-slate-500" title={a.tenant_id || "—"}>{a.tenant_id || "—"}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 align-middle">
                            <Badge color="blue" className="max-w-full rounded-full px-3 py-1 text-[13px]">
                              <span className="mr-1 shrink-0">◇</span><span className="min-w-0 truncate" title={a.subscription_name || a.quota_tier || "Microsoft Azure 计划"}>{a.subscription_name || a.quota_tier || "Microsoft Azure 计划"}</span>
                            </Badge>
                          </td>
                          <td className="p-3 align-middle pl-8">
                            {a.proxy_url || a.proxy_name ? <div className="truncate font-mono text-[13px] leading-5 text-slate-600" title={a.proxy_url || a.proxy_name}>{a.proxy_url || a.proxy_name}</div> : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="p-3 align-middle"><StatusBadge status={a.status} />{a.status_msg && <div className="mt-1 truncate text-[12px] text-red-500" title={a.status_msg}>{a.status_msg}</div>}</td>
                          <td className="p-3 align-middle truncate text-slate-500" title={formatDateTime(a.last_checked)}>{formatDateTime(a.last_checked)}</td>
                          <td className="p-3 align-middle">
                            <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                              <ActionButton title="重新检测账户状态" onClick={() => testOne(a)} disabled={testing === a.id}><Svg d="M16 4h5v5M21 4l-8.5 8.5M21 12a9 9 0 11-2.6-6.4" /></ActionButton>
                              <ActionButton title="编辑" onClick={() => setEditInit(a)}><Svg d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></ActionButton>
                              <ActionButton title="删除" danger onClick={() => setConfirmDel(a.id)}><Svg d="M19 7l-.9 12.1A2 2 0 0116.1 21H7.9a2 2 0 01-2-1.9L5 7M10 11v6M14 11v6M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" /></ActionButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-[12px] text-slate-400">显示 {filtered.length} / {items.length} 项 · 切换筛选条件会清空选择。全选仅作用于当前列表。</div>
            </>
          )}
        </div>
      </section>
    </>
  );
}

export default function Accounts() {
  const [query, setQuery] = useSearch();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [proxies, setProxies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusF, setStatusF] = useState("all");
  const [sel, setSel] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editInit, setEditInit] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [testing, setTesting] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api.get("/accounts");
      const nextItems = d.items || [];
      setItems(nextItems);
      publishAccountOverview(nextItems);
      setSel([]);
    } finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    api.get("/proxies").then((d) => setProxies(d || [])).catch(() => {});
  }, []);

  // 切换筛选条件清空选择
  useEffect(() => { setSel([]); }, [query, statusF]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((a) => {
      if (statusF !== "all" && a.status !== statusF) return false;
      if (q && !(
        (a.alias || "").toLowerCase().includes(q) ||
        (a.tenant_id || "").toLowerCase().includes(q) ||
        (a.subscription_id || "").toLowerCase().includes(q)
      )) return false;
      return true;
    });
  }, [items, query, statusF]);

  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => setSel(sel.length === filtered.length ? [] : filtered.map((a) => a.id));

  const doDelete = async (ids) => {
    try {
      if (ids.length === 1) await api.del(`/accounts/${ids[0]}`);
      else await api.post("/accounts/batch-delete", { ids });
      toast(`已删除 ${ids.length} 个账号`);
      load();
    } catch (e) { toast("删除失败：" + e.message); }
    setConfirmDel(null);
  };

  const refreshAll = async () => {
    toast("正在刷新全部账号状态...");
    try {
      await api.post("/accounts/batch-refresh");
      toast("刷新完成");
      load();
    } catch (e) { toast("刷新失败：" + e.message); }
  };

  const testOne = async (a) => {
    setTesting(a.id);
    try {
      const r = await api.post(`/accounts/${a.id}/test`);
      toast(`连接正常${r.subscription_name ? "：" + r.subscription_name : ""}`);
      load();
    } catch (e) { toast("测试失败：" + e.message); }
    setTesting(null);
  };

  return (
    <>
      <AccountsView
        query={query}
        setQuery={setQuery}
        statusF={statusF}
        setStatusF={setStatusF}
        filtered={filtered}
        items={items}
        loading={loading}
        sel={sel}
        toggle={toggle}
        toggleAll={toggleAll}
        refreshAll={refreshAll}
        setImportOpen={setImportOpen}
        setAddOpen={setAddOpen}
        setConfirmDel={setConfirmDel}
        testing={testing}
        testOne={testOne}
        setEditInit={setEditInit}
      />

      {addOpen && <AccountModal proxies={proxies} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />}
      {editInit && <EditModal proxies={proxies} init={editInit} onClose={() => setEditInit(null)} onSaved={() => { setEditInit(null); load(); }} />}
      {importOpen && <ImportModal proxies={proxies} onClose={() => setImportOpen(false)} onSaved={load} />}
      {confirmDel && (
        <Confirm title="删除账号" danger okLabel="删除"
          text={confirmDel === "batch" ? `确定删除选中的 ${sel.length} 个账号吗？` : "确定删除该账号吗？此操作不可恢复。"}
          onCancel={() => setConfirmDel(null)}
          onOk={() => doDelete(confirmDel === "batch" ? sel : [confirmDel])} />
      )}
    </>
  );
}
