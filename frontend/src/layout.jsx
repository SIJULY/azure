import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import { Btn, Field, Input, Modal, SearchProvider } from "./ui.jsx";

/* 线性 SVG 图标（Heroicons outline 风格） */
function Icon({ d, className = "w-5 h-5" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}
const ICONS = {
  overview: "M3 13.5l9-8 9 8M5 12v7a1 1 0 001 1h12a1 1 0 001-1v-7",
  accounts: "M15 7a3 3 0 11-6 0 3 3 0 016 0zM4 21v-1a7 7 0 0114 0v1",
  proxies: "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z",
  billing: "M12 6v12m-3-2.5V18m6-2.5V18M7 8h10a2 2 0 012 2v8a2 2 0 01-2 2H7a2 2 0 01-2-2v-8a2 2 0 012-2z",
  quotas: "M3 17l6-6 4 4 8-8M15 7h6v6",
  rgs: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  vms: "M4 5h16a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM2 19h20",
  foundry: "M9 3h6M10 3v6l-5 9a2 2 0 001.8 3h10.4A2 2 0 0019 18l-5-9V3",
  scripts: "M8 9l-4 3 4 3M16 9l4 3-4 3M13 5l-2 14",
  jobs: "M9 5h11M9 12h11M9 19h11M4 5h.01M4 12h.01M4 19h.01",
  tokens: "M15 7a3 3 0 013 3v1h-2.5M15 7a3 3 0 00-3 3v1H9.5M15 7V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h8a2 2 0 002-2v-2",
  docs: "M9 12h6M9 16h6M13 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V9l-6-6zM13 3v6h6",
};

const GROUPS = [
  {
    label: "平台",
    items: [
      { to: "/overview", label: "总览", icon: "overview", description: "查看平台运行概况、资源状态与关键指标" },
      { to: "/accounts", label: "Azure 账号", icon: "accounts", description: "管理 Azure 订阅账号、凭据与可用状态" },
      { to: "/proxies", label: "代理", icon: "proxies", description: "配置代理节点并检测网络连通性" },
      { to: "/billing", label: "账单费用", icon: "billing", description: "汇总订阅消费、余额与费用趋势" },
      { to: "/quotas", label: "资源配额", icon: "quotas", description: "查看各区域资源限制与剩余配额" },
    ],
  },
  {
    label: "资源管理",
    items: [
      { to: "/resource-groups", label: "资源组", icon: "rgs", description: "组织资源组、区域与关联资源" },
      { to: "/virtual-machines", label: "虚拟机", icon: "vms", description: "创建、查看并维护虚拟机实例" },
      { to: "/foundry", label: "Foundry", icon: "foundry", description: "管理 Azure AI Foundry 资源与服务" },
      { to: "/scripts", label: "初始化脚本", icon: "scripts", description: "维护自动化初始化脚本与执行模板" },
    ],
  },
  {
    label: "运维中心",
    items: [
      { to: "/jobs", label: "任务中心", icon: "jobs", description: "跟踪后台任务、执行进度与运行结果" },
      { to: "/api-access", label: "API 访问", icon: "tokens", description: "管理访问令牌、权限与接口调用凭据" },
      { to: "/api-docs", label: "API 文档", icon: "docs", description: "查看接口说明、请求示例与调试信息" },
    ],
  },
];

function ChangePasswordModal({ onClose }) {
  const { changePassword } = useAuth();
  const [f, setF] = useState({ old_password: "", new_password: "", new_password2: "" });
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const save = async () => {
    setErr("");
    if (!f.old_password || !f.new_password) return setErr("请填写完整");
    if (f.new_password !== f.new_password2) return setErr("两次输入的新密码不一致");
    if (f.new_password.length < 6) return setErr("新密码至少 6 位");
    try {
      await changePassword(f.old_password, f.new_password);
      setOk(true);
      setTimeout(onClose, 1200);
    } catch (e) {
      setErr(e.message);
    }
  };
  return (
    <Modal title="修改密码" onClose={onClose}>
      {ok ? (
        <p className="text-[13px] text-green-600">密码修改成功</p>
      ) : (
        <div className="space-y-3">
          <Field label="原密码"><Input type="password" value={f.old_password} onChange={(e) => setF({ ...f, old_password: e.target.value })} /></Field>
          <Field label="新密码"><Input type="password" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} /></Field>
          <Field label="确认新密码"><Input type="password" value={f.new_password2} onChange={(e) => setF({ ...f, new_password2: e.target.value })} /></Field>
          {err && <p className="text-[13px] text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="secondary" onClick={onClose}>取消</Btn>
            <Btn onClick={save}>保存</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

function AzureMark({ className = "w-9 h-9" }) {
  return (
    <div className={`${className} relative shrink-0`} aria-hidden="true">
      <div className="absolute left-[5%] top-[2%] h-[96%] w-[48%] skew-x-[-17deg] rounded-[3px] bg-gradient-to-b from-sky-400 to-blue-700" />
      <div className="absolute right-[5%] top-[2%] h-[96%] w-[48%] skew-x-[17deg] rounded-[3px] bg-gradient-to-b from-cyan-300 to-blue-600" />
      <div className="absolute left-[29%] bottom-[24%] h-[26%] w-[42%] skew-x-[-18deg] bg-white/35" />
    </div>
  );
}

function ChevronDown({ className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ChevronSort({ className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
    </svg>
  );
}

function TopBrandBar() {
  return (
    <div className="h-10 bg-white border-b border-slate-200 px-2.5 py-1.5 shrink-0">
      <div className="h-full w-full rounded-[16px] border border-slate-200 bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.03),0_1px_2px_rgba(15,23,42,0.05)] flex items-center justify-center gap-1.5">
        <AzureMark className="w-[18px] h-[18px]" />
        <span className="text-[13px] font-medium text-slate-600 tracking-tight">AzureIn</span>
      </div>
    </div>
  );
}


function TopBar({ onSearch }) {
  const { user, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const menuRef = useRef(null);
  const initial = (user?.username || "SI").slice(0, 2).toUpperCase();
  const location = useLocation();

  const allItems = GROUPS.flatMap((g) => g.items);
  const current = allItems.find((it) => location.pathname.startsWith(it.to));
  const currentLabel = current?.label || "总览";

  const pageDescription = current?.description || "管理 Azure 资源、任务与平台配置";

  useEffect(() => {
    const h = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  return (
    <header className="h-[68px] bg-white border-b border-slate-200 flex items-center gap-4 px-6 shrink-0 sticky top-0 z-40">
      <div className="flex flex-col justify-center shrink-0 min-w-[280px]">
        <div className="flex items-center gap-2.5 text-[14px] leading-none">
          <span className="text-slate-500 font-normal">AzureIn</span>
          <span className="text-slate-500 text-[16px] font-light">/</span>
          <button className="inline-flex items-center gap-1.5 text-slate-950 font-semibold hover:text-slate-700">
            {currentLabel}
            <ChevronDown className="w-3 h-3 text-slate-950" />
          </button>
        </div>
        <button className="mt-3 inline-flex items-center gap-1.5 text-[13px] leading-none text-slate-500 hover:text-slate-700 w-fit">
          <span className="truncate max-w-[340px]">{pageDescription}</span>
          <ChevronSort className="w-3 h-3 text-slate-400" />
        </button>
      </div>
      <div className="flex-1" />
      <div className="relative w-[34vw] max-w-[470px] min-w-[280px]">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.05} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          placeholder="搜索资源、任务或页面..."
          onChange={(e) => onSearch(e.target.value)}
          className="h-9 w-full rounded-[10px] border border-slate-200 bg-white pl-10 pr-12 text-[13px] font-semibold text-slate-700 placeholder:text-slate-400 shadow-[0_0_0_1px_rgba(15,23,42,0.025)] focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <kbd className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-500 font-sans">⌘K</kbd>
      </div>
      <div className="flex items-center gap-5 shrink-0">
        <button className="flex items-center gap-1.5 text-[14px] font-semibold text-slate-950 hover:text-slate-700">
          中文
          <ChevronSort className="w-3 h-3 text-slate-400" />
        </button>
        <button title="深色模式" className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-950 flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2.05} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0012 21.75a8.25 8.25 0 009.752-6.748z" />
          </svg>
        </button>
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenu((v) => !v)} className="w-8 h-8 rounded-full bg-black text-white text-[12px] font-semibold flex items-center justify-center">
            {initial}
          </button>
          {menu && (
            <div className="absolute right-0 mt-3 w-36 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-[13px] z-50">
              <button className="w-full text-left px-3.5 py-2 hover:bg-slate-50 text-slate-700" onClick={() => { setMenu(false); setPwModal(true); }}>改密码</button>
              <button className="w-full text-left px-3.5 py-2 hover:bg-slate-50 text-slate-700" onClick={logout}>退出登录</button>
            </div>
          )}
        </div>
      </div>
      {pwModal && <ChangePasswordModal onClose={() => setPwModal(false)} />}
    </header>
  );
}

function Sidebar() {
  return (
    <aside className="w-[220px] shrink-0 bg-white border-r border-slate-200 flex flex-col">
      <div className="h-[68px] border-b border-slate-200 flex items-center px-5 gap-3 shrink-0">
        <AzureMark className="w-7 h-7" />
        <span className="text-[15px] font-semibold text-slate-950 tracking-tight">AzureIn</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <div className="text-[11px] font-medium text-slate-400 px-2 mb-1.5">{g.label}</div>
            <div className="space-y-0.5">
              {g.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  className={({ isActive }) =>
                    `group flex items-center gap-2.5 px-3 h-9 rounded-md text-[14px] transition ${
                      isActive
                        ? "bg-slate-100 text-slate-950 font-semibold"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                    }`
                  }
                >
                  <span className="w-[18px] h-[18px] text-center text-slate-400 group-hover:text-slate-600 [&_svg]:w-[18px] [&_svg]:h-[18px]">
                    <Icon d={ICONS[it.icon]} className="w-4 h-4" />
                  </span>
                  {it.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-3 py-2.5 text-[11px] text-slate-400 border-t border-slate-100">
        © 2026 AzureIn
      </div>
    </aside>
  );
}

export default function Layout() {
  const navigate = useNavigate();
  const { ready, user } = useAuth();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (ready && !user) navigate("/login", { replace: true });
  }, [ready, user, navigate]);

  if (!ready) return null;
  if (!user) return null;

  return (
    <SearchProvider value={[query, setQuery]}>
      <div className="h-full flex flex-col bg-slate-50">
        <TopBrandBar />
        <div className="flex-1 flex min-h-0">
          <Sidebar />
          <main className="app-main-content flex-1 flex flex-col min-w-0 overflow-hidden">
            <TopBar onSearch={setQuery} />
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SearchProvider>
  );
}
