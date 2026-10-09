import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import {
  Badge, Btn, Card, Confirm, EmptyState, Field, Input, Loading,
  Modal, PageHead, Select, Textarea, useSearch, useToast,
} from "../ui.jsx";
import { REGIONS, regionLabel } from "../regions.js";

const COMMON_IMAGES = [
  { key: "ubuntu2204", label: "Ubuntu Server 22.04 LTS" },
  { key: "ubuntu2004", label: "Ubuntu Server 20.04 LTS" },
  { key: "debian12", label: "Debian 12" },
  { key: "centos9", label: "CentOS Stream 9" },
  { key: "win2022", label: "Windows Server 2022 Datacenter" },
  { key: "win11", label: "Windows 11 Pro" },
];

function CreateModal({ accounts, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({
    account_id: accounts[0]?.id ? String(accounts[0].id) : "",
    vm_name: "", resource_group: "", region: "japaneast", vm_size: "",
    image_src: "common", os_image: "ubuntu2204", os_image_custom: "",
    username: "azureuser", password: "", ipv6: false, user_data: "#cloud-config",
  });
  const [rgs, setRgs] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [sizesBusy, setSizesBusy] = useState(false);
  const [marketImages, setMarketImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [apiRegions, setApiRegions] = useState([]);
  useEffect(() => {
    if (!f.account_id) return;
    api.get(`/resource-groups?account_id=${f.account_id}`).then((r) => setRgs(r || [])).catch(() => setRgs([]));
    // 拉取账号支持的区域（非静态全量列表）
    api.get(`/vms/meta?account_id=${f.account_id}&region=`)
      .then((d) => {
        const rs = (d.regions || []).map((r) => [r.code, "", r.name_cn || r.code]);
        if (rs.length) {
          setApiRegions(rs);
          // 如果当前选中的区域不在支持列表中，自动切换到第一个
          if (!rs.find((x) => x[0] === f.region)) {
            setF((prev) => ({ ...prev, region: rs[0][0], vm_size: "" }));
          }
        }
      })
      .catch(() => {});
  }, [f.account_id]);

  // CloudManager 同款：只显示 3 个免费试用规格（需该区域实际支持）
  const COMMON_VM_SIZES = [
    ["Standard_B1s", "Standard_B1s (有资格免费试用服务)"],
    ["Standard_B2ats_v2", "Standard_B2ats_v2 (基于 AMD, 有资格免费试用服务)"],
    ["Standard_B2pts_v2", "Standard_B2pts_v2 (基于 ARM, 有资格免费试用服务)"],
  ];
  const [allowCustomSize, setAllowCustomSize] = useState(false);

  useEffect(() => {
    if (!f.account_id || !f.region) { setSizes([]); return; }
    setSizesBusy(true);
    setAllowCustomSize(false);
    api.get(`/vms/meta?account_id=${f.account_id}&region=${f.region}`)
      .then((d) => {
        const allSizes = d.vm_sizes || [];
        // 只保留 3 个免费规格中该区域实际支持的
        const filtered = COMMON_VM_SIZES.filter(([name]) => allSizes.includes(name));
        setSizes(filtered);
        setAllowCustomSize(filtered.length === 0);
        setMarketImages(d.os_images || []);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setSizesBusy(false));
  }, [f.account_id, f.region]);

  const valid = f.account_id && f.vm_name.trim() && f.resource_group && f.region && f.vm_size;

  const save = async () => {
    setErr("");
    if (!valid) return setErr("请填写必填项");
    setBusy(true);
    try {
      const payload = {
        account_id: Number(f.account_id),
        region: f.region,
        vm_size: f.vm_size,
        vm_name: f.vm_name.trim(),
        resource_group: f.resource_group,
        username: f.username.trim() || "azureuser",
        password: f.password,
        user_data: f.user_data,
        os_image: f.image_src === "custom" ? f.os_image_custom.trim() : f.image_src === "market" ? f.os_image : f.os_image,
      };
      const r = await api.post("/vms", payload);
      toast("创建任务已提交，去任务中心查看进度", { action: "/jobs", actionLabel: "去查看" });
      onSaved(r);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="创建 Linux / Windows 虚拟机" onClose={onClose} wide>
      <p className="text-[13px] text-slate-500 mb-4">
        自动创建独立 VNet、NIC、静态公网 IP 和专用 NSG；NSG 默认 4096 优先级允许全部出入站。
      </p>

      <div className="text-[13px] font-semibold text-slate-700 mb-2">基础配置</div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Field label="Azure 账号">
          <Select value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value, resource_group: "", vm_size: "" })}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.alias}</option>)}
          </Select>
        </Field>
        <Field label="机器名" required>
          <Input value={f.vm_name} placeholder="如 vm-prod-01" onChange={(e) => setF({ ...f, vm_name: e.target.value })} />
        </Field>
        <Field label="资源组" required>
          <Select value={f.resource_group} onChange={(e) => setF({ ...f, resource_group: e.target.value })}>
            <option value="">请选择</option>
            {rgs.map((r) => <option key={r.name} value={r.name}>{r.name}（{r.location}）</option>)}
          </Select>
        </Field>
        <Field label="区域">
          <Select value={f.region} onChange={(e) => setF({ ...f, region: e.target.value, vm_size: "" })}>
            {(apiRegions.length ? apiRegions : REGIONS).map((r) => <option key={r[0]} value={r[0]}>{regionLabel(r)}</option>)}
          </Select>
        </Field>
        <Field label="规格" required className="col-span-2">
          {allowCustomSize ? (
            <Input value={f.vm_size} placeholder="当前区域不支持免费规格，请手动输入，如 Standard_D2s_v3" onChange={(e) => setF({ ...f, vm_size: e.target.value })} />
          ) : (
            <Select value={f.vm_size} onChange={(e) => setF({ ...f, vm_size: e.target.value })} disabled={sizesBusy}>
              <option value="">{sizesBusy ? "正在读取可用机型…" : "请选择"}</option>
              {sizes.map(([name, label]) => <option key={name} value={name}>{label}</option>)}
            </Select>
          )}
        </Field>
      </div>

      <div className="text-[13px] font-semibold text-slate-700 mb-2">系统镜像</div>
      <p className="text-[12px] text-slate-400 mb-3">
        常用镜像提供快捷选择；也可以浏览当前地区的 Azure Marketplace 或手工填写镜像标识。镜像本身与虚拟机、Windows 许可产生的费用以 Azure 账单为准。
      </p>
      <div className="flex gap-5 mb-3 text-[13px]">
        {[
          ["common", "常用官方镜像"],
          ["market", "浏览 Azure Marketplace"],
          ["custom", "手工填写镜像标识"],
        ].map(([v, t]) => (
          <label key={v} className="flex items-center gap-1.5 text-slate-700 cursor-pointer">
            <input type="radio" name="image_src" checked={f.image_src === v} onChange={() => setF({ ...f, image_src: v })} />
            {t}
          </label>
        ))}
      </div>
      <div className="mb-5">
        {f.image_src === "common" && (
          <Select value={f.os_image} onChange={(e) => setF({ ...f, os_image: e.target.value })}>
            {COMMON_IMAGES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </Select>
        )}
        {f.image_src === "market" && (
          <Select value={f.os_image} onChange={(e) => setF({ ...f, os_image: e.target.value })}>
            <option value="">请选择 Marketplace 镜像</option>
            {(marketImages.length ? marketImages : COMMON_IMAGES).map((o) => (
              <option key={o.key || o} value={o.key || o}>{o.label || o}</option>
            ))}
          </Select>
        )}
        {f.image_src === "custom" && (
          <Input value={f.os_image_custom} placeholder="如 Canonical:0001-com-ubuntu-server-jammy:22_04-lts:latest"
            onChange={(e) => setF({ ...f, os_image_custom: e.target.value })} className="font-mono text-[12px]" />
        )}
      </div>

      <div className="text-[13px] font-semibold text-slate-700 mb-2">登录与初始化</div>
      <p className="text-[12px] text-slate-400 mb-3">设置客机管理员凭据，以及首次部署时运行的可选初始化内容。</p>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="管理员用户名">
          <Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
        </Field>
        <Field label="管理员密码" hint="至少 12 个字符，并满足 Azure 对所选系统的密码要求。">
          <Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
      </div>
      <label className="flex items-start gap-2.5 mb-3 cursor-pointer">
        <input type="checkbox" checked={f.ipv6} onChange={(e) => setF({ ...f, ipv6: e.target.checked })} className="mt-1" />
        <span className="text-[13px]">
          <span className="text-slate-700 font-medium">启用 IPv6</span>
          <span className="block text-[12px] text-slate-400">保留 IPv4，并添加 IPv6 公网地址与双栈网络。</span>
        </span>
      </label>
      <Field label="cloud-init / Shell" hint="可选。修改 root 密码或 SSH 登录设置前，请确保保留至少一种可用的登录方式。">
        <Textarea rows={4} value={f.user_data} onChange={(e) => setF({ ...f, user_data: e.target.value })} className="font-mono text-[12px]" />
      </Field>

      {err && <p className="text-[13px] text-red-600 mt-3">{err}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <Btn variant="secondary" onClick={onClose}>取消</Btn>
        <Btn disabled={busy || !valid} onClick={save}>{busy ? "提交中..." : "创建虚拟机"}</Btn>
        <Btn variant="secondary" onClick={onClose}>关闭</Btn>
      </div>
    </Modal>
  );
}

