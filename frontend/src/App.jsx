import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth.jsx";
import { ToastProvider } from "./ui.jsx";
import Layout from "./layout.jsx";
import Login from "./pages/Login.jsx";
import Overview from "./pages/Overview.jsx";
import Accounts from "./pages/Accounts.jsx";
import Proxies from "./pages/Proxies.jsx";
import Billing from "./pages/Billing.jsx";
import Quotas from "./pages/Quotas.jsx";
import ResourceGroups from "./pages/ResourceGroups.jsx";
import VMs from "./pages/VMs.jsx";
import Firewall from "./pages/Firewall.jsx";
import Foundry from "./pages/Foundry.jsx";
import Scripts from "./pages/Scripts.jsx";
import Jobs from "./pages/Jobs.jsx";
import Tokens from "./pages/Tokens.jsx";
import Docs from "./pages/Docs.jsx";

function LoginRoute() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (user) return <Navigate to="/overview" replace />;
  return <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<Overview />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/proxies" element={<Proxies />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/quotas" element={<Quotas />} />
            <Route path="/resource-groups" element={<ResourceGroups />} />
            <Route path="/virtual-machines" element={<VMs />} />
            <Route path="/firewall" element={<Firewall />} />
            <Route path="/foundry" element={<Foundry />} />
            <Route path="/scripts" element={<Scripts />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/tokens" element={<Navigate to="/api-access" replace />} />
            <Route path="/docs" element={<Navigate to="/api-docs" replace />} />
            <Route path="/api-access" element={<Tokens />} />
            <Route path="/api-docs" element={<Docs />} />
          </Route>
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
