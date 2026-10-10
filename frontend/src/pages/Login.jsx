import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { Btn, Field, Input } from "../ui.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!username || !password) return setErr("请输入用户名和密码");
    setBusy(true);
    try {
      await login(username, password);
      navigate("/overview", { replace: true });
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center bg-[#f4f6fb] px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-xl">
            A
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900">Azure面板</div>
            <div className="text-[11px] text-slate-400">Cloud control plane</div>
          </div>
        </div>
        <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-[16px] font-semibold text-slate-900 text-center">登录</h2>
          <Field label="用户名">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </Field>
          <Field label="密码">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          {err && <p className="text-[13px] text-red-600">{err}</p>}
          <Btn type="submit" disabled={busy} className="w-full py-2.5">
            {busy ? "登录中..." : "登录"}
          </Btn>
        </form>
        <p className="text-center text-[11px] text-slate-400 mt-4">© 2026 Azure Panel</p>
      </div>
    </div>
  );
}
