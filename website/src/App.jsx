import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════
// ⚠️  SIRF YAHAN APNA BOT USERNAME DAALO
// ═══════════════════════════════════════════════════════════════════
const BOT_USERNAME = "My_Suhani_bot";   // e.g. "SuhaniFilterBot"
// ═══════════════════════════════════════════════════════════════════
// Agar bot aur website same server pe hain toh:
// const API_BASE = "https://your-bot-domain.com";
// Abhi ke liye mock data use ho raha hai (Step 4 mein real API add karenge)
const API_BASE = null;
// ═══════════════════════════════════════════════════════════════════

const QUALITIES  = ["All","2160p","1080p","720p","480p","360p","240p"];
const LANGUAGES  = ["All","Hindi","English","Tamil","Telugu","Malayalam","Kannada","Bengali","Punjabi"];

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + " GB";
  return (bytes / 1e6).toFixed(2) + " MB";
}
function extractQuality(name = "") {
  const m = name.match(/\b(2160p|1080p|720p|480p|360p|240p)\b/i);
  return m ? m[1].toUpperCase() : null;
}
function extractYear(name = "") {
  const m = name.match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : null;
}
function extractLanguage(name = "") {
  const langs = ["Hindi","English","Tamil","Telugu","Malayalam","Kannada","Bengali","Punjabi","Bhojpuri"];
  return langs.find(l => name.toLowerCase().includes(l.toLowerCase())) || null;
}
function qualityColor(q = "") {
  if (q.includes("2160")) return "#e8b84b";
  if (q.includes("1080")) return "#c0392b";
  if (q.includes("720"))  return "#e67e22";
  if (q.includes("480"))  return "#27ae60";
  return "#555";
}
function tgLink(fileId) {
  return `https://t.me/${BOT_USERNAME}?start=file_${fileId}`;
}
function cleanFileName(name = "") {
  return name.replace(/\.(mkv|mp4|avi|mov|webm)$/i, "").replace(/[-_.+]/g, " ").trim();
}

// ── Mock data (real API se replace ho jayega) ─────────────────────────────────
const MOCK = [
  { file_id:"f001", file_name:"The Punisher One Last Kill 2026 English 720p HQ HDRip x264.mkv",   file_size:618475520,  caption:"Action Drama Crime 2026" },
  { file_id:"f002", file_name:"The Punisher One Last Kill 2026 English 1080p HQ HDRip x264.mkv",  file_size:1782579200, caption:"Action Drama Crime 2026" },
  { file_id:"f003", file_name:"The Punisher One Last Kill 2026 1080p 10bit WEBRip 6CH HEVC.mkv",  file_size:703692800,  caption:"Action Drama 2026" },
  { file_id:"f004", file_name:"The Punisher One Last Kill 2026 2160p HDR10Plus DV WEBRip.mkv",    file_size:1534066688, caption:"Action Drama 2026" },
  { file_id:"f005", file_name:"Avengers Secret Wars 2026 Hindi 1080p HQ WEBRip x264.mkv",         file_size:1890000000, caption:"Action Adventure 2026" },
  { file_id:"f006", file_name:"Avengers Secret Wars 2026 Hindi 720p HQ WEBRip x264.mkv",          file_size:700000000,  caption:"Action Adventure 2026" },
  { file_id:"f007", file_name:"Spider-Man Beyond Spider-Verse 2026 Hindi Tamil Telugu 1080p.mkv",  file_size:2100000000, caption:"Animation Action 2026" },
  { file_id:"f008", file_name:"Inception 2010 Hindi 1080p BluRay x264.mkv",                       file_size:1450000000, caption:"Sci-Fi Thriller 2010" },
  { file_id:"f009", file_name:"Inception 2010 Hindi 720p BluRay x264.mkv",                        file_size:590000000,  caption:"Sci-Fi Thriller 2010" },
  { file_id:"f010", file_name:"KGF Chapter 3 2026 Hindi Kannada 1080p HQ WEBRip.mkv",             file_size:1980000000, caption:"Action Drama 2026" },
  { file_id:"f011", file_name:"The Boys Season 4 Complete Hindi 1080p WEBRip.mkv",                file_size:4200000000, caption:"Action Drama Series 2024" },
  { file_id:"f012", file_name:"Pushpa 2 The Rule 2024 Hindi 4K HDR10.mkv",                       file_size:2800000000, caption:"Action Drama 2024" },
  { file_id:"f013", file_name:"Dune Part Two 2024 English 1080p IMAX WEBRip.mkv",                file_size:2300000000, caption:"Sci-Fi Adventure 2024" },
  { file_id:"f014", file_name:"Breaking Bad S01 Complete 720p BluRay.mkv",                        file_size:3100000000, caption:"Crime Drama Series" },
  { file_id:"f015", file_name:"Oppenheimer 2023 English 1080p IMAX BluRay.mkv",                   file_size:3200000000, caption:"Drama History 2023" },
];

