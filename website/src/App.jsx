import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════
// ⚠️  APNA BOT USERNAME AUR BOT SERVER URL YAHAN DAALO
// ═══════════════════════════════════════════════════════════════════
const BOT_USERNAME = "My_Suhani_bot";
const API_BASE = "https://grouphbot.onrender.com";

// ⚠️  TMDB API KEY YAHAN DAALO — themoviedb.org pe free milti hai
const TMDB_API_KEY = "a8c1b6b3487fbc94ca6bd229d9abed14";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const TMDB_IMG_ORIG = "https://image.tmdb.org/t/p/original";
// ═══════════════════════════════════════════════════════════════════

const QUALITIES = ["All", "2160p", "1080p", "720p", "480p", "360p", "240p"];
const LANGUAGES = ["All", "Hindi", "English", "Tamil", "Telugu", "Malayalam", "Kannada", "Bengali", "Punjabi"];

// ── Helpers ──────────────────────────────────────────────────────────
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
function stripPromotion(name = "") {
  name = name.replace(/@\S+/g, "");
  name = name.replace(/\[.*?@.*?\]|\(.*?@.*?\)/g, "");
  name = name.replace(/www\.\S+/gi, "");
  name = name.replace(/t\.me\/\S+/gi, "");
  return name.replace(/\s+/g, " ").trim();
}
function cleanFileName(name = "") {
  name = stripPromotion(name);
  return name.replace(/\.(mkv|mp4|avi|mov|webm)$/i, "").replace(/[-_.+]/g, " ").trim();
}
function extractMovieTitle(name = "") {
  let n = stripPromotion(name);
  n = n.replace(/\.(mkv|mp4|avi|mov|webm)$/i, "");
  n = n.replace(/[_+]/g, " ").replace(/\.(?!\d)/g, " ").trim();
  n = n.replace(/\d{1,2}:\d{2}/g, " ");
  n = n.replace(/\b(19|20)\d{2}\b.*/i, "").trim();
  n = n.replace(/\bS\d{2}E?\d*\b/gi, " ");
  n = n.replace(/\b(480p|720p|1080p|2160p|4k|hdrip|webrip|web\s?dl|bluray|hdcam|dvdrip|tataplay|hotstar|zee5|sonyliv|amazon|netflix|hbomax|predvd|hdts|camrip|x264|x265|h264|h265|hevc|aac|dd5|dts|multi|dual|hindi|english|tamil|telugu|malayalam|kannada|bengali|punjabi|org|hq|esub|sub|dubbed|proper|repack)\b/gi, " ");
  n = n.replace(/\b\d{1,2}\b/g, " ");
  n = n.replace(/\s+/g, " ").trim();
  const words = n.split(" ").filter(w => w.length > 1);
  return words.slice(0, 4).join(" ") || cleanFileName(name).split(" ").slice(0, 3).join(" ");
}

// ── Bot API ──────────────────────────────────────────────────────────
async function fetchFiles(query, quality, language, limit = 20) {
  try {
    const params = new URLSearchParams({ q: query || ".", quality, language, limit });
    const res = await fetch(`${API_BASE}/api/search?${params}`);
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    return data.files || [];
  } catch { return []; }
}

async function fetchTrending(category = "all", limit = 12) {
  try {
    const params = new URLSearchParams({ category, limit });
    const res = await fetch(`${API_BASE}/api/trending?${params}`);
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    return data.files || [];
  } catch { return []; }
}

// ── TMDB Direct API Calls (Proper Categories) ────────────────────────
async function tmdbGet(endpoint, params = {}) {
  try {
    const p = new URLSearchParams({ api_key: TMDB_API_KEY, language: "en-US", ...params });
    const res = await fetch(`${TMDB_BASE}${endpoint}?${p}`);
    if (!res.ok) throw new Error("TMDB error");
    return await res.json();
  } catch { return null; }
}

// TMDB se proper category data fetch karo
async function fetchTMDBNowPlaying() {
  const data = await tmdbGet("/movie/now_playing", { page: 1 });
  return (data?.results || []).slice(0, 10).map(m => ({
    id: m.id,
    title: m.title,
    poster: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : null,
    backdrop: m.backdrop_path ? `${TMDB_IMG_ORIG}${m.backdrop_path}` : null,
    rating: m.vote_average ? m.vote_average.toFixed(1) : null,
    year: m.release_date ? m.release_date.slice(0, 4) : null,
    overview: m.overview || null,
    type: "movie",
  }));
}

