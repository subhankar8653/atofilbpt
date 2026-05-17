import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════
// ⚠️  APNA BOT USERNAME AUR BOT SERVER URL YAHAN DAALO
// ═══════════════════════════════════════════════════════════════════
const BOT_USERNAME = "My_Suhani_bot";
const API_BASE = "https://web-production-a6061.up.railway.app";
// ═══════════════════════════════════════════════════════════════════

const QUALITIES = ["All", "2160p", "1080p", "720p", "480p", "360p", "240p"];
const LANGUAGES = ["All", "Hindi", "English", "Tamil", "Telugu", "Malayalam", "Kannada", "Bengali", "Punjabi"];

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
  const langs = ["Hindi", "English", "Tamil", "Telugu", "Malayalam", "Kannada", "Bengali", "Punjabi", "Bhojpuri"];
  return langs.find(l => name.toLowerCase().includes(l.toLowerCase())) || null;
}
function qualityColor(q = "") {
  if (q.includes("2160")) return "#e8b84b";
  if (q.includes("1080")) return "#c0392b";
  if (q.includes("720")) return "#e67e22";
  if (q.includes("480")) return "#27ae60";
  return "#555";
}
function tgLink(fileId) {
  return `https://t.me/${BOT_USERNAME}?start=file_${fileId}`;
}
function cleanFileName(name = "") {
  return name.replace(/\.(mkv|mp4|avi|mov|webm)$/i, "").replace(/[-_.+]/g, " ").trim();
}
function extractMovieTitle(name = "") {
  const m = name.match(/^(.*?)\s*[\[(]?\b(19|20)\d{2}\b/);
  return m ? m[1].trim() : cleanFileName(name).split(" ").slice(0, 4).join(" ");
}

async function fetchFiles(query, quality, language, limit = 20) {
  try {
    const params = new URLSearchParams({ q: query || ".", quality, language, limit });
    const res = await fetch(`${API_BASE}/api/search?${params}`);
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    return data.files || [];
  } catch {
    return [];
  }
}

async function fetchTrending(category = "all", limit = 12) {
  try {
    const params = new URLSearchParams({ category, limit });
    const res = await fetch(`${API_BASE}/api/trending?${params}`);
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    return data.files || [];
  } catch {
    return [];
  }
}

const posterCache = {};
async function fetchPoster(title, year) {
  const key = `${title}__${year}`;
  if (posterCache[key] !== undefined) return posterCache[key];
  try {
    const params = new URLSearchParams({ title, ...(year ? { year } : {}) });
    const res = await fetch(`${API_BASE}/api/poster?${params}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    posterCache[key] = data;
    return data;
  } catch {
    posterCache[key] = null;
    return null;
  }
}

function Poster({ file, size = "card" }) {
  const [imgSrc, setImgSrc] = useState(null);
  const [rating, setRating] = useState(null);
  const title = extractMovieTitle(file.file_name);
  const year = extractYear(file.file_name);

  useEffect(() => {
    let cancelled = false;
    fetchPoster(title, year).then(data => {
      if (!cancelled && data?.poster) {
        setImgSrc(data.poster);
        setRating(data.imdb_rating);
      }
    });
    return () => { cancelled = true; };
  }, [title, year]);

  const initials = title.split(" ").slice(0, 2).map(w => w[0] || "").join("").toUpperCase();
  const hue = [...title].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

  if (imgSrc) {
    return (
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        <img
          src={imgSrc}
          alt={title}
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
          onError={() => setImgSrc(null)}
        />
        {rating && rating !== "N/A" && (
          <div style={{
            position: "absolute", bottom: 5, left: 5,
            background: "rgba(0,0,0,.75)", borderRadius: 6,
            padding: "2px 6px", display: "flex", alignItems: "center", gap: 3,
          }}>
            <span style={{ fontSize: 9, color: "#f1c40f" }}>⭐</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#f1c40f" }}>{rating}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      width: "100%", height: "100%", display: "flex", alignItems: "center",
      justifyContent: "center", borderRadius: "inherit",
      background: `linear-gradient(135deg,hsl(${hue},55%,18%),hsl(${(hue + 50) % 360},45%,12%))`,
      fontSize: size === "banner" ? "36px" : "20px", fontWeight: "900",
      color: `hsl(${hue},70%,65%)`, letterSpacing: "2px",
    }}>
      {initials || "🎬"}
    </div>
  );
}

function MovieCard({ file, onClick }) {
  const q = extractQuality(file.file_name);
  const year = extractYear(file.file_name);
  const name = extractMovieTitle(file.file_name);

  return (
    <div
      onClick={() => onClick(file)}
      style={{
        width: 110, flexShrink: 0, cursor: "pointer",
        borderRadius: 12, overflow: "hidden",
        background: "#161616", border: "1px solid #222",
        transition: "transform .15s, border-color .15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.03)"; e.currentTarget.style.borderColor = "#444"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.borderColor = "#222"; }}
    >
      <div style={{ height: 150, background: "#1a1a1a", overflow: "hidden", borderRadius: "12px 12px 0 0" }}>
        <Poster file={file} />
      </div>
      <div style={{ padding: "8px 8px 10px" }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: "#ddd",
          lineHeight: 1.4, marginBottom: 5,
          display: "-webkit-box", WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>{name}</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {year && <span style={{ fontSize: 9, color: "#666" }}>{year}</span>}
          {q && <span style={{ fontSize: 9, fontWeight: 700, color: qualityColor(q) }}>{q}</span>}
        </div>
      </div>
    </div>
  );
}

function FileCard({ file, onClick }) {
  const q = extractQuality(file.file_name);
  const year = extractYear(file.file_name);
  const name = cleanFileName(file.file_name);
  const genres = (file.caption || "").replace(/\d{4}/g, "").trim().split(/\s+/).filter(Boolean).slice(0, 2);

  return (
    <div
      onClick={() => onClick(file)}
      style={{
        display: "flex", gap: 12, padding: 14,
        background: "#161616", borderRadius: 14, cursor: "pointer",
        border: "1px solid #222", transition: "background .15s, border-color .15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "#1d1d1d"; e.currentTarget.style.borderColor = "#333"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "#161616"; e.currentTarget.style.borderColor = "#222"; }}
    >
      <div style={{ width: 62, height: 82, flexShrink: 0, borderRadius: 10, overflow: "hidden" }}>
        <Poster file={file} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13.5, fontWeight: 600, color: "#eee",
          lineHeight: 1.4, marginBottom: 8,
          display: "-webkit-box", WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>{name}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 7 }}>
          {q && <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: qualityColor(q), color: "#fff" }}>{q}</span>}
          {year && <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: "#252525", color: "#999" }}>{year}</span>}
          {genres.map(g => <span key={g} style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: "#252525", color: "#999" }}>{g}</span>)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 11, color: "#555" }}>📄</span>
          <span style={{ fontSize: 11, color: "#555" }}>{formatSize(file.file_size)}</span>
        </div>
      </div>
    </div>
  );
}

function HeroBanner({ file, onClick }) {
  const [posterData, setPosterData] = useState(null);
  const title = extractMovieTitle(file.file_name);
  const year = extractYear(file.file_name);
  const q = extractQuality(file.file_name);
  const genres = (file.caption || "").replace(/\d{4}/g, "").trim().split(/\s+/).filter(Boolean).slice(0, 3);

  useEffect(() => {
    fetchPoster(title, year).then(setPosterData);
  }, [title, year]);

  return (
    <div
      onClick={() => onClick(file)}
      style={{
        margin: "0 16px 24px", borderRadius: 20, overflow: "hidden",
        position: "relative", height: 200, cursor: "pointer",
        background: "#1a1a1a",
      }}
    >
      {posterData?.poster ? (
        <img src={posterData.poster} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.6 }} />
      ) : (
        <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#1a1a2e,#16213e)" }} />
      )}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to right, rgba(0,0,0,.85) 40%, transparent 100%)",
      }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, padding: "16px 18px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#f39c12", letterSpacing: "2px", marginBottom: 6 }}>
          MOVIE OF THE DAY
        </div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", lineHeight: 1.2, marginBottom: 6 }}>
          {title}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
          {posterData?.imdb_rating && posterData.imdb_rating !== "N/A" && (
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: 11, color: "#f1c40f" }}>⭐</span>
              <span style={{ fontSize: 12, color: "#f1c40f", fontWeight: 700 }}>{posterData.imdb_rating}</span>
            </span>
          )}
          {year && <span style={{ fontSize: 12, color: "#aaa" }}>{year}</span>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {genres.map(g => (
            <span key={g} style={{
              padding: "3px 10px", borderRadius: 20,
              background: "rgba(255,255,255,.12)", fontSize: 10, color: "#ccc", fontWeight: 600,
            }}>{g}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function CategoryRow({ title, files, onFileClick }) {
  if (!files.length) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 16px", marginBottom: 14 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#eee", letterSpacing: "1.5px" }}>{title}</span>
        <span style={{ fontSize: 11, color: "#555" }}>Scroll →</span>
      </div>
      <div style={{
        display: "flex", gap: 10, overflowX: "auto", paddingLeft: 16, paddingRight: 16, paddingBottom: 4,
        scrollbarWidth: "none",
      }}>
        {files.map(f => <MovieCard key={f.file_id} file={f} onClick={onFileClick} />)}
      </div>
    </div>
  );
}

function DetailModal({ file, onClose }) {
  const [posterData, setPosterData] = useState(null);
  const q = extractQuality(file.file_name);
  const year = extractYear(file.file_name);
  const name = cleanFileName(file.file_name);
  const title = extractMovieTitle(file.file_name);
  const genres = (file.caption || "").replace(/\d{4}/g, "").trim().split(/\s+/).filter(Boolean);
  const link = tgLink(file.file_id);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    fetchPoster(title, year).then(setPosterData);
    return () => { document.body.style.overflow = ""; };
  }, [title, year]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.8)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        zIndex: 1000, backdropFilter: "blur(6px)",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#111", borderRadius: "24px 24px 0 0",
          width: "100%", maxWidth: 480, overflow: "hidden",
          animation: "slideUp .28s cubic-bezier(.32,1.4,.6,1)",
        }}
      >
        <div style={{ position: "relative", height: 260, background: "#1a1a1a" }}>
          {posterData?.poster ? (
            <img src={posterData.poster} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ position: "absolute", inset: 0 }}><Poster file={file} size="banner" /></div>
          )}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to bottom,transparent 30%,#111 100%)",
          }} />
          <button
            onClick={onClose}
            style={{
              position: "absolute", top: 14, right: 14,
              width: 34, height: 34, borderRadius: "50%",
              background: "rgba(0,0,0,.65)", border: "none",
              color: "#fff", fontSize: 18, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >✕</button>
        </div>

        <div style={{ padding: "0 18px 28px" }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#fff", lineHeight: 1.3, marginBottom: 12 }}>
            {name}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
            {q && <span style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: qualityColor(q), color: "#fff" }}>{q}</span>}
            {year && <span style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: "#252525", color: "#bbb" }}>{year}</span>}
            <span style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: "#252525", color: "#bbb" }}>
              📄 {formatSize(file.file_size)}
            </span>
            {posterData?.imdb_rating && posterData.imdb_rating !== "N/A" && (
              <span style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: "#1c1c00", color: "#f1c40f" }}>
                ⭐ {posterData.imdb_rating}
              </span>
            )}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
            {genres.map(g => (
              <span key={g} style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, background: "#1c1c1c", color: "#777", border: "1px solid #2a2a2a" }}>{g}</span>
            ))}
          </div>

          {posterData?.plot && (
            <p style={{ fontSize: 12, color: "#666", lineHeight: 1.6, marginBottom: 16 }}>
              {posterData.plot}
            </p>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1, padding: "14px 0", borderRadius: 14,
                background: "linear-gradient(135deg,#f39c12,#e74c3c)",
                color: "#fff", fontSize: 14, fontWeight: 700,
                textAlign: "center", textDecoration: "none",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-2.03 9.571c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.893.65z" />
              </svg>
              Open in Telegram
            </a>
            <button
              onClick={() => {
                if (navigator.share) navigator.share({ title: name, url: link });
                else navigator.clipboard?.writeText(link).then(() => alert("Link copied!"));
              }}
              style={{
                width: 52, height: 52, borderRadius: 14,
                background: "#1e1e1e", border: "1px solid #333",
                color: "#aaa", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    </div>
  );
}

function FilterRow({ label, items, active, onSelect, accent }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#444", letterSpacing: "1.5px", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
        {items.map(item => {
          const isActive = active === item;
          return (
            <button
              key={item}
              onClick={() => onSelect(item)}
              style={{
                padding: "6px 14px", borderRadius: 20, border: "none",
                cursor: "pointer", fontSize: 12, fontWeight: 600,
                whiteSpace: "nowrap", transition: "all .15s",
                background: isActive ? (accent ? "linear-gradient(135deg,#f39c12,#e74c3c)" : "#fff") : "#1e1e1e",
                color: isActive ? (accent ? "#fff" : "#111") : "#666",
              }}
            >{item}</button>
          );
        })}
      </div>
    </div>
  );
}

const TABS = [
  { id: "home", label: "Home" },
  { id: "search", label: "Search" },
];

export default function App() {
  const [tab, setTab] = useState("home");
  const [query, setQuery] = useState("");
  const [quality, setQuality] = useState("All");
  const [language, setLanguage] = useState("All");
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  const [nowPlaying, setNowPlaying] = useState([]);
  const [globalTrend, setGlobalTrend] = useState([]);
  const [seriesTrend, setSeriesTrend] = useState([]);
  const [hindiFils, setHindiFils] = useState([]);
  const [malayalamFils, setMalayalamFils] = useState([]);
  const [tamilFils, setTamilFils] = useState([]);
  const [upcomingInd, setUpcomingInd] = useState([]);
  const [homeLoading, setHomeLoading] = useState(true);
  const [heroBanner, setHeroBanner] = useState(null);

  const inputRef = useRef(null);

  useEffect(() => {
    if (tab !== "home") return;
    setHomeLoading(true);
    Promise.all([
      fetchTrending("all", 12),
      fetchTrending("all", 20),
      fetchTrending("series", 10),
      fetchTrending("hindi", 10),
      fetchTrending("malayalam", 10),
      fetchTrending("tamil", 10),
      fetchTrending("movies", 10),
    ]).then(([all, global, series, hindi, mal, tamil, movies]) => {
      setNowPlaying(all.slice(0, 8));
      setGlobalTrend(global.slice(0, 10));
      setSeriesTrend(series.slice(0, 8));
      setHindiFils(hindi.slice(0, 8));
      setMalayalamFils(mal.slice(0, 8));
      setTamilFils(tamil.slice(0, 8));
      setUpcomingInd(movies.slice(0, 8));
      if (all.length > 0) setHeroBanner(all[0]);
      setHomeLoading(false);
    });
  }, [tab]);

  const doSearch = useCallback(async () => {
    if (!query.trim() && quality === "All" && language === "All") {
      setFiles([]);
      return;
    }
    setLoading(true);
    const results = await fetchFiles(query, quality, language);
    setFiles(results);
    setLoading(false);
  }, [query, quality, language]);

  useEffect(() => {
    if (tab !== "search") return;
    const t = setTimeout(doSearch, 300);
    return () => clearTimeout(t);
  }, [doSearch, tab]);

  const clearAll = () => { setQuery(""); setQuality("All"); setLanguage("All"); };

  return (
    <div style={{ background: "#0d0d0d", minHeight: "100vh", fontFamily: "'DM Sans',sans-serif", color: "#eee", maxWidth: 480, margin: "0 auto" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Bebas+Neue&display=swap" />

      {/* ── Header ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "#0d0d0d", borderBottom: "1px solid #181818",
        padding: "16px 16px 0",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 26, fontWeight: 900, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 3 }}>
            <span style={{ color: "#f39c12" }}>ONE</span>
            <span style={{ color: "#e74c3c" }}>PLEX</span>
          </span>
          <span style={{ fontSize: 11, color: "#555", fontWeight: 600 }}>🤖 @{BOT_USERNAME}</span>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 0 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: "10px 0", border: "none", cursor: "pointer",
                background: "transparent", fontSize: 13, fontWeight: 700,
                color: tab === t.id ? "#f39c12" : "#555",
                borderBottom: tab === t.id ? "2px solid #f39c12" : "2px solid transparent",
                transition: "all .2s",
              }}
            >{t.label}</button>
          ))}
        </div>
      </div>

      {/* ══ HOME TAB ══ */}
      {tab === "home" && (
        <div style={{ paddingBottom: 24 }}>
          {homeLoading ? (
            <div style={{ padding: "20px 16px" }}>
              <div style={{ height: 200, borderRadius: 20, background: "#1a1a1a", marginBottom: 24, animation: "pulse 1.4s infinite" }} />
              {[1, 2, 3].map(i => (
                <div key={i} style={{ marginBottom: 28 }}>
                  <div style={{ height: 16, width: 140, borderRadius: 8, background: "#1a1a1a", marginBottom: 14, animation: "pulse 1.4s infinite" }} />
                  <div style={{ display: "flex", gap: 10, overflowX: "hidden" }}>
                    {[1, 2, 3].map(j => <div key={j} style={{ width: 110, height: 185, borderRadius: 12, background: "#1a1a1a", flexShrink: 0, animation: "pulse 1.4s infinite" }} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {heroBanner && <div style={{ paddingTop: 16 }}><HeroBanner file={heroBanner} onClick={setSelected} /></div>}
              <CategoryRow title="NOW PLAYING" files={nowPlaying} onFileClick={setSelected} />
              <CategoryRow title="GLOBAL TRENDING" files={globalTrend} onFileClick={setSelected} />
              <CategoryRow title="TRENDING SERIES" files={seriesTrend} onFileClick={setSelected} />
              <CategoryRow title="HINDI MOVIES" files={hindiFils} onFileClick={setSelected} />
              <CategoryRow title="MALAYALAM SERIES" files={malayalamFils} onFileClick={setSelected} />
              <CategoryRow title="TAMIL SERIES" files={tamilFils} onFileClick={setSelected} />
              <CategoryRow title="UPCOMING INDIAN" files={upcomingInd} onFileClick={setSelected} />
            </>
          )}
        </div>
      )}

      {/* ══ SEARCH TAB ══ */}
      {tab === "search" && (
        <div>
          <div style={{ padding: "16px 16px 0" }}>
            {heroBanner && (
              <div
                onClick={() => setSelected(heroBanner)}
                style={{
                  borderRadius: 18, overflow: "hidden", position: "relative",
                  height: 160, cursor: "pointer", marginBottom: 20, background: "#1a1a1a",
                }}
              >
                <HeroBanner file={heroBanner} onClick={setSelected} />
              </div>
            )}

            <div style={{ fontSize: 10, fontWeight: 700, color: "#444", letterSpacing: "1.5px", marginBottom: 10 }}>
              TRENDING SEARCHES
            </div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 20, scrollbarWidth: "none" }}>
              {nowPlaying.slice(0, 4).map(f => {
                const t = extractMovieTitle(f.file_name);
                return (
                  <button
                    key={f.file_id}
                    onClick={() => { setQuery(t); setTab("search"); }}
                    style={{
                      padding: "7px 14px", borderRadius: 20,
                      background: "#1e1e1e", border: "1px solid #2a2a2a",
                      color: "#aaa", fontSize: 12, fontWeight: 600,
                      whiteSpace: "nowrap", cursor: "pointer",
                    }}
                  >{t}</button>
                );
              })}
            </div>

            <div style={{ background: "#161616", borderRadius: 18, padding: "16px", border: "1px solid #222", marginBottom: 20 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "#1a1a1a", border: "1px solid #2a2a2a",
                borderRadius: 12, padding: "10px 14px", marginBottom: 14,
              }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && doSearch()}
                  placeholder="Search movies, series, documentaries..."
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 14, color: "#eee" }}
                />
                {query && (
                  <button onClick={() => { setQuery(""); inputRef.current?.focus(); }}
                    style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 17, lineHeight: 1 }}>✕</button>
                )}
                <button
                  onClick={doSearch}
                  style={{
                    width: 32, height: 32, borderRadius: 10, border: "none",
                    background: "linear-gradient(135deg,#f39c12,#e74c3c)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </div>
              <FilterRow label="QUALITY" items={QUALITIES} active={quality} onSelect={setQuality} accent />
              <FilterRow label="LANGUAGE" items={LANGUAGES} active={language} onSelect={setLanguage} />
            </div>
          </div>

          <div style={{ padding: "0 16px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 13, color: "#555" }}>
                {loading ? "Searching..." : query || quality !== "All" || language !== "All" ? `${files.length} result${files.length !== 1 ? "s" : ""}` : ""}
              </span>
              {(query || quality !== "All" || language !== "All") && (
                <button onClick={clearAll} style={{ background: "none", border: "none", color: "#e74c3c", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Clear</button>
              )}
            </div>

            {loading && [1, 2, 3].map(i => (
              <div key={i} style={{ height: 110, borderRadius: 14, background: "#1a1a1a", marginBottom: 10, animation: "pulse 1.4s infinite" }} />
            ))}

            {!loading && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {files.map(f => <FileCard key={f.file_id} file={f} onClick={setSelected} />)}
              </div>
            )}

            {!loading && files.length === 0 && (query || quality !== "All" || language !== "All") && (
              <div style={{ textAlign: "center", padding: "70px 0" }}>
                <div style={{ fontSize: 52, marginBottom: 14 }}>🎬</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No results found</div>
                <div style={{ fontSize: 13, color: "#555" }}>Try different keywords or filters</div>
              </div>
            )}

            {!loading && files.length === 0 && !query && quality === "All" && language === "All" && (
              <div style={{ textAlign: "center", padding: "50px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 14 }}>🔍</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Search for movies</div>
                <div style={{ fontSize: 13, color: "#555" }}>Type a movie name, series title...</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ textAlign: "center", padding: "10px 16px 20px", borderTop: "1px solid #1a1a1a", fontSize: 11, color: "#444" }}>
        <p style={{ margin: "0 0 6px", lineHeight: 1.6 }}>
          All contents are publicly available on Telegram. We do not host any files.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
          <span>© 2026 OnePlex</span>
          <a href={`https://t.me/${BOT_USERNAME}`} style={{ color: "#555", textDecoration: "none" }}>Report issue</a>
        </div>
      </div>

      {selected && <DetailModal file={selected} onClose={() => setSelected(null)} />}

      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{height:3px;width:3px}
        ::-webkit-scrollbar-thumb{background:#333;border-radius:4px}
        @keyframes pulse{0%,100%{opacity:.35}50%{opacity:.7}}
        input::placeholder{color:#555}
        div::-webkit-scrollbar{display:none}
      `}</style>
    </div>
  );
}
