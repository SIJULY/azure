import re

with open('frontend/src/pages/Foundry.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# We need to replace BatchDeployModal
start = content.find("/* ---------- 批量部署模型弹窗")
end = content.find("/* ---------- 主页面 ---------- */")

if start != -1 and end != -1:
    old_modal = content[start:end]
    # We will write a more comprehensive version