async function fetchTMDBTrendingMovies() {
  const data = await tmdbGet("/trending/movie/week");
  return (data?.results || []).slice(0, 12).map(m => ({
    id: m.id,
    title: m.title,
    poster: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : null,
    backdrop: m.backdrop_path ? `${TMDB_IMG_ORIG}${m.backdrop_path}` : null,
    rating: m.vote_average ? m.vote_average.toFixed(1) : null,
    year: m.release_date ? m.release_date.slice(0, 4) : null,
    overview: m.overview || null,
    type: "movie",
  }));
}

async function fetchTMDBTrendingSeries() {
  const data = await tmdbGet("/trending/tv/week");
  return (data?.results || []).slice(0, 10).map(m => ({
    id: m.id,
    title: m.name,
    poster: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : null,
    backdrop: m.backdrop_path ? `${TMDB_IMG_ORIG}${m.backdrop_path}` : null,
    rating: m.vote_average ? m.vote_average.toFixed(1) : null,
    year: m.first_air_date ? m.first_air_date.slice(0, 4) : null,
    overview: m.overview || null,
    type: "series",
  }));
}

async function fetchTMDBBollywood() {
  // Hindi movies — TMDB original_language=hi
  const data = await tmdbGet("/discover/movie", {
    with_original_language: "hi",
    sort_by: "popularity.desc",
    page: 1,
  });
  return (data?.results || []).slice(0, 10).map(m => ({
    id: m.id,
    title: m.title,
    poster: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : null,
    rating: m.vote_average ? m.vote_average.toFixed(1) : null,
    year: m.release_date ? m.release_date.slice(0, 4) : null,
    overview: m.overview || null,
    type: "movie",
  }));
}

async function fetchTMDBTamil() {
  const data = await tmdbGet("/discover/movie", {
    with_original_language: "ta",
    sort_by: "popularity.desc",
    page: 1,
  });
  return (data?.results || []).slice(0, 10).map(m => ({
    id: m.id,
    title: m.title,
    poster: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : null,
    rating: m.vote_average ? m.vote_average.toFixed(1) : null,
    year: m.release_date ? m.release_date.slice(0, 4) : null,
    overview: m.overview || null,
    type: "movie",
  }));
}

async function fetchTMDBMalayalam() {
  const data = await tmdbGet("/discover/movie", {
    with_original_language: "ml",
    sort_by: "popularity.desc",
    page: 1,
  });
  return (data?.results || []).slice(0, 10).map(m => ({
    id: m.id,
    title: m.title,
    poster: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : null,
    rating: m.vote_average ? m.vote_average.toFixed(1) : null,
    year: m.release_date ? m.release_date.slice(0, 4) : null,
    overview: m.overview || null,
    type: "movie",
  }));
}

async function fetchTMDBTopRated() {
  const data = await tmdbGet("/movie/top_rated", { page: 1 });
  return (data?.results || []).slice(0, 10).map(m => ({
    id: m.id,
    title: m.title,
    poster: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : null,
    rating: m.vote_average ? m.vote_average.toFixed(1) : null,
    year: m.release_date ? m.release_date.slice(0, 4) : null,
    overview: m.overview || null,
    type: "movie",
  }));
}

// Poster TMDB se search by name (search results ke liye)
const posterCache = {};
async function fetchPosterFromTMDB(title, year) {
  const key = `p_${title}_${year}`;
  if (posterCache[key] !== undefined) return posterCache[key];
  posterCache[key] = null;

  // Pehle backend se try karo
  try {
    const params = new URLSearchParams({ title, ...(year ? { year } : {}) });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${API_BASE}/api/poster?${params}`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data?.poster && typeof data.poster === "string" && data.poster.startsWith("https://")) {
        posterCache[key] = data;
        return data;
      }
    }
  } catch { /* backend fail */ }

  // TMDB direct search
  if (!TMDB_API_KEY) return null;
  try {
    const searchUrl = `${TMDB_BASE}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}${year ? `&year=${year}` : ""}&language=en-US&page=1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(searchUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error("TMDB fail");
    const data = await res.json();
    const result = (data.results || []).find(r => r.poster_path);
    if (!result) { posterCache[key] = null; return null; }
    const out = {
      poster: `${TMDB_IMG}${result.poster_path}`,
      imdb_rating: result.vote_average ? result.vote_average.toFixed(1) : null,
      plot: result.overview || null,
    };
    posterCache[key] = out;
    return out;
  } catch {
    posterCache[key] = null;
    return null;
  }
}

