import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
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
      { to: "/overview", label: "总览", icon: "overview" },
      { to: "/accounts", label: "Azure 账号", icon: "accounts" },
      { to: "/proxies", label: "代理", icon: "proxies" },
      { to: "/billing", label: "账单费用", icon: "billing" },
      { to: "/quotas", label: "资源配额", icon: "quotas" },
    ],
  },
  {
    label: "资源管理",
    items: [
      { to: "/resource-groups", label: "资源组", icon: "rgs" },
      { to: "/virtual-machines", label: "虚拟机", icon: "vms" },
      { to: "/foundry", label: "Foundry", icon: "foundry" },
      { to: "/scripts", label: "初始化脚本", icon: "scripts" },
    ],
  },
  {
    label: "运维中心",
    items: [
      { to: "/jobs", label: "任务中心", icon: "jobs" },
      { to: "/api-access", label: "API 访问", icon: "tokens" },
      { to: "/api-docs", label: "API 文档", icon: "docs" },
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

function TopBar({ onSearch }) {
  const { user, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const menuRef = useRef(null);
  const initial = (user?.username || "A").slice(0, 1).toUpperCase();

  useEffect(() => {
    const h = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center gap-4 px-4 shrink-0 sticky top-0 z-40">
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-[17px]">
          A
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-bold text-slate-900">Azure面板</div>
          <div className="text-[10px] text-slate-400">Cloud control plane</div>
        </div>
      </div>
      <div className="flex-1 flex justify-center">
        <input
          placeholder="搜索资源、任务或页面…"
          onChange={(e) => onSearch(e.target.value)}
          className="w-full max-w-md text-[13px] border border-slate-200 rounded-lg px-3.5 py-2 bg-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
        />
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-[13px] text-slate-500">中文</span>
        <button title="深色模式" className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 text-[16px]">
          🌙
        </button>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenu((v) => !v)}
            className="w-8 h-8 rounded-full bg-blue-600 text-white text-[13px] font-semibold flex items-center justify-center"
          >
            {initial}
          </button>
          {menu && (
            <div className="absolute right-0 mt-2 w-36 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-[13px]">
              <button
                className="w-full text-left px-3.5 py-2 hover:bg-slate-50 text-slate-700"
                onClick={() => { setMenu(false); setPwModal(true); }}
              >
                改密码
              </button>
              <button
                className="w-full text-left px-3.5 py-2 hover:bg-slate-50 text-slate-700"
                onClick={logout}
              >
                退出登录
              </button>
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
    <aside className="w-52 shrink-0 bg-white border-r border-slate-200 flex flex-col">
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <div className="text-[12px] text-slate-400 px-3 mb-1.5">{g.label}</div>
            <div className="space-y-0.5">
              {g.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  className={({ isActive }) =>
                    `group flex items-center gap-2.5 px-3 h-10 rounded-md text-sm transition ${
                      isActive
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-slate-600 hover:bg-slate-50"
                    }`
                  }
                >
                  <span className="w-5 h-5 text-center text-slate-400 group-hover:text-slate-600 [&_svg]:w-5 [&_svg]:h-5">
                    <Icon d={ICONS[it.icon]} className="w-[18px] h-[18px]" />
                  </span>
                  {it.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-4 py-3 text-[11px] text-slate-400 border-t border-slate-100">
        © 2026 Azure Panel
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
      <div className="h-full flex flex-col">
        <TopBar onSearch={setQuery} />
        <div className="flex-1 flex min-h-0">
          <Sidebar />
          <main className="app-main-content flex-1 overflow-y-auto">
            <div className="max-w-[1500px] mx-auto px-4 py-4 sm:px-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SearchProvider>
  );
}