const ACTS = [
  { k: "start", t: "开机" },
  { k: "stop", t: "关机释放" },
  { k: "restart", t: "重启" },
  { k: "change_ip", t: "更换 IP" },
  { k: "ipv6", t: "添加 IPv6" },
  { k: "reinstall", t: "重装系统" },
  { k: "delete", t: "删除", danger: true },
];

export default function VMs() {
  const toast = useToast();
  const [q] = useSearch();
  const [params] = useSearchParams();
  const rgFilter = params.get("rg") || "";
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("all");
  const [region, setRegion] = useState("all");
  const [vms, setVms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    api.get("/accounts").then((d) => setAccounts(d.items || [])).catch(() => {});
  }, []);

  const load = async (force = false) => {
    if (!force) setLoading(true);
    try {
      const ids = accountId === "all" ? accounts.map((a) => a.id) : [Number(accountId)];
      const all = [];
      for (const id of ids) {
        try {
          const suffix = force ? "&refresh=true" : "";
          const d = await api.get(`/vms?account_id=${id}${suffix}`);
          const a = accounts.find((x) => x.id === id);
          (d.vms || []).forEach((v) => all.push({ ...v, _aid: id, _alias: a?.alias || "" }));
        } catch { /* skip */ }
      }
      setVms((prev) => {
        // 静默更新：空数据不覆盖已有数据（防 Azure 瞬时失败）
        if (all.length === 0 && prev.length > 0) return prev;
        try {
          if (JSON.stringify(prev) !== JSON.stringify(all)) return all;
        } catch { /* ignore */ }
        return prev;
      });
    } finally { if (!force) setLoading(false); }
  };
  useEffect(() => {
    if (accounts.length) {
      load(false);  // 立即显示缓存
      // 后台静默拉取最新
      const t = setTimeout(() => load(true), 1000);
      return () => clearTimeout(t);
    }
    /* eslint-disable-next-line */
  }, [accounts, accountId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return vms.filter((v) => {
      if (rgFilter && (v.resource_group || "").toLowerCase() !== rgFilter.toLowerCase()) return false;
      if (region !== "all" && v.location !== region) return false;
      if (s && !(v.name || "").toLowerCase().includes(s)) return false;
      return true;
    });
  }, [vms, region, q, rgFilter]);

  const regions = useMemo(() => [...new Set(vms.map((v) => v.location).filter(Boolean))], [vms]);

  const doAction = async () => {
    const { vm, action } = confirm;
    setConfirm(null);
    try {
      await api.post("/vms/action", { account_id: vm._aid, resource_group: vm.resource_group, vm_name: vm.name, action });
      toast(`已提交${ACTS.find((a) => a.k === action)?.t}任务，去任务中心查看`, { action: "/jobs", actionLabel: "去查看" });
      load();
    } catch (e) { toast("提交失败：" + e.message); }
  };

  const clickAct = (vm, k) => {
    if (k === "ipv6" || k === "reinstall") return toast("该功能开发中");
    setConfirm({ vm, action: k });
  };

  const vmStatus = (s) => {
    const t = (s || "").toLowerCase();
    if (t.includes("running")) return <Badge color="green">运行中</Badge>;
    if (t.includes("deallocat") || t.includes("stopped")) return <Badge color="gray">已停止</Badge>;
    return <Badge>{s || "未知"}</Badge>;
  };

  return (
    <>
      <PageHead crumb="虚拟机" sub="管理机器生命周期、网络和初始化脚本。" />
      <div className="flex items-end gap-2 mb-4 flex-wrap">
        <Field label="Azure 账号" className="w-52">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="all">全部账户</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.alias}</option>)}
          </Select>
        </Field>
        <Field label="区域" className="w-40">
          <Select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="all">全部地区</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </Field>
        <div className="flex-1" />
        <Btn variant="secondary" onClick={() => load(true)} disabled={loading}>{loading ? "刷新中" : "刷新"}</Btn>
        <Btn onClick={() => setCreateOpen(true)}>创建虚拟机</Btn>
      </div>

      <Card title="虚拟机" sub="启动可附带 sh/PowerShell 脚本。更换 IP 会先绑定新地址，再清理Azure面板管理的旧地址。">
        {loading ? <Loading /> : filtered.length === 0 ? (
          <EmptyState icon="🖥️" text="暂无可访问的虚拟机" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((v, i) => (
              <div key={i} className="border border-slate-200 rounded-xl px-4 py-3.5 bg-white hover:border-slate-300">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-[15px] font-semibold text-slate-900">{v.name}</span>
                  {vmStatus(v.status)}
                </div>
                <div className="text-[12px] text-slate-400 mt-1">
                  {v._alias} · {v.resource_group} · {v.location} · {v.vm_size}
                </div>
                <div className="flex items-center gap-4 mt-2 text-[12px] text-slate-500">
                  <span>系统 {(v.os_type || "linux").toLowerCase()}</span>
                  <span>公网 IP <span className="font-mono">{v.public_ip || "—"}</span></span>
                </div>
                <div className="flex gap-1.5 flex-wrap mt-3">
                  {ACTS.map((a) => (
                    <Btn key={a.k} variant="ghost" className={`!text-[12px] !px-2.5 ${a.danger ? "!text-red-600" : "!text-slate-600"}`}
                      onClick={() => clickAct(v, a.k)}>{a.t}</Btn>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {createOpen && <CreateModal accounts={accounts} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); load(); }} />}
      {confirm && (
        <Confirm title={`确认${ACTS.find((a) => a.k === confirm.action)?.t}`}
          danger={confirm.action === "delete"} okLabel="确定"
          text={confirm.action === "delete"
            ? `删除虚拟机 ${confirm.vm.name}，此操作不可恢复，确定吗？`
            : `确定对虚拟机 ${confirm.vm.name} 执行${ACTS.find((a) => a.k === confirm.action)?.t}吗？`}
          onCancel={() => setConfirm(null)} onOk={doAction} />
      )}
    </>
  );
}