// ── TMDB Card (Home Page ke liye — seedha TMDB data) ─────────────────
function TMDBCard({ item, onClick }) {
  const [hov, setHov] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const hue = [...(item.title || "")].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const initials = (item.title || "").split(" ").slice(0, 2).map(w => w[0] || "").join("").toUpperCase();

  return (
    <div
      onClick={() => onClick(item.title)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 115, flexShrink: 0, cursor: "pointer", borderRadius: 14, overflow: "hidden",
        background: "#161616", border: `1px solid ${hov ? "#363636" : "#1e1e1e"}`,
        transform: hov ? "scale(1.04) translateY(-2px)" : "scale(1)",
        transition: "transform .2s, border-color .2s, box-shadow .2s",
        boxShadow: hov ? "0 10px 28px rgba(0,0,0,.55)" : "none",
      }}
    >
      <div style={{ height: 158, background: "#1a1a1a", overflow: "hidden", position: "relative" }}>
        {item.poster && !imgFailed ? (
          <>
            {!imgLoaded && (
              <div style={{
                position: "absolute", inset: 0,
                background: `linear-gradient(135deg,hsl(${hue},40%,10%),hsl(${(hue + 60) % 360},30%,7%))`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid #2a2a2a", borderTopColor: `hsl(${hue},60%,40%)`, animation: "spin 0.9s linear infinite" }} />
              </div>
            )}
            <img
              src={item.poster} alt={item.title} loading="lazy" decoding="async"
              style={{ width: "100%", height: "100%", objectFit: "cover", opacity: imgLoaded ? 1 : 0, transition: "opacity 0.4s ease", display: "block" }}
              onLoad={() => setImgLoaded(true)}
              onError={() => { setImgFailed(true); setImgLoaded(false); }}
            />
          </>
        ) : (
          <div style={{
            width: "100%", height: "100%", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: `linear-gradient(145deg,hsl(${hue},55%,16%),hsl(${(hue + 50) % 360},45%,10%))`,
            fontSize: "22px", fontWeight: "900", color: `hsl(${hue},70%,60%)`, letterSpacing: "2px",
          }}>{initials || "🎬"}</div>
        )}
        {item.rating && item.rating !== "0.0" && imgLoaded && !imgFailed && (
          <div style={{
            position: "absolute", bottom: 5, left: 5,
            background: "rgba(0,0,0,.85)", borderRadius: 6, padding: "2px 6px",
            display: "flex", alignItems: "center", gap: 3, backdropFilter: "blur(4px)",
          }}>
            <span style={{ fontSize: 9, color: "#f1c40f" }}>⭐</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#f1c40f" }}>{item.rating}</span>
          </div>
        )}
        {item.type === "series" && (
          <div style={{ position: "absolute", top: 5, right: 5, background: "rgba(52,152,219,.85)", borderRadius: 4, padding: "1px 5px", fontSize: 8, fontWeight: 700, color: "#fff" }}>SERIES</div>
        )}
      </div>
      <div style={{ padding: "8px 8px 10px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#ccc", lineHeight: 1.4, marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {item.title}
        </div>
        {item.year && <span style={{ fontSize: 9, color: "#555" }}>{item.year}</span>}
      </div>
    </div>
  );
}

// ── Hero Banner (TMDB item se) ────────────────────────────────────────
function HeroBannerTMDB({ item, onClick }) {
  const [bgLoaded, setBgLoaded] = useState(false);
  const hue = [...(item.title || "")].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

  const bgSrc = item.backdrop || item.poster;

  return (
    <div
      onClick={() => onClick(item.title)}
      style={{
        margin: "0 16px 26px", borderRadius: 22, overflow: "hidden", position: "relative",
        height: 215, cursor: "pointer",
        background: `linear-gradient(135deg,hsl(${hue},35%,10%),hsl(${(hue + 60) % 360},25%,6%))`,
        boxShadow: "0 16px 44px rgba(0,0,0,.65)",
      }}
    >
      {bgSrc && (
        <img
          src={bgSrc} alt={item.title} loading="lazy"
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", objectPosition: "center top",
            opacity: bgLoaded ? 0.5 : 0, transition: "opacity 0.6s ease",
          }}
          onLoad={() => setBgLoaded(true)} onError={() => setBgLoaded(false)}
        />
      )}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right,rgba(0,0,0,.94) 35%,rgba(0,0,0,.25))" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,.9) 0%,transparent 55%)" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: "25%", padding: "18px 20px" }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: "#f39c12", letterSpacing: "2.5px", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 18, height: 2, background: "#f39c12", display: "inline-block", borderRadius: 2 }} />
          FEATURED TODAY
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", lineHeight: 1.2, marginBottom: 8, textShadow: "0 2px 8px rgba(0,0,0,.6)" }}>
          {item.title}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {item.rating && item.rating !== "0.0" && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, background: "rgba(241,196,15,.12)", borderRadius: 6, padding: "3px 8px", border: "1px solid rgba(241,196,15,.25)" }}>
              <span style={{ fontSize: 10, color: "#f1c40f" }}>⭐</span>
              <span style={{ fontSize: 11, color: "#f1c40f", fontWeight: 700 }}>{item.rating}</span>
            </span>
          )}
          {item.year && <span style={{ fontSize: 11, color: "#777" }}>{item.year}</span>}
        </div>
        {item.overview && (
          <p style={{ fontSize: 11, color: "#555", lineHeight: 1.55, marginTop: 8, marginBottom: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {item.overview}
          </p>
        )}
      </div>
      <div style={{
        position: "absolute", right: 18, bottom: 18, width: 46, height: 46, borderRadius: "50%",
        background: "linear-gradient(135deg,#f39c12,#e74c3c)", display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 18px rgba(243,156,18,.45)",
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
      </div>
    </div>
  );
}

// ── Poster Component (Search results file ke liye) ───────────────────
function Poster({ file, size = "card" }) {
  const [imgSrc, setImgSrc] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [rating, setRating] = useState(null);
  const title = extractMovieTitle(file.file_name);
  const year = extractYear(file.file_name);

  useEffect(() => {
    let cancelled = false;
    setImgSrc(null); setImgLoaded(false); setImgFailed(false);
    fetchPosterFromTMDB(title, year).then(data => {
      if (!cancelled && data?.poster) { setImgSrc(data.poster); setRating(data.imdb_rating); }
    });
    return () => { cancelled = true; };
  }, [title, year]);

  const initials = title.split(" ").slice(0, 2).map(w => w[0] || "").join("").toUpperCase();
  const hue = [...title].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

  if (imgSrc && !imgFailed) {
    return (
      <div style={{ width: "100%", height: "100%", position: "relative", borderRadius: "inherit" }}>
        {!imgLoaded && (
          <div style={{ position: "absolute", inset: 0, borderRadius: "inherit", background: `linear-gradient(135deg,hsl(${hue},40%,10%),hsl(${(hue + 60) % 360},30%,7%))`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid #2a2a2a", borderTopColor: `hsl(${hue},60%,40%)`, animation: "spin 0.9s linear infinite" }} />
          </div>
        )}
        <img
          src={imgSrc} alt={title} loading="lazy" decoding="async"
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit", opacity: imgLoaded ? 1 : 0, transition: "opacity 0.4s ease", display: "block" }}
          onLoad={() => setImgLoaded(true)}
          onError={() => { setImgFailed(true); setImgLoaded(false); }}
        />
        {rating && rating !== "N/A" && rating !== "0.0" && imgLoaded && (
          <div style={{ position: "absolute", bottom: 5, left: 5, background: "rgba(0,0,0,.85)", borderRadius: 6, padding: "2px 6px", display: "flex", alignItems: "center", gap: 3, backdropFilter: "blur(4px)" }}>
            <span style={{ fontSize: 9, color: "#f1c40f" }}>⭐</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#f1c40f" }}>{rating}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", borderRadius: "inherit",
      background: `linear-gradient(145deg,hsl(${hue},55%,16%),hsl(${(hue + 50) % 360},45%,10%))`,
      fontSize: size === "banner" ? "38px" : "22px",
      fontWeight: "900", color: `hsl(${hue},70%,60%)`, letterSpacing: "2px", gap: 4,
    }}>
      {initials || "🎬"}
    </div>
  );
}

// ── File Card (Search results) ───────────────────────────────────────
function FileCard({ file, onClick }) {
  const [hov, setHov] = useState(false);
  const q = extractQuality(file.file_name);
  const year = extractYear(file.file_name);
  const name = cleanFileName(file.file_name);
  return (
    <div onClick={() => onClick(file)} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", gap: 12, padding: 14,
        background: hov ? "#1b1b1b" : "#161616", borderRadius: 16, cursor: "pointer",
        border: `1px solid ${hov ? "#2e2e2e" : "#1e1e1e"}`,
        transition: "background .15s, border-color .15s, transform .15s",
        transform: hov ? "translateX(3px)" : "translateX(0)",
      }}>
      <div style={{ width: 66, height: 88, flexShrink: 0, borderRadius: 10, overflow: "hidden", boxShadow: "0 4px 14px rgba(0,0,0,.45)" }}>
        <Poster file={file} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#eee", lineHeight: 1.4, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{name}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
          {q && <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: qualityColor(q), color: "#fff" }}>{q}</span>}
          {year && <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, background: "#222", color: "#777" }}>{year}</span>}
        </div>
        {file.file_size > 0 && <span style={{ fontSize: 11, color: "#444" }}>💾 {formatSize(file.file_size)}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", color: "#333", paddingRight: 2 }}>›</div>
    </div>
  );
}

