import re

with open("frontend/src/pages/Foundry.jsx", "r") as f:
    text = f.read()

new_content = """/* ---------- 创建 Foundry 账号弹窗 ---------- */
function EnsureModal({ accounts, tiers, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({
    account_id: accounts[0]?.id ? String(accounts[0].id) : "",
    name: "", resource_group: "rg-foundry", region: "",
  });
  const [apiRegions, setApiRegions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!f.account_id) return;
    setApiRegions([]);
    api.get(`/foundry/regions?account_id=${f.account_id}`).then((d) => {
      const arr = d.regions || (Array.isArray(d) ? d : []);
      if (arr.length > 0) {
        setApiRegions(arr);
      }
    }).catch(() => {});
  }, [f.account_id]);

  const save = async () => {
    setErr("");
    if (!f.account_id || !f.resource_group.trim() || !f.region) return;
    setBusy(true)import re

with open("frontendst
with opry/    text = f.read()

new_content = """/* ---------- ? 
new_content = """.trfunction EnsureModal({ accounts, tiers, onClose, onSaved }) {
  const tf.  const toast = useToast();
  const [f, setF] = useState({
 ?? const [f, setF] = useSta "    account_id: accounts[0]?.??    name: "", resource_group: "rg-foundry", region: "",
  }); f  });
  const [apiRegions, setApiRegions] = useState([.a  cont  const [busy, setBusy] = useState(false);
  constur  const [err, setErr] = useState("");

  ro
  useEffect(() => {
    if (!f.acco       if (!f.accountac    setApiRegions([]);
    ap"A    api.get(`/foundry        const arr = d.regions || (Array.isArray(d) ? d : []);
      if (a e      if (arr.length > 0) {
        setApiRegions(arr);
            setApiRegions(arr)id      }
    }).catch(() =>      })    }, [f.account_id]);
d}
  const save = asyn             {a.alias} / {a.subs    if (!f.acc {    setBusy(true)import re

with open("frontendst
with opry/    text =  
with open("frontendst
wi/Sewith opry/    text =d>
new_content = """/* -------??ew_content = """.trfunction Ensu.r  const tf.  const toast = useToast();
  const [f, setF] = useState({
 ?? constti  const [f, setF] = useState({
 ?? c   ?? const [f, setF] = useSta    }); f  });
  const [apiRegions, setApiRegions] = useState([.a  cont  const [busy, setBusy] = useState(false);
  coti  const [ap    constur  const [err, setErr] = useState("");

  ro
  useEffect(() => {
    if (!f.acco       if{r
  ro
  useEffect(() => {
              ))
       u      if (!f.acco   le    ap"A    api.get(`/foundry        const arr = d.?">
            if (a e      if (arr.length > 0) {
        setApiRegions(arr);
            set> setF(        setApiRegions(arr);
           })            setApiRegions(      }).catch(() =>      })    }, [f.ac  d}
  const save = asyn             {ar="留空则???with open("frontendst
with opry/    text =  
with open("frontendst
wi/Sewith opry/    text { .with opry/    text =vawith open("frontendstFiwi/Sewith opry/    tssnew_content = """/* ------te  const [f, setF] = useState({
 ?? constti  const [f, setF] = useState({
 ?? c   ?? const [f, setFt-m ?? constti  const [f, setF]ft ?? c   ?? const [f, setF] = useSta    sN  const [apiRegions, setApiRegions] = useState([.ab>  coti  const [ap    constur  const [err, setErr] = useState("");

  ro
  useEffect(() => {
    ioi
  ro
  useEffect(() => {
    if (!f.acco       if{r
  ro
  useE??? u??    if (!f.acco   ?? ro
  useEffect(() => {
?? u??              ))
 ?      u      i??           if (a e  ??区域。
        </p>

        {err && <p className="text-sm         setApiRegions(arr);
            set> me            set> setF(    t-           })            setApiRegions(      }). o  const save = asyn             {ar="留空则???with open("frontendst
with opryt=with opry/    text =  
with open("frontendst
wi/Sewith opry/    text {   with open("frontendst -wi/Sewith opry/    t?? ?? constti  const [f, setF] = useState({
 ?? c   ?? const [f, setFt-m ?? constti  const [f, setF]ft ?? c   ?? const [f, setF] = useSta    sN  co text, flags=re.DOTALL)
with open("frontend/src/pages/Foundry.jsx", "w") as f:
    f.write(new_text)

print("Done")
