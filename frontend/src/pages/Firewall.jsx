import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import {
  Badge, Btn, Card, EmptyState, Field, Loading,
  PageHead, Select, Table, Td, useSearch, useToast,
} from "../ui.jsx";

export default function Firewall() {
  const toast = useToast();
  const [q] = useSearch();
  const [params] = useSearchParams();
  const vmParam = params.get("vm") || "";
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [vms, setVms] = useState([]);
  const [vmName, setVmName] = useState(vmParam);
  const [nsgs, setNsgs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/accounts").then((d) => {
      const items = d.items || [];
      setAccounts(items);
      if (items.length) setAccountId(String(items[0].id));
    }).catch(() => {});
  }, []);

  const load = async (force = false) => {
    if (!accountId) return;
    if (!force) setLoading(true);
    try {
      const suffix = force ? "&refresh=true" : "";
      const [n, v] = await Promise.all([
        api.get(`/firewall?account_id=${accountId}${suffix}`),
        api.get(`/vms?account_id=${accountId}${suffix}`).catch(() => ({ vms: [] })),
      ]);
      setNsgs((prev) => {
        try { if (JSON.stringify(prev) !== JSON.stringify(n || [])) return n || []; } catch {}
        return prev;
      });
      setVms((prev) => {
        const nv = v.vms || [];
        try { if (JSON.stringify(prev) !== JSON.stringify(nv)) return nv; } catch {}
        return prev;
      });
    } catch (e) { if (!force) toast("加载失败：" + e.message); }
    finally { if (!force) setLoading(false); }
  };
  useEffect(() => {
    if (accountId) {
      setVmName(vmParam);
      load(false);
      const t = setTimeout(() => load(true), 1000);
      return () => clearTimeout(t);
    }
    /* eslint-disable-next-line */
  }, [accountId]);

  const vm = useMemo(() => vms.find((x) => x.name === vmName), [vms, vmName]);

  const scopedNsgs = useMemo(() => {
    if (!vm) return nsgs;
    const inRg = nsgs.filter((n) => n.resource_group === vm.resource_group);
    if (!inRg.length) return nsgs;
    const named = inRg.filter((n) => n.name.toLowerCase().includes(vm.name.toLowerCase()));
    return named.length ? named : inRg;
  }, [nsgs, vm]);

  const activeNsg = scopedNsgs[0] || null;

  const rows = useMemo(() => {
    const out = [];
    scopedNsgs.forEach((n) => (n.rules || []).forEach((r) => out.push({ ...r, _nsg: n })));
    const s = q.trim().toLowerCase();
    return s ? out.filter((r) => (r.name || "").toLowerCase().includes(s)) : out;
  }, [scopedNsgs, q]);

  const acct = accounts.find((a) => String(a.id) === String(accountId));
  const nicId = vm && acct
    ? `/subscriptions/${acct.subscription_id}/resourceGroups/${vm.resource_group}/providers/Microsoft.Network/networkInterfaces/${vm.name}`
    : "";

  return (
    <>
      <PageHead crumb="防火墙" sub="查看和管理每台机器的专用 NSG 规则。" />
      <div className="flex items-end gap-2 mb-4 flex-wrap">
        <Field label="Azure 账号" className="w-52">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">选择账号</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.alias}</option>)}
          </Select>
        </Field>
        <Field label="虚拟机" className="w-64">
          <Select value={vmName} onChange={(e) => setVmName(e.target.value)}>
            <option value="">全部机器</option>
            {vms.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} {v.resource_group} · {v.location} {v.status}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex-1" />
        <Btn variant="secondary" onClick={() => load(true)} disabled={loading}>{loading ? "刷新中" : "刷新"}</Btn>
      </div>

      <Card title="网络安全组作用域" className="mb-4">
        <p className="text-[13px] text-slate-600 mb-3">
          NSG 按数字更小的优先级先匹配；一旦匹配 Allow 或 Deny 就停止，不再看更低优先级规则。
        </p>
        <div className="flex gap-2 flex-wrap items-center text-[12px]">
          <span className="text-slate-400">NIC</span>
          <Badge color="blue">{vm ? vm.name : "—"}</Badge>
          <span className="text-slate-400 ml-2">NIC NSG</span>
          <Badge color="blue">{activeNsg ? activeNsg.name : "—"}</Badge>
          <span className="text-slate-400 ml-2">Subnet NSG</span>
          <Badge>—</Badge>
          <Badge color="green" className="ml-2">可编辑</Badge>
          <Badge>External NSG (read-only)</Badge>
        </div>
        <p className="text-[12px] text-slate-400 mt-3">
          连接刷新未开启：新连接受更新后的规则约束；已有连接可能继续保持，不保证稍后自动阻断。
        </p>
      </Card>

      <Card title="NIC NSG 规则" sub="自定义规则和 Azure 默认规则分开展示。有效规则还会合并子网 NSG。" className="mb-4">
        {loading ? <Loading /> : rows.length === 0 ? (
          <EmptyState icon="🛡️" text="暂无规则" />
        ) : (
          <Table cols={["优先级", "名称", "方向", "动作", "协议", "源", "目标"]}>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/60">
                <Td>{r.priority}</Td>
                <Td className="font-medium text-slate-900">{r.name}</Td>
                <Td>{r.direction}</Td>
                <Td>
                  {r.access === "Allow"
                    ? <span className="text-green-600 font-medium">Allow</span>
                    : <span className="text-red-600 font-medium">{r.access}</span>}
                </Td>
                <Td>{r.protocol}</Td>
                <Td className="font-mono text-[12px]">{r.src_prefix}:{r.src_port}</Td>
                <Td className="font-mono text-[12px]">*:{r.dst_port}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Azure 有效规则" sub={nicId || "选择虚拟机后显示其网卡的有效规则。"}>
        {loading ? <Loading /> : rows.length === 0 ? (
          <EmptyState icon="🛡️" text="暂无规则" />
        ) : (
          <Table cols={["优先级", "名称", "方向", "动作", "协议", "源", "目标"]}>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/60">
                <Td>{r.priority}</Td>
                <Td className="font-medium text-slate-900">{r.name}</Td>
                <Td>{r.direction}</Td>
                <Td>
                  {r.access === "Allow"
                    ? <span className="text-green-600 font-medium">Allow</span>
                    : <span className="text-red-600 font-medium">{r.access}</span>}
                </Td>
                <Td>{r.protocol}</Td>
                <Td className="font-mono text-[12px]">{r.src_prefix}:{r.src_port}</Td>
                <Td className="font-mono text-[12px]">*:{r.dst_port}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
