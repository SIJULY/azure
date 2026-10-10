// 统一 API 客户端：base /api/v1，JWT，401 跳登录
const BASE = "/api/v1";

export function getToken() {
  return localStorage.getItem("token") || "";
}

async function req(method, path, body, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  const t = getToken();
  if (t) headers["Authorization"] = "Bearer " + t;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || 60000);
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    throw new Error(e.name === "AbortError" ? "请求超时，请稍后重试" : "网络连接失败");
  }
  clearTimeout(timer);
  if (res.status === 401) {
    localStorage.removeItem("token");
    if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
    throw new Error("登录已过期，请重新登录");
  }
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) throw new Error(data.detail || `请求失败（${res.status}）`);
  return data;
}

// raw fetch（下载文件用，不走 JSON 解析）
export async function apiRaw(path) {
  const headers = {};
  const t = getToken();
  if (t) headers["Authorization"] = "Bearer " + t;
  const res = await fetch(BASE + path, { headers });
  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    throw new Error("登录已过期");
  }
  if (!res.ok) throw new Error(`请求失败（${res.status}）`);
  return res;
}

export const api = {
  get: (p, o) => req("GET", p, undefined, o),
  post: (p, b, o) => req("POST", p, b, o),
  put: (p, b, o) => req("PUT", p, b, o),
  del: (p, o) => req("DELETE", p, undefined, o),
};