// ── TMDB Category Row ─────────────────────────────────────────────────
function TMDBCategoryRow({ title, items, onItemClick }) {
  if (!items || !items.length) return null;
  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 3, height: 14, background: "linear-gradient(#f39c12,#e74c3c)", borderRadius: 2, display: "inline-block" }} />
          <span style={{ fontSize: 12, fontWeight: 800, color: "#ddd", letterSpacing: "1.5px" }}>{title}</span>
        </div>
        <span style={{ fontSize: 10, color: "#3a3a3a" }}>scroll →</span>
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingLeft: 16, paddingRight: 16, paddingBottom: 6, scrollbarWidth: "none" }}>
        {items.map(item => (
          <TMDBCard key={item.id} item={item} onClick={onItemClick} />
        ))}
      </div>
    </div>
  );
}

// ── Detail Modal (search file ke liye) ──────────────────────────────
function DetailModal({ file, onClose }) {
  const [posterData, setPosterData] = useState(null);
  const [bgLoaded, setBgLoaded] = useState(false);
  const q = extractQuality(file.file_name);
  const year = extractYear(file.file_name);
  const name = cleanFileName(file.file_name);
  const title = extractMovieTitle(file.file_name);
  const link = tgLink(file.file_id);
  const hue = [...title].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    fetchPosterFromTMDB(title, year).then(data => { if (data?.poster) setPosterData(data); });
    return () => { document.body.style.overflow = ""; };
  }, [title, year]);

  const handleShare = () => {
    if (navigator.share) navigator.share({ title: name, url: link });
    else navigator.clipboard?.writeText(link).then(() => alert("Link copied! ✅"));
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.88)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(10px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#111", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 480, overflow: "hidden", animation: "slideUp .3s cubic-bezier(.32,1.4,.6,1)", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "#2a2a2a" }} />
        </div>
        <div style={{ position: "relative", height: 280, background: `linear-gradient(135deg,hsl(${hue},35%,10%),hsl(${(hue + 60) % 360},25%,7%))` }}>
          {posterData?.poster ? (
            <img src={posterData.poster} alt={title}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", opacity: bgLoaded ? 1 : 0, transition: "opacity 0.5s ease" }}
              onLoad={() => setBgLoaded(true)} onError={() => setBgLoaded(false)} />
          ) : (
            <div style={{ position: "absolute", inset: 0 }}><Poster file={file} size="banner" /></div>
          )}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,transparent 30%,#111 100%)" }} />
          <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,.75)", border: "1px solid #2a2a2a", color: "#aaa", fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ padding: "0 18px 34px" }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", lineHeight: 1.3, marginBottom: 12 }}>{name}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
            {q && <span style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: qualityColor(q), color: "#fff" }}>{q}</span>}
            {year && <span style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, background: "#222", color: "#888" }}>{year}</span>}
            {file.file_size > 0 && <span style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, background: "#222", color: "#888" }}>💾 {formatSize(file.file_size)}</span>}
            {posterData?.imdb_rating && posterData.imdb_rating !== "N/A" && posterData.imdb_rating !== "0.0" && (
              <span style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: "rgba(241,196,15,.08)", color: "#f1c40f", border: "1px solid rgba(241,196,15,.18)" }}>
                ⭐ {posterData.imdb_rating}
              </span>
            )}
          </div>
          {posterData?.plot && (
            <p style={{ fontSize: 12.5, color: "#5a5a5a", lineHeight: 1.7, marginBottom: 20, borderLeft: "2px solid #222", paddingLeft: 12 }}>{posterData.plot}</p>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <a href={link} target="_blank" rel="noopener noreferrer"
              style={{ flex: 1, padding: "15px 0", borderRadius: 16, background: "linear-gradient(135deg,#f39c12,#e74c3c)", color: "#fff", fontSize: 14, fontWeight: 700, textAlign: "center", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 22px rgba(243,156,18,.32)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-2.03 9.571c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.893.65z" />
              </svg>
              Open in Telegram
            </a>
            <button onClick={handleShare} style={{ width: 54, height: 54, borderRadius: 16, background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#777", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    </div>
  );
}

// ── Filter Row ───────────────────────────────────────────────────────
function FilterRow({ label, items, active, onSelect, accent }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#444", letterSpacing: "1.5px", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" }}>
        {items.map(item => {
          const on = active === item;
          return (
            <button key={item} onClick={() => onSelect(item)} style={{
              padding: "6px 15px", borderRadius: 20, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", transition: "all .15s",
              background: on ? (accent ? "linear-gradient(135deg,#f39c12,#e74c3c)" : "#f0f0f0") : "#1e1e1e",
              color: on ? (accent ? "#fff" : "#111") : "#555",
              boxShadow: on && accent ? "0 2px 12px rgba(243,156,18,.3)" : "none",
              transform: on ? "scale(1.04)" : "scale(1)",
            }}>{item}</button>
          );
        })}
      </div>
    </div>
  );
}

// ── Skeleton Loaders ─────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{ width: 115, flexShrink: 0, borderRadius: 14, overflow: "hidden", background: "#161616", border: "1px solid #1e1e1e" }}>
      <div style={{ height: 158, background: "#1c1c1c", animation: "pulse 1.6s ease infinite" }} />
      <div style={{ padding: "8px 8px 12px" }}>
        <div style={{ height: 10, background: "#1c1c1c", borderRadius: 5, marginBottom: 6, animation: "pulse 1.6s ease infinite" }} />
        <div style={{ height: 10, background: "#1c1c1c", borderRadius: 5, width: "60%", animation: "pulse 1.6s ease infinite" }} />
      </div>
    </div>
  );
}
function SkeletonFile() {
  return (
    <div style={{ display: "flex", gap: 12, padding: 14, background: "#161616", borderRadius: 16, border: "1px solid #1e1e1e" }}>
      <div style={{ width: 66, height: 88, borderRadius: 10, background: "#1c1c1c", flexShrink: 0, animation: "pulse 1.6s ease infinite" }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: 14, background: "#1c1c1c", borderRadius: 6, marginBottom: 8, animation: "pulse 1.6s ease infinite" }} />
        <div style={{ height: 14, background: "#1c1c1c", borderRadius: 6, width: "75%", marginBottom: 10, animation: "pulse 1.6s ease infinite" }} />
        <div style={{ height: 20, background: "#1c1c1c", borderRadius: 6, width: "35%", animation: "pulse 1.6s ease infinite" }} />
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("home");
  const [query, setQuery] = useState("");
  const [quality, setQuality] = useState("All");
  const [language, setLanguage] = useState("All");
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [focused, setFocused] = useState(false);

  // TMDB categories — sab alag alag
  const [nowPlaying, setNowPlaying] = useState([]);       // Cinema mein chal rahi movies
  const [globalTrend, setGlobalTrend] = useState([]);     // Global trending movies (week)
  const [seriesTrend, setSeriesTrend] = useState([]);     // Trending web series / TV
  const [bollywood, setBollywood] = useState([]);          // Hindi movies
  const [tamilFils, setTamilFils] = useState([]);          // Tamil movies
  const [malayalamFils, setMalayalamFils] = useState([]);  // Malayalam movies
  const [topRated, setTopRated] = useState([]);            // Top rated all-time
  const [heroBanner, setHeroBanner] = useState(null);     // Featured banner
  const [homeLoading, setHomeLoading] = useState(true);

  const inputRef = useRef(null);

  // Home data — TMDB se proper categories
  useEffect(() => {
    if (tab !== "home") return;
    setHomeLoading(true);
    Promise.all([
      fetchTMDBNowPlaying(),
      fetchTMDBTrendingMovies(),
      fetchTMDBTrendingSeries(),
      fetchTMDBBollywood(),
      fetchTMDBTamil(),
      fetchTMDBMalayalam(),
      fetchTMDBTopRated(),
    ]).then(([np, trendMov, trendSer, bolly, tamil, mal, topR]) => {
      setNowPlaying(np);
      setGlobalTrend(trendMov);
      setSeriesTrend(trendSer);
      setBollywood(bolly);
      setTamilFils(tamil);
      setMalayalamFils(mal);
      setTopRated(topR);
      // Hero banner — now playing ka pehla item (with backdrop)
      const heroItem = np.find(m => m.backdrop) || np[0] || trendMov[0];
      if (heroItem) setHeroBanner(heroItem);
      setHomeLoading(false);
    });
  }, [tab]);

  const doSearch = useCallback(async (q = query) => {
    if (!q.trim() && quality === "All" && language === "All") { setFiles([]); return; }
    setLoading(true);
    const results = await fetchFiles(q, quality, language);
    setFiles(results);
    setLoading(false);
  }, [query, quality, language]);

  useEffect(() => {
    if (tab !== "search") return;
    const t = setTimeout(() => doSearch(), 350);
    return () => clearTimeout(t);
  }, [doSearch, tab]);

  const clearAll = () => { setQuery(""); setQuality("All"); setLanguage("All"); };

  const handleTMDBCardClick = (movieTitle) => {
    setQuery(movieTitle);
    setQuality("All");
    setLanguage("All");
    setTab("search");
    setLoading(true);
    fetchFiles(movieTitle, "All", "All").then(results => {
      setFiles(results);
      setLoading(false);
    });
  };

  // Trending chips (search page ke liye — now playing titles)
  const trendingChips = nowPlaying.slice(0, 6);

  return (
    <div style={{ background: "#0d0d0d", minHeight: "100vh", fontFamily: "'DM Sans',sans-serif", color: "#eee", maxWidth: 480, margin: "0 auto" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=Bebas+Neue&display=swap" />

      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(13,13,13,.97)", borderBottom: "1px solid #181818", padding: "14px 16px 14px", backdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span onClick={() => setTab("home")} style={{ fontSize: 28, fontWeight: 900, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 3, lineHeight: 1, cursor: "pointer" }}>
            <span style={{ color: "#f39c12" }}>SUHANI</span><span style={{ color: "#e74c3c" }}> SEARCH</span>
          </span>
          <button onClick={() => { setTab("search"); setTimeout(() => inputRef.current?.focus(), 150); }}
            style={{ background: "#181818", border: "1px solid #252525", borderRadius: 22, padding: "7px 14px", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: "#555", fontSize: 12 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            Search...
          </button>
        </div>
      </div>

      {/* HOME */}
      {tab === "home" && (
        <div style={{ paddingBottom: 30 }}>
          {homeLoading ? (
            <div style={{ padding: "20px 16px" }}>
              <div style={{ height: 215, borderRadius: 22, background: "#181818", marginBottom: 28, animation: "pulse 1.6s ease infinite" }} />
              {[1, 2, 3].map(i => (
                <div key={i} style={{ marginBottom: 30 }}>
                  <div style={{ height: 14, width: 150, borderRadius: 6, background: "#181818", marginBottom: 14, animation: "pulse 1.6s ease infinite" }} />
                  <div style={{ display: "flex", gap: 10, overflowX: "hidden" }}>
                    {[1, 2, 3].map(j => <SkeletonCard key={j} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {heroBanner && (
                <div style={{ paddingTop: 18 }}>
                  <HeroBannerTMDB item={heroBanner} onClick={handleTMDBCardClick} />
                </div>
              )}
              {/* Har category alag alag — koi duplicate nahi */}
              <TMDBCategoryRow title="NOW PLAYING" items={nowPlaying} onItemClick={handleTMDBCardClick} />
              <TMDBCategoryRow title="GLOBAL TRENDING" items={globalTrend} onItemClick={handleTMDBCardClick} />
              <TMDBCategoryRow title="TRENDING SERIES" items={seriesTrend} onItemClick={handleTMDBCardClick} />
              <TMDBCategoryRow title="BOLLYWOOD" items={bollywood} onItemClick={handleTMDBCardClick} />
              <TMDBCategoryRow title="TAMIL MOVIES" items={tamilFils} onItemClick={handleTMDBCardClick} />
              <TMDBCategoryRow title="MALAYALAM MOVIES" items={malayalamFils} onItemClick={handleTMDBCardClick} />
              <TMDBCategoryRow title="TOP RATED ALL TIME" items={topRated} onItemClick={handleTMDBCardClick} />
            </>
          )}
        </div>
      )}

      {/* SEARCH */}
      {tab === "search" && (
        <div>
          <div style={{ padding: "18px 16px 0" }}>
            {trendingChips.length > 0 && !query && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#3a3a3a", letterSpacing: "1.5px", marginBottom: 10 }}>TRENDING NOW</div>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 20, scrollbarWidth: "none" }}>
                  {trendingChips.map(item => (
                    <button key={item.id} onClick={() => handleTMDBCardClick(item.title)}
                      style={{ padding: "7px 14px", borderRadius: 20, background: "#181818", border: "1px solid #252525", color: "#888", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 10 }}>🔥</span>{item.title}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div style={{ background: "#141414", borderRadius: 20, padding: "14px 16px", border: `1px solid ${focused ? "#2e2e2e" : "#1e1e1e"}`, marginBottom: 18, transition: "border-color .2s", boxShadow: focused ? "0 0 0 3px rgba(243,156,18,.05)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#1a1a1a", border: `1px solid ${focused ? "#2e2e2e" : "#222"}`, borderRadius: 14, padding: "11px 14px", marginBottom: 16, transition: "border-color .2s" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
                  onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                  onKeyDown={e => e.key === "Enter" && doSearch()}
                  placeholder="Search movies, series..."
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 14, color: "#eee" }} />
                {query && (
                  <button onClick={() => { setQuery(""); inputRef.current?.focus(); }}
                    style={{ background: "#252525", border: "none", borderRadius: "50%", width: 22, height: 22, color: "#666", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                )}
              </div>
              <FilterRow label="QUALITY" items={QUALITIES} active={quality} onSelect={setQuality} accent />
              <FilterRow label="LANGUAGE" items={LANGUAGES} active={language} onSelect={setLanguage} />
            </div>
          </div>

          <div style={{ padding: "0 16px 30px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: "#3a3a3a", fontWeight: 600 }}>
                {loading ? "Searching..." : (query || quality !== "All" || language !== "All") ? `${files.length} result${files.length !== 1 ? "s" : ""} found` : ""}
              </span>
              {(query || quality !== "All" || language !== "All") && (
                <button onClick={clearAll} style={{ background: "none", border: "none", color: "#e74c3c", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>Clear all</button>
              )}
            </div>
            {loading && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[1, 2, 3, 4].map(i => <SkeletonFile key={i} />)}</div>}
            {!loading && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {files.map((f, i) => (
                  <div key={f.file_id} style={{ animation: `fadeIn .3s ease ${i * 0.04}s both` }}>
                    <FileCard file={f} onClick={setSelected} />
                  </div>
                ))}
              </div>
            )}
            {!loading && files.length === 0 && (query || quality !== "All" || language !== "All") && (
              <div style={{ textAlign: "center", padding: "70px 20px" }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>🎬</div>
                <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8, color: "#ccc" }}>No results found</div>
                <div style={{ fontSize: 13, color: "#444", lineHeight: 1.6 }}>Try different keywords or change filters</div>
                <button onClick={clearAll} style={{ marginTop: 20, padding: "10px 24px", borderRadius: 20, background: "linear-gradient(135deg,#f39c12,#e74c3c)", border: "none", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Reset Filters</button>
              </div>
            )}
            {!loading && files.length === 0 && !query && quality === "All" && language === "All" && (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <div style={{ fontSize: 52, marginBottom: 16 }}>🔍</div>
                <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8, color: "#ccc" }}>Search anything</div>
                <div style={{ fontSize: 13, color: "#444", lineHeight: 1.6 }}>Type a movie name, series title,<br />or pick from trending above</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign: "center", padding: "12px 16px 28px", borderTop: "1px solid #181818", fontSize: 11, color: "#2e2e2e" }}>
        <p style={{ margin: "0 0 6px", lineHeight: 1.7 }}>All contents are publicly available on Telegram.<br />We do not host any files.</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 16, alignItems: "center" }}>
          <span>© 2026 Suhani Search</span>
          <span style={{ color: "#1e1e1e" }}>•</span>
          <a href={`https://t.me/${BOT_USERNAME}`} style={{ color: "#333", textDecoration: "none" }}>Report issue</a>
        </div>
      </div>

      {selected && <DetailModal file={selected} onClose={() => setSelected(null)} />}

      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{height:3px;width:3px}
        ::-webkit-scrollbar-thumb{background:#252525;border-radius:4px}
        @keyframes pulse{0%,100%{opacity:.2}50%{opacity:.5}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
        input::placeholder{color:#3a3a3a}
        div::-webkit-scrollbar{display:none}
        button{font-family:inherit}
      `}</style>
    </div>
  );
}
