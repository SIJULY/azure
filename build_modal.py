import re

with open('frontend/src/pages/Foundry.jsx', 'r') as f:
    content = f.read()

# We need to find the BatchDeployModal code
start_idx = content.find("function BatchDeployModal")
end_idx = content.find("/* ---------- 主页面 ---------- */")

modal_code = content[start_idx:end_idx]

