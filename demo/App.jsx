// HonvéD – React frontend főkomponens
// Telepítés: npm install && npm run dev

import { useState, useEffect, createContext, useContext } from "react";

const API = "http://localhost:8000/api";
const AuthCtx = createContext(null);

// ── Auth hook ─────────────────────────────────────────────────
function useAuth() { return useContext(AuthCtx); }

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const t = localStorage.getItem("honved_token");
    return t ? JSON.parse(localStorage.getItem("honved_user") || "null") : null;
  });

  const belepes = async (felhasznalonev, jelszo) => {
    const res = await fetch(`${API}/auth/belepes`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `username=${encodeURIComponent(felhasznalonev)}&password=${encodeURIComponent(jelszo)}`,
    });
    if (!res.ok) throw new Error("Hibás felhasználónév vagy jelszó");
    const adat = await res.json();
    localStorage.setItem("honved_token", adat.access_token);
    localStorage.setItem("honved_user", JSON.stringify({ nev: adat.nev, szerepkor: adat.szerepkor }));
    setUser({ nev: adat.nev, szerepkor: adat.szerepkor });
    return adat;
  };

  const kilepes = () => {
    localStorage.removeItem("honved_token");
    localStorage.removeItem("honved_user");
    setUser(null);
  };

  return <AuthCtx.Provider value={{ user, belepes, kilepes }}>{children}</AuthCtx.Provider>;
}

