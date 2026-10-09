import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import {
  Badge, Btn, Card, Check, Confirm, EmptyState, Field, Input, Loading,
  Modal, Select, Td, Table, Textarea, useSearch, useToast,
} from "../ui.jsx";

/* ---------- 图标按钮 ---------- */
function IconBtn({ title, onClick, disabled, danger, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`w-8 h-8 inline-flex items-center justify-center rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed ${danger ? "text-slate-400 hover:text-red-600 hover:bg-red-50" : "text-slate-400 hover:text-blue-600 hover:bg-blue-50"}`}
    >
      {children}
    </button>
  );
}
const Svg = ({ d }) => (
  <svg className="w-[16px] h-[16px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

/* ---------- 添加/编辑代理弹窗 ---------- */
function ProxyModal({ init, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: init?.name || "",
    protocol: init?.protocol || "http",
    host: init?.host || "",
    port: init?.port ?? 8080,
    username: init?.username || "",
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const saveAndVerify = async () => {
    setErr("");
    if (!f.name || !f.host || !f.port) return setErr("请填写名称、主机名和端口");
    setBusy(true);
    try {
      let id = init?.id;
      const payload = { ...f, port: Number(f.port), is_default: init ? !!init.is_default : false };
      if (init) {
        await api.put(`/proxies/${init.id}`, payload);
      } else {
        const r = await api.post("/proxies", payload);
        id = r.id;
      }
      // 验证连通性
      try {
        const t = await api.post(`/proxies/${id}/test`);
        toast(t.message || "代理可用");
      } catch (e) {
        toast("已保存，验证失败：" + e.message);
      }
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const protos = ["http", "https", "socks5"];
  return (
    <Modal title={init ? "编辑代理" : "添加代理"} onClose={onClose}>
      <p className="text-[13px] text-slate-500 mb-4">支持 HTTP、HTTPS 和 SOCKS5，保存后可用于 Azure 账号请求。</p>
      <div className="space-y-5">
        <div>
          <div className="text-[14px] font-semibold text-slate-900">连接信息</div>
          <p className="text-[12px] text-slate-400 mt-0.5 mb-3">设置代理名称、协议和网络地址。</p>
          <div className="space-y-3">
            <Field label="名称（必填）">
              <Input value={f.name} placeholder="例如：主要出口代理" onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="协议">
              <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
                {protos.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setF({ ...f, protocol: p })}
                    className={`px-4 py-2 text-[13px] font-medium transition ${f.protocol === p ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    {p.toUpperCase()}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="主机名或 IP（必填）" className="col-span-2">
                <Input value={f.host} placeholder="proxy.example.com" onChange={(e) => setF({ ...f, host: e.target.value })} />
              </Field>
              <Field label="端口（必填）">
                <Input type="number" value={f.port} onChange={(e) => setF({ ...f, port: e.target.value })} />
              </Field>
            </div>
          </div>
        </div>
        <div>
          <div className="text-[14px] font-semibold text-slate-900">代理认证</div>
          <p className="text-[12px] text-slate-400 mt-0.5 mb-3">如果代理无需认证，用户名和密码可以留空。</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="用户名"><Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
            <Field label="密码" hint={init ? "留空表示不修改" : ""}>
              <Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            </Field>
          </div>
        </div>
        {err && <p className="text-[13px] text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={onClose}>取消</Btn>
          <Btn disabled={busy} onClick={saveAndVerify}>＋ {busy ? "保存中..." : "保存并验证"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- 批量添加弹窗 ---------- */
const BATCH_EXAMPLES = [
  { t: "HTTP", s: "香港出口 | http://user:pass@1.2.3.4:8080" },
  { t: "SOCKS5", s: "日本出口 | socks5://5.6.7.8:1080" },
  { t: "省略协议", s: "新加坡出口 | 9.10.11.12:8080" },
  { t: "逗号分隔", s: "美国出口,https://13.14.15.16:443" },
];
const BATCH_PLACEHOLDER = `香港出口 | http://user:pass@1.2.3.4:8080
日本出口 | socks5://5.6.7.8:1080
新加坡出口 | 9.10.11.12:8080
美国出口,https://13.14.15.16:443`;

function parseProxyLine(line) {
  // 分隔出名称与地址
  let name = "", addr = line.trim();
  for (const sep of ["|", ",", "\t"]) {
    if (addr.includes(sep)) {
      const i = addr.indexOf(sep);
      name = addr.slice(0, i).trim();
      addr = addr.slice(i + 1).trim();
      break;
    }
  }
  if (!addr.includes("://") && /\s/.test(addr)) {
    const parts = addr.split(/\s+/);
    if (parts.length >= 2 && !name) { name = parts[0]; addr = parts.slice(1).join(" "); }
  }
  let protocol = "http";
  const m = addr.match(/^(https?|socks5):\/\//i);
  if (m) { protocol = m[1].toLowerCase(); addr = addr.slice(m[0].length); }
  let username = "", password = "";
  const at = addr.lastIndexOf("@");
  if (at > 0) {
    const auth = addr.slice(0, at);
    addr = addr.slice(at + 1);
    const ci = auth.indexOf(":");
    if (ci >= 0) { username = auth.slice(0, ci); password = auth.slice(ci + 1); }
    else username = auth;
  }
  const ci = addr.lastIndexOf(":");
  if (ci < 0) throw new Error(`地址缺少端口：${line}`);
  const host = addr.slice(0, ci).trim();
  const port = Number(addr.slice(ci + 1).trim());
  if (!host || !port) throw new Error(`地址格式错误：${line}`);
  if (!name) name = `${host}:${port}`;
  return { name, protocol, host, port, username, password };
}

function BatchModal({ onClose, onSaved }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async () => {
    setErr("");
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return setErr("请粘贴代理列表");
    if (lines.length > 100) return setErr("最多 100 条");
    let arr;
    try { arr = lines.map(parseProxyLine); }
    catch (e) { return setErr(e.message); }
    setBusy(true);
    try {
      for (const p of arr) await api.post("/proxies", p);
      toast(`已添加 ${arr.length} 个代理`);
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="批量添加" onClose={onClose} wide>
      <p className="text-[13px] text-slate-500 mb-3">粘贴代理列表，检查预览后一次提交。</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
        {BATCH_EXAMPLES.map((e) => (
          <div key={e.t} className="border border-slate-200 rounded-lg p-2.5">
            <div className="text-[12px] font-medium text-slate-500 mb-1">{e.t}</div>
            <div className="text-[12px] text-slate-600 font-mono break-all">{e.s}</div>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-slate-400 mb-2">每行一条，最多 100 条；HTTP、HTTPS、SOCKS5 均可，省略协议默认 HTTP。</p>
      <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-[12px]" placeholder={BATCH_PLACEHOLDER} />
      {err && <p className="text-[13px] text-red-600 mt-2">{err}</p>}
      <div className="flex justify-end gap-2 mt-3">
        <Btn variant="secondary" onClick={onClose}>取消</Btn>
        <Btn disabled={busy || !text.trim()} onClick={run}>{busy ? "保存中..." : "保存并验证"}</Btn>
      </div>
    </Modal>
  );
}

const STATUS_OPTS = [
  ["all", "全部状态"], ["healthy", "可用"], ["error", "异常"],
  ["inactive", "非活跃"], ["disabled", "已禁用"], ["verifying", "验证中"], ["unchecked", "未检查"],
];

export default function Proxies() {
  const [query] = useSearch();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusF, setStatusF] = useState("all");
  const [sel, setSel] = useState([]);
  const [modal, setModal] = useState(null);
  const [batch, setBatch] = useState(false);
  const [del, setDel] = useState(null);
  const [testing, setTesting] = useState(null);
  // 本地连通性状态：id -> healthy | error（后端无状态字段，测试后本地记录）
  const [localStatus, setLocalStatus] = useState({});

  const load = async () => {
    setLoading(true);
    try { setItems(await api.get("/proxies")); setSel([]); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { setSel([]); }, [query, statusF]);

  const statusOf = (p) => localStatus[p.id] || "unchecked";
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items || []).filter((p) => {
      if (statusF !== "all" && statusOf(p) !== statusF) return false;
      if (q && !((p.name || "").toLowerCase().includes(q) || `${p.host}:${p.port}`.includes(q))) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, statusF, localStatus]);

  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => setSel(sel.length === filtered.length ? [] : filtered.map((p) => p.id));

  const testOne = async (p) => {
    setTesting(p.id);
    try {
      const r = await api.post(`/proxies/${p.id}/test`);
      setLocalStatus((m) => ({ ...m, [p.id]: "healthy" }));
      toast(r.message || "代理可用");
    } catch (e) {
      setLocalStatus((m) => ({ ...m, [p.id]: "error" }));
      toast("测试失败：" + e.message);
    }
    setTesting(null);
  };

  const doDelete = async (ids) => {
    try {
      for (const id of ids) await api.del(`/proxies/${id}`);
      toast(`已删除 ${ids.length} 个代理`);
      load();
    } catch (e) { toast("删除失败：" + e.message); }
    setDel(null);
  };

  const statusBadge = (p) => {
    const s = statusOf(p);
    if (s === "healthy") return <Badge color="green">可用</Badge>;
    if (s === "error") return <Badge color="red">异常</Badge>;
    return <Badge color="gray">未检查</Badge>;
  };

  return (
    <>
      <div className="mb-4">
        <div className="text-[15px]">
          <span className="text-slate-500">Azure面板</span>
          <span className="text-slate-300 mx-1.5">/</span>
          <span className="font-medium text-slate-900">请求代理</span>
        </div>
        <h1 className="text-[20px] font-bold text-slate-900 mt-2">代理</h1>
        <p className="text-[13px] text-slate-500 mt-1">维护全局和私有 HTTP、HTTPS、SOCKS5 代理。</p>
      </div>
      <div className="flex justify-end gap-2 mb-4">
        <Btn variant="secondary" onClick={load}>刷新全部状态</Btn>
        <Btn variant="secondary" onClick={() => setBatch(true)}>批量添加</Btn>
        <Btn onClick={() => setModal({})}>+ 添加代理</Btn>
      </div>

      <Card title="代理列表" sub="已被 Azure 账号引用的代理不能删除。">
        <div className="flex items-center gap-2 mb-3">
          <Input placeholder="搜索代理名称或地址" className="max-w-xs" value={query} readOnly />
          <Select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="w-32">
            {STATUS_OPTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </Select>
        </div>
        <div className="flex items-center justify-between mb-2">
          <Check label="全选当前列表" checked={sel.length === filtered.length && filtered.length > 0} onChange={toggleAll} />
          <Btn variant="dangerOutline" disabled={sel.length === 0}
            title={sel.length === 0 ? "请先选择要删除的代理" : ""}
            onClick={() => sel.length > 0 && setDel(sel)}>
            批量删除{sel.length > 0 ? `（${sel.length}）` : ""}
          </Btn>
        </div>

        {loading ? <Loading /> : filtered.length === 0 ? (
          <EmptyState icon="🌐" text="暂无代理" />
        ) : (
          <>
            <Table cols={["名称", "类型", "状态", "绑定账户", "操作"]}>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <Td>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="w-4 h-4 accent-blue-600 mt-1 shrink-0" checked={sel.includes(p.id)} onChange={() => toggle(p.id)} />
                      <div>
                        <div className="font-medium text-slate-900">{p.name}</div>
                        <div className="text-[12px] text-slate-400 font-mono">{p.protocol}://{p.host}:{p.port}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>{p.is_default ? <Badge color="blue">全局</Badge> : <Badge color="gray">私人</Badge>}</Td>
                  <Td>{statusBadge(p)}</Td>
                  <Td>
                    {(p.bound_accounts || 0) > 0 ? (
                      <span title="绑定此代理且处于正常启用状态的账户数，悬停查看详情"
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 text-[12px] font-semibold cursor-help">
                        {p.bound_accounts}
                      </span>
                    ) : <span className="text-slate-400">—</span>}
                  </Td>
                  <Td>
                    <div className="flex gap-0.5 whitespace-nowrap">
                      <IconBtn title="测试连通性" onClick={() => testOne(p)} disabled={testing === p.id}>
                        <Svg d="M16 4h5v5M21 4l-8.5 8.5M21 12a9 9 0 11-2.6-6.4" />
                      </IconBtn>
                      <IconBtn title="编辑" onClick={() => setModal({ init: p })}>
                        <Svg d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </IconBtn>
                      <IconBtn title="删除" danger onClick={() => setDel([p.id])}>
                        <Svg d="M19 7l-.9 12.1A2 2 0 0116.1 21H7.9a2 2 0 01-2-1.9L5 7M10 11v6M14 11v6M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                      </IconBtn>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            <div className="text-[12px] text-slate-400 mt-3">显示 {filtered.length} / {items.length} 项 · 切换筛选条件会清空选择。全选仅用于当前列表。</div>
          </>
        )}
      </Card>

      {modal && <ProxyModal init={modal.init} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {batch && <BatchModal onClose={() => setBatch(false)} onSaved={() => { setBatch(false); load(); }} />}
      {del && (
        <Confirm title="删除代理" danger okLabel="删除"
          text={`确定删除选中的 ${del.length} 个代理吗？此操作不可恢复。`}
          onCancel={() => setDel(null)}
          onOk={() => doDelete(del)} />
      )}
    </>
  );
}
