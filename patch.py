with open("frontend/src/pages/Foundry.jsx", "r") as f:
    lines = f.readlines()

new_ensure_modal = """/* ---------- 创建 Foundry 账号弹窗 ---------- */
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
    setBusy(true);
    trwith open("frontend/srst    lines = f.readlines()

new_ensure_modal = """/* -co
new_ensure_modal = """/.nafunction EnsureModal({ accounts, tiers, onClose, onSaved }) {
  const toast f.  const toast = useToast();
  const [f, setF] = useState({
 ?? const [f, setF] = useSta "    account_id: accounts[0]?.??    name: "", resource_group: "rg-foundry", region: "",
  })} f  });
  const [apiRegions, setApiRegions] = useState([.a  cont  const [busy, setBusy] = useState(false);
  constur  const [err, setErr] = useState("");

  ro
  useEffect(() => {
    if (!f.acc        if (!f.accountac    setApiRegions([]);
    ap"A    api.get(`/foundry        const arr = d.regions || (Array.isArray(d) ? d : []);
      if (a e      if (arr.length > 0) {
       ounts.map((a) => {
              setApiRegions(arr)id      }
    }).catch(() =>      })    }, [f.account_id]);
d}
  const save = asyn       setErr("");
    if (!f.bs    if (!f.acc {    setBusy(true);
    trwith open("frontend/srst    lines = f.readlin            })}
     
new_ensure_modal = """/* -co
new_ensure_modal = """/.支new_ensure_modal = """/.nafct  const toast f.  const toast = useToast();
  const [f, setF] = useState({
 ?? const     const [f, setF] = useState({
 ?? const    ?? const [f, setF] = useSta    })} f  });
  const [apiRegions, setApiRegions] = useState([.a  c{r.code} value={r.code}>{r.display} ({r.name})</opti  const [a     constur  const [err, setErr] = useState("");

  ro
  useEffect(() => {
    if (!f.acc        if{r
  ro
  useEffect(() => {
    if (!f.acc          u      if (!f.acc    le    ap"A    api.get(`/foundry        const arr = d.?">
            if (a e      if (arr.length > 0) {
       ounts.map((a) => {
              setApiReF(       ounts.map((a) => {
             })              setApiRegi      }).catch(() =>      })    }, [f.acco  d}
  const save = asyn       setErr("");
    if ????   if (!f.bs    if (!f.acc {    set?   trwith open("frontend/srst    lines = f.re=>     
new_ensure_modal = """/* -co
new_ensure_modal = """/.支new  new_clnew_ensure_modal = """/.支la  const [f, setF] = useState({
 ?? const     const [f, setF] = useState({
 ?? const    ?? const=" ?? const     const [f, setFic ?? const    ?? const [f, setF] = useSta c  const [apiRegions, setApiRegions] = useState([.a  c{rb>
  ro
  useEffect(() => {
    if (!f.acc        if{r
  ro
  useEffect(() => {
    if (!f.acc          u      if (!f.acc    le    ap"A    api.get(`/foundry        c??? u??    if (!f.acc    ?? ro
  useEffect(() => {
?? u??    if (!f.acc    ?           if (a e      if (arr.length > 0) {
       ounts.map((a) => {
              setApiReF(   m        ounts.map((a) => {
              setApme              setApiReF( p             })              setApiRegi      }).y}  const save = asyn       setErr("");
    if ????   if (!f.bs    if (!f.acc {    st=    if ????   if (!f.bs    if (!??</new_ensure_modal = """/* -co
new_ensure_modal = """/.支new  new_clnew_ensure_modal = """/.支la  cons= new_ensure_modal = """/.支(l ?? const     const [f, setF] = useState({
 ?? const    ?? const=" ?? const     const [f, se   ?? const    ?? const=" ?? const     co--  ro
  useEffect(() => {
    if (!f.acc        if{r
  ro
  useEffect(() => {
    if (!f.acc          u      if (!f.acc    le    ap"A    api.get(`/foundry   _m  ul     if (!f.acc    d_  ro
  useEffect(() => {
te  usr    if (!f.acc    x"  useEffect(() => {
?? u??    if (!f.acc    ?           if (a e      if (arr.length > 0) {
(f"Could not find boundaries: start={start_idx}, end={end_idx}")

