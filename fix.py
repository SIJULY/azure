import sys

with open("frontend/src/pages/Foundry.jsx", "r") as f:
    text = f.read()

bad = """}

  const [foundryChoice, setFoundryChoice] = useState({});"""

good = """}

/* ---------- 批量部署模型弹窗（四步向导，第一步） ---------- */
function BatchDeployModal({ accounts, tiers, resources, onClose }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState([]);
  const [foundryMode, setFoundryMode] = useState({});
  const [foundryChoice, setFoundryChoice] = useState({});"""

if bad in text:
    text = text.replace(bad, good)
    with open("frontend/src/pages/Foundry.jsx", "w") as f:
        f.write(text)
    print("Fixed!")
else:
    print("Bad text not found!")