async function fetchFiles(query, quality, language) {
  // Real API connected hone ke baad yeh kaam karega:
  if (API_BASE) {
    try {
      const params = new URLSearchParams({ q: query, quality, language, limit: 20 });
      const res = await fetch(`${API_BASE}/api/search?${params}`);
      const data = await res.json();
      return data.files || [];
    } catch {
      console.warn("API failed, using mock data");
    }
  }
  // Mock fallback
  let r = query.trim()
    ? MOCK.filter(f => f.file_name.toLowerCase().includes(query.toLowerCase()))
    : [...MOCK];
  if (quality !== "All") r = r.filter(f => extractQuality(f.file_name)?.toLowerCase() === quality.toLowerCase());
  if (language !== "All") r = r.filter(f => extractLanguage(f.file_name)?.toLowerCase() === language.toLowerCase());
  return r;
}

// ── Poster placeholder ────────────────────────────────────────────────────────
function Poster({ title }) {
  const initials = title.split(" ").slice(0, 2).map(w => w[0] || "").join("").toUpperCase();
  const hue = [...title].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{
      width:"100%", height:"100%", display:"flex", alignItems:"center",
      justifyContent:"center", borderRadius:"inherit",
      background:`linear-gradient(135deg,hsl(${hue},55%,18%),hsl(${(hue+50)%360},45%,12%))`,
      fontSize:"20px", fontWeight:"900", color:`hsl(${hue},70%,65%)`,
      fontFamily:"'Bebas Neue',sans-serif", letterSpacing:"2px",
    }}>
      {initials || "🎬"}
    </div>
  );
}