// ── API hívás segédfüggvény ────────────────────────────────────
async function apiKeres(url, options = {}) {
  const token = localStorage.getItem("honved_token");
  const res = await fetch(`${API}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

// ── Bejelentkezési oldal ───────────────────────────────────────
function BejelentkezesOldal() {
  const { belepes } = useAuth();
  const [felh, setFelh] = useState("");
  const [jelszó, setJelszó] = useState("");
  const [hiba, setHiba] = useState("");
  const [tolt, setTolt] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setHiba(""); setTolt(true);
    try { await belepes(felh, jelszó); }
    catch (err) { setHiba(err.message); }
    finally { setTolt(false); }
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--bg)" }}>
      <div style={{ width:360, padding:"2rem", background:"var(--card)", borderRadius:12, border:"1px solid var(--border)" }}>
        <h1 style={{ margin:"0 0 0.25rem", fontSize:22, fontWeight:500 }}>HonvéD</h1>
        <p style={{ margin:"0 0 1.5rem", fontSize:13, color:"var(--muted)" }}>Honvédségi Digitális Adminisztráció</p>
        <form onSubmit={submit}>
          <label style={labelStyle}>Felhasználónév</label>
          <input style={inputStyle} value={felh} onChange={e=>setFelh(e.target.value)} required autoFocus/>
          <label style={labelStyle}>Jelszó</label>
          <input style={inputStyle} type="password" value={jelszó} onChange={e=>setJelszó(e.target.value)} required/>
          {hiba && <p style={{ color:"var(--red)", fontSize:13, margin:"0 0 0.75rem" }}>{hiba}</p>}
          <button style={btnStyle} disabled={tolt}>{tolt ? "Belépés..." : "Belépés"}</button>
        </form>
      </div>
    </div>
  );
}

// ── Navigáció ─────────────────────────────────────────────────
function Nav({ oldal, setOldal }) {
  const { user, kilepes } = useAuth();
  const menuk = [
    { id:"szemelyek",  label:"Személyek" },
    { id:"beosztasok", label:"Beosztások" },
    { id:"eszkozok",   label:"Eszközök" },
  ];
  return (
    <nav style={{ display:"flex", alignItems:"center", gap:8, padding:"0.75rem 1.5rem", borderBottom:"1px solid var(--border)", background:"var(--card)" }}>
      <span style={{ fontWeight:500, marginRight:16 }}>HonvéD</span>
      {menuk.map(m => (
        <button key={m.id} onClick={() => setOldal(m.id)}
          style={{ ...navBtnStyle, background: oldal===m.id ? "var(--accent)" : "transparent", color: oldal===m.id ? "#fff" : "var(--text)" }}>
          {m.label}
        </button>
      ))}
      <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:12 }}>
        <span style={{ fontSize:13, color:"var(--muted)" }}>{user?.nev} · {user?.szerepkor}</span>
        <button onClick={kilepes} style={{ ...navBtnStyle }}>Kilépés</button>
      </div>
    </nav>
  );
}

// ── Személyek oldal ────────────────────────────────────────────
function SzemelyekOldal() {
  const [lista, setLista] = useState([]);
  const [tolt, setTolt] = useState(true);

  useEffect(() => {
    apiKeres("/szemelyek").then(setLista).catch(console.error).finally(() => setTolt(false));
  }, []);

  const statusSzin = { "aktív":"var(--green)", "tartalékos":"var(--amber)", "leszerelt":"var(--muted)", "szabadságon":"var(--blue)" };

  if (tolt) return <p style={{ padding:"2rem", color:"var(--muted)" }}>Betöltés...</p>;
  return (
    <div style={{ padding:"1.5rem" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1rem" }}>
        <h2 style={{ margin:0, fontWeight:500 }}>Személyi állomány ({lista.length} fő)</h2>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:14 }}>
        <thead>
          <tr style={{ textAlign:"left", borderBottom:"1px solid var(--border)", color:"var(--muted)", fontSize:12 }}>
            {["Név","Rendfokozat","Alakulat","Státusz","Email"].map(h=>(
              <th key={h} style={{ padding:"8px 12px", fontWeight:400 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lista.map(sz => (
            <tr key={sz.id} style={{ borderBottom:"1px solid var(--border)" }}>
              <td style={{ padding:"10px 12px", fontWeight:500 }}>{sz.nev}</td>
              <td style={{ padding:"10px 12px", color:"var(--muted)" }}>{sz.rendfokozat}</td>
              <td style={{ padding:"10px 12px" }}>{sz.alakulat}</td>
              <td style={{ padding:"10px 12px" }}>
                <span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:`${statusSzin[sz.statusz]}22`, color:statusSzin[sz.statusz] }}>
                  {sz.statusz}
                </span>
              </td>
              <td style={{ padding:"10px 12px", color:"var(--muted)" }}>{sz.email || "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Beosztások oldal ───────────────────────────────────────────
function BeosztasokOldal() {
  const [lista, setLista] = useState([]);
  const [tolt, setTolt] = useState(true);

  useEffect(() => {
    apiKeres("/beosztasok").then(setLista).catch(console.error).finally(() => setTolt(false));
  }, []);

  const tipusSzin = { "kiképzés":"var(--blue)", "gyakorlat":"var(--green)", "szolgálat":"var(--amber)", "rendezvény":"var(--accent)", "egyéb":"var(--muted)" };

  if (tolt) return <p style={{ padding:"2rem", color:"var(--muted)" }}>Betöltés...</p>;
  return (
    <div style={{ padding:"1.5rem" }}>
      <h2 style={{ margin:"0 0 1rem", fontWeight:500 }}>Beosztások ({lista.length})</h2>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:12 }}>
        {lista.map(b => (
          <div key={b.id} style={{ padding:"1rem", background:"var(--card)", borderRadius:10, border:"1px solid var(--border)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
              <span style={{ fontWeight:500, fontSize:15 }}>{b.nev}</span>
              <span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:`${tipusSzin[b.tipus]}22`, color:tipusSzin[b.tipus] }}>
                {b.tipus}
              </span>
            </div>
            <p style={{ margin:"0 0 4px", fontSize:13, color:"var(--muted)" }}>{b.kezdete} – {b.vege}</p>
            {b.helyszin && <p style={{ margin:0, fontSize:13 }}>{b.helyszin}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Eszközök oldal ─────────────────────────────────────────────
function EszkozokOldal() {
  const [lista, setLista] = useState([]);
  const [tolt, setTolt] = useState(true);

  useEffect(() => {
    apiKeres("/eszkozok").then(setLista).catch(console.error).finally(() => setTolt(false));
  }, []);

  const allapotSzin = { "jó":"var(--green)", "javítandó":"var(--amber)", "selejtezendő":"var(--red)" };

  if (tolt) return <p style={{ padding:"2rem", color:"var(--muted)" }}>Betöltés...</p>;
  return (
    <div style={{ padding:"1.5rem" }}>
      <h2 style={{ margin:"0 0 1rem", fontWeight:500 }}>Eszközök ({lista.length})</h2>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:14 }}>
        <thead>
          <tr style={{ textAlign:"left", borderBottom:"1px solid var(--border)", color:"var(--muted)", fontSize:12 }}>
            {["Eszköz","Kategória","Sorozatszám","Állapot"].map(h=>(
              <th key={h} style={{ padding:"8px 12px", fontWeight:400 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lista.map(e => (
            <tr key={e.id} style={{ borderBottom:"1px solid var(--border)" }}>
              <td style={{ padding:"10px 12px", fontWeight:500 }}>{e.nev}</td>
              <td style={{ padding:"10px 12px", color:"var(--muted)" }}>{e.kategoria || "–"}</td>
              <td style={{ padding:"10px 12px", fontFamily:"monospace", fontSize:12 }}>{e.sorozatszam || "–"}</td>
              <td style={{ padding:"10px 12px" }}>
                <span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:`${allapotSzin[e.allapot]}22`, color:allapotSzin[e.allapot] }}>
                  {e.allapot}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── CSS változók ──────────────────────────────────────────────
const globalStyle = `
  :root {
    --bg: #f4f4f0; --card: #ffffff; --text: #1a1a18;
    --muted: #6b6b66; --border: #e0dfd8; --accent: #2d5a8e;
    --green: #2e7d32; --amber: #b45309; --red: #b91c1c; --blue: #1e5fa6;
  }
  @media(prefers-color-scheme:dark){
    :root{ --bg:#18181a; --card:#22222a; --text:#e8e6df; --muted:#9a9891; --border:#33332e; }
  }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, sans-serif; background:var(--bg); color:var(--text); }
  button { cursor:pointer; font-family:inherit; }
  input { font-family:inherit; }
`;

// ── Stílus konstansok ─────────────────────────────────────────
const labelStyle = { display:"block", fontSize:12, color:"var(--muted)", marginBottom:4, marginTop:12 };
const inputStyle = { display:"block", width:"100%", padding:"8px 10px", border:"1px solid var(--border)", borderRadius:8, background:"var(--bg)", color:"var(--text)", fontSize:14 };
const btnStyle   = { display:"block", width:"100%", marginTop:16, padding:"10px", background:"var(--accent)", color:"#fff", border:"none", borderRadius:8, fontSize:14 };
const navBtnStyle = { padding:"6px 12px", border:"none", borderRadius:6, fontSize:13, cursor:"pointer" };

// ── Fő alkalmazás ──────────────────────────────────────────────
function App() {
  const { user } = useAuth();
  const [oldal, setOldal] = useState("szemelyek");

  if (!user) return <BejelentkezesOldal />;

  const oldalak = {
    szemelyek:  <SzemelyekOldal />,
    beosztasok: <BeosztasokOldal />,
    eszkozok:   <EszkozokOldal />,
  };

  return (
    <>
      <style>{globalStyle}</style>
      <Nav oldal={oldal} setOldal={setOldal} />
      <main>{oldalak[oldal]}</main>
    </>
  );
}

export default function Root() {
  return <AuthProvider><App /></AuthProvider>;
}
