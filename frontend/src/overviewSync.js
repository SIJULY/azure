export const OVERVIEW_CACHE_VERSION = 5;
export const OVERVIEW_UPDATED_EVENT = "azure-panel-overview-updated";

const OVERVIEW_CACHE_KEY = "overview_cache";

const DEFAULT_OVERVIEW_DATA = {
  accounts: { total: 0, healthy: 0, error: 0 },
  resource_groups: { total: 0 },
  vms: { running: 0, stopped: 0, total: 0 },
  foundry: { total: 0, resources_total: 0, partial: false },
  recent_jobs: [],
};

export function normalizeOverviewData(data) {
  return {
    accounts: { ...DEFAULT_OVERVIEW_DATA.accounts, ...(data?.accounts || {}) },
    resource_groups: { ...DEFAULT_OVERVIEW_DATA.resource_groups, ...(data?.resource_groups || {}) },
    vms: { ...DEFAULT_OVERVIEW_DATA.vms, ...(data?.vms || {}) },
    foundry: { ...DEFAULT_OVERVIEW_DATA.foundry, ...(data?.foundry || {}) },
    recent_jobs: Array.isArray(data?.recent_jobs) ? data.recent_jobs : [],
  };
}

export function readOverviewCache() {
  try {
    const raw = localStorage.getItem(OVERVIEW_CACHE_KEY);
    if (!raw) return normalizeOverviewData(DEFAULT_OVERVIEW_DATA);
    const parsed = JSON.parse(raw);
    if (parsed?.version !== OVERVIEW_CACHE_VERSION) return normalizeOverviewData(DEFAULT_OVERVIEW_DATA);
    return normalizeOverviewData(parsed.data);
  } catch {
    return normalizeOverviewData(DEFAULT_OVERVIEW_DATA);
  }
}

export function writeOverviewCache(data, notify = true) {
  const normalized = normalizeOverviewData(data);
  try { localStorage.setItem(OVERVIEW_CACHE_KEY, JSON.stringify({ version: OVERVIEW_CACHE_VERSION, data: normalized })); } catch {}
  if (notify && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OVERVIEW_UPDATED_EVENT, { detail: normalized }));
  }
  return normalized;
}

export function mergeOverviewCache(patch) {
  const current = readOverviewCache();
  return writeOverviewCache({
    ...current,
    ...patch,
    accounts: { ...current.accounts, ...(patch.accounts || {}) },
    resource_groups: { ...current.resource_groups, ...(patch.resource_groups || {}) },
    vms: { ...current.vms, ...(patch.vms || {}) },
    foundry: { ...current.foundry, ...(patch.foundry || {}) },
    recent_jobs: patch.recent_jobs || current.recent_jobs,
  });
}

export function publishAccountOverview(accounts) {
  const list = Array.isArray(accounts) ? accounts : [];
  const healthy = list.filter((a) => a.status === "healthy").length;
  mergeOverviewCache({ accounts: { total: list.length, healthy, error: Math.max(0, list.length - healthy) } });
}

export function publishResourceGroupOverview(items) {
  mergeOverviewCache({ resource_groups: { total: Array.isArray(items) ? items.length : 0 } });
}

export function publishVmOverview(vms) {
  const list = Array.isArray(vms) ? vms : [];
  const running = list.filter((vm) => String(vm.status || "").toLowerCase().includes("running")).length;
  mergeOverviewCache({ vms: { total: list.length, running, stopped: Math.max(0, list.length - running) } });
}

export function publishFoundryOverview(resources) {
  const list = Array.isArray(resources) ? resources : [];
  const accountIds = new Set(list.map((r) => r._aid).filter((id) => id !== undefined && id !== null && id !== ""));
  mergeOverviewCache({ foundry: { total: accountIds.size, resources_total: list.length, partial: false } });
}