// ── File Card ─────────────────────────────────────────────────────────────────
function FileCard({ file, onClick }) {
  const q      = extractQuality(file.file_name);
  const year   = extractYear(file.file_name);
  const name   = cleanFileName(file.file_name);
  const genres = (file.caption || "").replace(/\d{4}/g,"").trim().split(/\s+/).filter(Boolean).slice(0,2);

  return (
    <div
      onClick={() => onClick(file)}
      style={{
        display:"flex", gap:"12px", padding:"14px",
        background:"#161616", borderRadius:"14px", cursor:"pointer",
        border:"1px solid #222", transition:"background .15s, border-color .15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background="#1d1d1d"; e.currentTarget.style.borderColor="#333"; }}
      onMouseLeave={e => { e.currentTarget.style.background="#161616"; e.currentTarget.style.borderColor="#222"; }}
    >
      {/* Thumbnail */}
      <div style={{ width:62, height:82, flexShrink:0, borderRadius:10, overflow:"hidden" }}>
        <Poster title={name} />
      </div>

      {/* Info */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{
          fontSize:"13.5px", fontWeight:"600", color:"#eee",
          lineHeight:"1.4", marginBottom:"8px",
          display:"-webkit-box", WebkitLineClamp:2,
          WebkitBoxOrient:"vertical", overflow:"hidden",
        }}>
          {name}
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:"5px", marginBottom:"7px" }}>
          {q && (
            <span style={{ padding:"2px 8px", borderRadius:6, fontSize:"10px",
              fontWeight:"700", background:qualityColor(q), color:"#fff" }}>
              {q}
            </span>
          )}
          {year && (
            <span style={{ padding:"2px 8px", borderRadius:6, fontSize:"10px",
              fontWeight:"600", background:"#252525", color:"#999" }}>
              {year}
            </span>
          )}
          {genres.map(g => (
            <span key={g} style={{ padding:"2px 8px", borderRadius:6, fontSize:"10px",
              fontWeight:"600", background:"#252525", color:"#999" }}>
              {g}
            </span>
          ))}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
          <span style={{ fontSize:"11px", color:"#555" }}>📄</span>
          <span style={{ fontSize:"11px", color:"#555" }}>{formatSize(file.file_size)}</span>
        </div>
      </div>

      {/* Rating */}
      <div style={{ flexShrink:0, display:"flex", flexDirection:"column",
        alignItems:"flex-end", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:3,
          background:"#1c1c1c", padding:"3px 7px", borderRadius:8, border:"1px solid #2e2e2e" }}>
          <span style={{ fontSize:"10px" }}>⭐</span>
          <span style={{ fontSize:"11px", color:"#f1c40f", fontWeight:"700" }}>8.6</span>
        </div>
        <span style={{ fontSize:"18px", color:"#444" }}>ⓘ</span>
      </div>
    </div>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function DetailModal({ file, onClose }) {
  const q      = extractQuality(file.file_name);
  const year   = extractYear(file.file_name);
  const name   = cleanFileName(file.file_name);
  const genres = (file.caption || "").replace(/\d{4}/g,"").trim().split(/\s+/).filter(Boolean);
  const link   = tgLink(file.file_id);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      onClick={onClose}
      style={{
        position:"fixed", inset:0, background:"rgba(0,0,0,.8)",
        display:"flex", alignItems:"flex-end", justifyContent:"center",
        zIndex:1000, backdropFilter:"blur(6px)",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:"#111", borderRadius:"24px 24px 0 0",
          width:"100%", maxWidth:480, overflow:"hidden",
          animation:"slideUp .28s cubic-bezier(.32,1.4,.6,1)",
        }}
      >
        {/* Poster banner */}
        <div style={{ position:"relative", height:260, background:"#1a1a1a" }}>
          <div style={{ position:"absolute", inset:0 }}><Poster title={name} /></div>
          <div style={{
            position:"absolute", inset:0,
            background:"linear-gradient(to bottom,transparent 30%,#111 100%)",
          }} />
          <button
            onClick={onClose}
            style={{
              position:"absolute", top:14, right:14,
              width:34, height:34, borderRadius:"50%",
              background:"rgba(0,0,0,.65)", border:"none",
              color:"#fff", fontSize:18, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
            }}
          >✕</button>
        </div>

        {/* Details */}
        <div style={{ padding:"0 18px 28px" }}>
          <div style={{ fontSize:"19px", fontWeight:"800", color:"#fff",
            lineHeight:"1.3", marginBottom:"12px" }}>
            {name}
          </div>

          <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:12 }}>
            {q && (
              <span style={{ padding:"4px 12px", borderRadius:8, fontSize:"11px",
                fontWeight:"700", background:qualityColor(q), color:"#fff" }}>{q}</span>
            )}
            {year && (
              <span style={{ padding:"4px 12px", borderRadius:8, fontSize:"11px",
                fontWeight:"600", background:"#252525", color:"#bbb" }}>{year}</span>
            )}
            <span style={{ padding:"4px 12px", borderRadius:8, fontSize:"11px",
              fontWeight:"600", background:"#252525", color:"#bbb" }}>
              📄 {formatSize(file.file_size)}
            </span>
          </div>

          <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:14 }}>
            {genres.map(g => (
              <span key={g} style={{ padding:"4px 12px", borderRadius:8,
                fontSize:"11px", background:"#1c1c1c", color:"#777",
                border:"1px solid #2a2a2a" }}>{g}</span>
            ))}
          </div>

          <p style={{ fontSize:"13px", color:"#777", lineHeight:"1.6", marginBottom:20 }}>
            Search this title on our bot and get instant access to the file in Telegram.
          </p>

          {/* Action buttons */}
          <div style={{ display:"flex", gap:10 }}>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex:1, padding:"14px 0", borderRadius:14,
                background:"linear-gradient(135deg,#f39c12,#e74c3c)",
                color:"#fff", fontSize:"14px", fontWeight:"700",
                textAlign:"center", textDecoration:"none",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8,
              }}
            >
              {/* Telegram icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-2.03 9.571c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.893.65z"/>
              </svg>
              Open in Telegram
            </a>
            <button
              onClick={() => {
                if (navigator.share) navigator.share({ title: name, url: link });
                else navigator.clipboard?.writeText(link).then(() => alert("Link copied!"));
              }}
              style={{
                width:52, height:52, borderRadius:14,
                background:"#1e1e1e", border:"1px solid #333",
                color:"#aaa", cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/>
                <circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <style>{`@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [query,    setQuery]    = useState("");
  const [quality,  setQuality]  = useState("All");
  const [language, setLanguage] = useState("All");
  const [files,    setFiles]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [selected, setSelected] = useState(null);
  const inputRef = useRef(null);

  const doSearch = useCallback(async () => {
    setLoading(true);
    const results = await fetchFiles(query, quality, language);
    setFiles(results);
    setLoading(false);
  }, [query, quality, language]);

  useEffect(() => {
    const t = setTimeout(doSearch, 280);
    return () => clearTimeout(t);
  }, [doSearch]);

  const clearAll = () => { setQuery(""); setQuality("All"); setLanguage("All"); };

  return (
    <div style={{ background:"#0d0d0d", minHeight:"100vh",
      fontFamily:"'DM Sans',sans-serif", color:"#eee",
      maxWidth:480, margin:"0 auto" }}>

      {/* Google Fonts */}
      <link rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Bebas+Neue&display=swap" />

      {/* ── Sticky Header ── */}
      <div style={{
        position:"sticky", top:0, zIndex:10, padding:"18px 16px 0",
        background:"linear-gradient(to bottom,#0d0d0d 82%,transparent)",
      }}>
        {/* Logo */}
        <div style={{ display:"flex", alignItems:"center",
          justifyContent:"space-between", marginBottom:16 }}>
          <span style={{
            fontSize:"28px", fontWeight:"900", color:"#f39c12",
            fontFamily:"'Bebas Neue',sans-serif", letterSpacing:"3px",
          }}>
            SUHANI
          </span>
          <span style={{ fontSize:"11px", color:"#555", fontWeight:"600" }}>
            🤖 @{BOT_USERNAME}
          </span>
        </div>

        {/* Search */}
        <div style={{
          display:"flex", alignItems:"center", gap:10,
          background:"#1a1a1a", border:"1px solid #2a2a2a",
          borderRadius:14, padding:"10px 14px", marginBottom:14,
        }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
            stroke="#666" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && doSearch()}
            placeholder="Search movies, series..."
            style={{ flex:1, background:"transparent", border:"none",
              outline:"none", fontSize:"14px", color:"#eee" }}
          />
          {query && (
            <button onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              style={{ background:"none", border:"none", color:"#555",
                cursor:"pointer", fontSize:17, lineHeight:1 }}>✕</button>
          )}
          <button
            onClick={doSearch}
            style={{
              width:32, height:32, borderRadius:10, border:"none",
              background:"linear-gradient(135deg,#f39c12,#e74c3c)",
              cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="#fff" strokeWidth="3">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
        </div>

        {/* Quality chips */}
        <FilterRow label="QUALITY" items={QUALITIES} active={quality} onSelect={setQuality} accent />

        {/* Language chips */}
        <FilterRow label="LANGUAGE" items={LANGUAGES} active={language} onSelect={setLanguage} />

        <div style={{ height:12 }} />
      </div>

      {/* ── Results ── */}
      <div style={{ padding:"0 16px 24px" }}>
        {/* Count */}
        <div style={{ display:"flex", justifyContent:"space-between",
          alignItems:"center", marginBottom:14 }}>
          <span style={{ fontSize:"13px", color:"#555" }}>
            {loading ? "Searching..." : `${files.length} match${files.length !== 1 ? "es" : ""}`}
          </span>
          {(query || quality !== "All" || language !== "All") && (
            <button onClick={clearAll}
              style={{ background:"none", border:"none", color:"#e74c3c",
                fontSize:"13px", cursor:"pointer", fontWeight:"600" }}>
              Clear
            </button>
          )}
        </div>

        {/* Skeleton */}
        {loading && [1,2,3].map(i => (
          <div key={i} style={{ height:110, borderRadius:14, background:"#1a1a1a",
            marginBottom:10, animation:"pulse 1.4s infinite" }} />
        ))}

        {/* Cards */}
        {!loading && (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {files.map(f => (
              <FileCard key={f.file_id} file={f} onClick={setSelected} />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && files.length === 0 && (
          <div style={{ textAlign:"center", padding:"70px 0" }}>
            <div style={{ fontSize:"52px", marginBottom:14 }}>🎬</div>
            <div style={{ fontSize:"16px", fontWeight:"700", marginBottom:6 }}>
              No results found
            </div>
            <div style={{ fontSize:"13px", color:"#555" }}>
              Try different keywords or filters
            </div>
          </div>
        )}

        {/* End */}
        {!loading && files.length > 0 && (
          <div style={{ textAlign:"center", padding:"28px 0 0",
            color:"#444", fontSize:"12px" }}>
            You've reached the end of the feed.
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ textAlign:"center", padding:"10px 16px 20px",
        borderTop:"1px solid #1a1a1a", fontSize:"11px", color:"#444" }}>
        <p style={{ margin:"0 0 6px", lineHeight:"1.6" }}>
          Disclaimer: All contents on this site are not owned by us.
          Files are publicly available on Telegram.
        </p>
        <div style={{ display:"flex", justifyContent:"center", gap:16 }}>
          <span>© 2026 Suhani</span>
          <a href={`https://t.me/${BOT_USERNAME}`}
            style={{ color:"#555", textDecoration:"none" }}>
            Report issue
          </a>
        </div>
      </div>

      {/* Modal */}
      {selected && <DetailModal file={selected} onClose={() => setSelected(null)} />}

      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{height:3px}
        ::-webkit-scrollbar-thumb{background:#333;border-radius:4px}
        @keyframes pulse{0%,100%{opacity:.35}50%{opacity:.7}}
        input::placeholder{color:#555}
      `}</style>
    </div>
  );
}

// ── Filter Row Component ──────────────────────────────────────────────────────
function FilterRow({ label, items, active, onSelect, accent }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:"10px", fontWeight:"700", color:"#444",
        letterSpacing:"1.5px", marginBottom:8 }}>
        {label}
      </div>
      <div style={{ display:"flex", gap:7, overflowX:"auto", paddingBottom:4 }}>
        {items.map(item => {
          const isActive = active === item;
          return (
            <button
              key={item}
              onClick={() => onSelect(item)}
              style={{
                padding:"6px 14px", borderRadius:20, border:"none",
                cursor:"pointer", fontSize:"12px", fontWeight:"600",
                whiteSpace:"nowrap", transition:"all .15s",
                background: isActive
                  ? (accent ? "linear-gradient(135deg,#f39c12,#e74c3c)" : "#fff")
                  : "#1e1e1e",
                color: isActive ? (accent ? "#fff" : "#111") : "#666",
              }}
            >
              {item}
            </button>
          );
        })}
      </div>
    </div>
  );
}
