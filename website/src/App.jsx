import { useState, useEffect, useRef, useCallback, Component } from "react";

// ── Error Boundary ────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("App crashed:", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#eee", fontFamily: "sans-serif", padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Kuch galat ho gaya</div>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 24 }}>{this.state.error?.message || "Unknown error"}</div>
          <button onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{ padding: "12px 28px", borderRadius: 50, background: "linear-gradient(135deg,#f39c12,#e74c3c)", border: "none", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ═══════════════════════════════════════════════════════════════════
// CONFIG — .env mein VITE_API_BASE aur VITE_TMDB_KEY daalo
// Multiple TMDB keys ke liye: VITE_TMDB_KEY_1, VITE_TMDB_KEY_2, etc.
// ═══════════════════════════════════════════════════════════════════
const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || "My_Suhani_bot";

// FIX: https:// ensure karo API_BASE mein
const _RAW_API_BASE = import.meta.env.VITE_API_BASE || "worker-production-58e0.up.railway.app";
const API_BASE = _RAW_API_BASE.startsWith("http") ? _RAW_API_BASE : `https://${_RAW_API_BASE}`;

// ── Multiple TMDB API Keys (rotation for rate limit bypass) ──────────
const _TMDB_KEYS = [
  import.meta.env.VITE_TMDB_KEY,
  import.meta.env.VITE_TMDB_KEY_2,
  import.meta.env.VITE_TMDB_KEY_3,
  import.meta.env.VITE_TMDB_KEY_4,
].filter(Boolean);
if (_TMDB_KEYS.length === 0) _TMDB_KEYS.push("");
let _tmdbKeyIndex = 0;
const _tmdbKeyFailCount = new Map();
function getNextTMDBKey() {
  // Round-robin rotation
  const key = _TMDB_KEYS[_tmdbKeyIndex % _TMDB_KEYS.length];
  _tmdbKeyIndex = (_tmdbKeyIndex + 1) % _TMDB_KEYS.length;
  return key;
}
function markKeyFailed(key) {
  _tmdbKeyFailCount.set(key, (_tmdbKeyFailCount.get(key) || 0) + 1);
}

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w185";
const TMDB_IMG_MD = "https://image.tmdb.org/t/p/w342";
const TMDB_IMG_ORIG = "https://image.tmdb.org/t/p/original";

// ── Timing Constants (magic numbers hata diye) ──────────────────────
const SERVER_WAKING_DELAY_MS = 4000;
const SERVER_TIMEOUT_MS = 35000;
const SEARCH_DEBOUNCE_MS = 350;
const HOME_CACHE_TTL_MS = 30 * 60 * 1000;
const TMDB_CACHE_MAX = 300;
const API_FETCH_BATCH = 200;
const HERO_AUTOPLAY_MS = 5000;
const INTERSECT_ROOT_MARGIN = "300px";
const PAGE_SIZE = 50;
// ═══════════════════════════════════════════════════════════════════

const QUALITIES = ["All", "2160p", "1080p", "720p", "480p", "360p", "240p"];
const LANGUAGES = ["All", "Hindi", "English", "Tamil", "Telugu", "Malayalam", "Kannada", "Bengali", "Punjabi"];

// Voice recognition language map — FIX: no longer hardcoded "hi-IN"
const LANG_TO_SPEECH_LOCALE = {
  Hindi: "hi-IN", Tamil: "ta-IN", Telugu: "te-IN",
  Malayalam: "ml-IN", Kannada: "kn-IN", Bengali: "bn-IN",
  Punjabi: "pa-IN", English: "en-US", All: "hi-IN",
};

// ── LocalStorage Helpers (Watchlist) ─────────────────────────────────
function getWatchlist() {
  try { return JSON.parse(localStorage.getItem("watchlist") || "[]"); } catch { return []; }
}
function saveWatchlist(list) {
  try { localStorage.setItem("watchlist", JSON.stringify(list)); } catch {}
}
function isInWatchlist(id) {
  return getWatchlist().some(x => String(x.id) === String(id));
}
function toggleWatchlist(item) {
  const list = getWatchlist();
  const idx = list.findIndex(x => String(x.id) === String(item.id));
  if (idx !== -1) { list.splice(idx, 1); } else { list.unshift(item); }
  saveWatchlist(list);
  return idx === -1;
}

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
  if (q.includes("2160")) return "linear-gradient(135deg,#f6c90e,#e8a00c)";
  if (q.includes("1080")) return "linear-gradient(135deg,#e74c3c,#c0392b)";
  if (q.includes("720")) return "linear-gradient(135deg,#e67e22,#d35400)";
  if (q.includes("480")) return "linear-gradient(135deg,#27ae60,#1e8449)";
  return "linear-gradient(135deg,#555,#444)";
}
function qualityBg(q = "") {
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

// ── extractMovieTitle with simple LRU cache ──────────────────────────
// FIX: Instead of clearing entire cache at 2000, drop oldest 200 entries (LRU-lite)
const _titleCache = new Map();
function extractMovieTitle(name = "") {
  if (_titleCache.has(name)) return _titleCache.get(name);
  let n = stripPromotion(name);
  n = n.replace(/\.(mkv|mp4|avi|mov|webm)$/i, "");
  n = n.replace(/[\u24B6-\u24E9\u2460-\u24FF]/g, "");
  n = n.replace(/[\u{1F100}-\u{1F1FF}\u{1F170}-\u{1F171}\u{1F17E}-\u{1F17F}\u{1F191}-\u{1F19A}\u{1F200}-\u{1F2FF}]/gu, "");
  n = n.replace(/^[^\x00-\x7F\u00C0-\u024F\s]+\s*/g, "");
  n = n.replace(/^(\s*\[[^\]]{1,30}\])+\s*/g, "");
  const knownPrefixes = [
    /^Toonworld4all\s*/i, /^MoviezWap\s*/i, /^MoviesMod\s*/i, /^MoviesCounter\s*/i,
    /^TGMovies\s*/i, /^TGM\s*/i, /^HEVC\s+(?=\w)/i,
  ];
  for (const rx of knownPrefixes) n = n.replace(rx, "");
  n = n.replace(/\[[^\]]{1,30}\]/g, " ");
  n = n.replace(/[_+]/g, " ").replace(/\.(?!\d)/g, " ").trim();
  n = n.replace(/\d{1,2}:\d{2}/g, " ");
  n = n.replace(/\b(19|20)\d{2}\b.*/i, "").trim();
  n = n.replace(/\bS\d{2}E?\d*\b/gi, " ");
  n = n.replace(/\b(480p|720p|1080p|2160p|4k|hdrip|webrip|web\s?dl|bluray|hdcam|dvdrip|tataplay|hotstar|zee5|sonyliv|hbomax|predvd|hdts|camrip|x264|x265|h264|h265|hevc|aac|dd5|dts|org|hq|esub|sub|proper|repack|imax|truehd|atmos|dolby|10bit|hdr|hdr10|ds4k|hmax|wmax)\b/gi, " ");
  const words = n.split(" ").filter(w => w.length > 0);
  const filtered = words.filter((w, idx) => {
    if (idx < 2) return true;
    return !/^(multi|dual|dubbed|hindi|english|tamil|telugu|malayalam|kannada|bengali|punjabi|amazon|netflix|true)$/i.test(w);
  });
  n = filtered.join(" ").replace(/\s+/g, " ").trim();
  const finalWords = n.split(" ").filter(w => w.length > 1);
  const result = finalWords.slice(0, 6).join(" ") || cleanFileName(name).split(" ").slice(0, 4).join(" ");
  // LRU-lite: drop oldest 200 when cache hits 2000
  if (_titleCache.size >= 2000) {
    const keys = _titleCache.keys();
    for (let i = 0; i < 200; i++) { _titleCache.delete(keys.next().value); }
  }
  _titleCache.set(name, result);
  return result;
}

function extractEpisodeInfo(name = "") {
  const combined = name.match(/[Ss]?\d{0,2}[Ee](\d{1,3})[-–][Ee]?(\d{1,3})/i)
    || name.match(/[Ee]pisodes?\s*(\d{1,3})[-–](\d{1,3})/i);
  if (combined) return { type: "combined", from: parseInt(combined[1]), to: parseInt(combined[2]) };
  const single = name.match(/[Ss]\d{1,2}[Ee](\d{1,3})/i)
    || name.match(/\b[Ee][Pp]?(\d{1,3})\b/)
    || name.match(/\b[Ee]pisode[\s._-]*(\d{1,3})\b/i);
  if (single) return { type: "single", ep: parseInt(single[1]) };
  return null;
}
function extractEpisode(name = "") {
  const info = extractEpisodeInfo(name);
  if (!info) return null;
  return info.type === "combined" ? info.from : info.ep;
}
function extractSeason(name = "") {
  const m = name.match(/[Ss](\d{1,2})[Ee]/i) || name.match(/[Ss]eason[\s._]*(\d{1,2})/i);
  return m ? parseInt(m[1], 10) : null;
}
function isSeries(name = "") {
  return /[Ss]\d{1,2}[Ee]\d{1,3}|\b[Ee]pisode[\s._]?\d|\b[Ee][Pp]\d/i.test(name);
}
function extractLanguage(name = "") {
  name = stripPromotion(name);
  const langs = [
    ["Malayalam", /\bmalayalam\b/i], ["Kannada", /\bkannada\b/i],
    ["Bengali", /\bbengali\b/i], ["Punjabi", /\bpunjabi\b/i],
    ["Telugu", /\btelugu\b/i], ["Tamil", /\btamil\b/i],
    ["English", /\benglish\b/i], ["Hindi", /\bhindi\b/i],
    ["Multi", /\b(multi|multilingual)\b/i], ["Dual", /\b(dual|dubbed)\b/i],
  ];
  for (const [label, rx] of langs) if (rx.test(name)) return label;
  return null;
}
function buildCaption(fileName = "") {
  const title = extractMovieTitle(fileName);
  const season = extractSeason(fileName);
  const epInfo = extractEpisodeInfo(fileName);
  const lang = extractLanguage(fileName);
  const quality = extractQuality(fileName);
  const lines = [title];
  if (epInfo) {
    const seasonStr = season ? `Season ${String(season).padStart(2, "0")}` : null;
    const epStr = epInfo.type === "combined"
      ? `Episodes ${String(epInfo.from).padStart(2, "0")}–${String(epInfo.to).padStart(2, "0")}`
      : `Episode ${String(epInfo.ep).padStart(2, "0")}`;
    lines.push([seasonStr, epStr].filter(Boolean).join(" · "));
  }
  const metaLine = [lang, quality].filter(Boolean).join(" · ");
  if (metaLine) lines.push(metaLine);
  return lines.join("\n");
}

const QUALITY_ORDER = { "2160P": 0, "1080P": 1, "720P": 2, "480P": 3, "360P": 4, "240P": 5 };

// ── Bot API ──────────────────────────────────────────────────────────
async function fetchFiles(query, quality, language, limit = 50, signal) {
  try {
    const params = new URLSearchParams({ q: query || ".", quality, language, limit });
    const res = await fetch(`${API_BASE}/api/search?${params}`, signal ? { signal } : {});
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    let files = data.files || [];
    if (quality && quality !== "All") {
      files = files.filter(f => {
        const q = extractQuality(f.file_name);
        return q && q.toUpperCase() === quality.toUpperCase();
      });
    }
    if (language && language !== "All") {
      files = files.filter(f => {
        const l = extractLanguage(f.file_name);
        return l && l.toLowerCase() === language.toLowerCase();
      });
    }
    return files;
  } catch (e) {
    if (e.name === "AbortError") return null;
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
  } catch { return []; }
}

// ── TMDB Request Queue (throttle to avoid rate limits) ──────────────
const _tmdbQueue = [];
let _tmdbRunning = 0;
const TMDB_CONCURRENCY = 4;
const TMDB_DELAY_MS = 80;

function _tmdbEnqueue(fn) {
  return new Promise((resolve, reject) => {
    _tmdbQueue.push({ fn, resolve, reject });
    _tmdbDrain();
  });
}
async function _tmdbDrain() {
  if (_tmdbRunning >= TMDB_CONCURRENCY || _tmdbQueue.length === 0) return;
  _tmdbRunning++;
  const { fn, resolve, reject } = _tmdbQueue.shift();
  try { resolve(await fn()); } catch (e) { reject(e); }
  finally {
    await new Promise(r => setTimeout(r, TMDB_DELAY_MS));
    _tmdbRunning--;
    _tmdbDrain();
  }
}

async function tmdbGet(endpoint, params = {}) {
  return _tmdbEnqueue(async () => {
    const key = getNextTMDBKey();
    const p = new URLSearchParams({ api_key: key, language: "en-US", ...params });
    try {
      const res = await fetch(`${TMDB_BASE}${endpoint}?${p}`);
      if (res.status === 429) {
        markKeyFailed(key);
        await new Promise(r => setTimeout(r, 1000));
        const key2 = getNextTMDBKey();
        const p2 = new URLSearchParams({ api_key: key2, language: "en-US", ...params });
        const res2 = await fetch(`${TMDB_BASE}${endpoint}?${p2}`);
        if (!res2.ok) return null;
        return await res2.json();
      }
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  });
}

// ── SessionStorage Cache ──────────────────────────────────────────────
const SESSION_CACHE_KEY = "suhani_home_v2";
function saveHomeCache(data) {
  try { sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
}
function loadHomeCache() {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > HOME_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch { return null; }
}

const tmdbCache = new Map();
const tmdbInFlight = new Map();

// ── Poster Cache helpers — backend MongoDB cache ke saath ────────────
async function checkPosterCache(title, year) {
  try {
    const params = new URLSearchParams({ title });
    if (year) params.set("year", year);
    const res = await fetch(`${API_BASE}/api/poster-cache?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.cached ? data.data : null;
  } catch { return null; }
}

async function savePosterCache(title, year, tmdbData) {
  try {
    await fetch(`${API_BASE}/api/poster-cache`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, year, tmdb_data: tmdbData }),
    });
  } catch { /* silently ignore — cache save fail hona critical nahi */ }
}

async function enrichWithTMDB(title, year) {
  const key = `e_${title}_${year}`;
  if (tmdbCache.has(key)) return tmdbCache.get(key);
  if (tmdbInFlight.has(key)) return tmdbInFlight.get(key);

  const promise = (async () => {
    try {
      // ✅ Step 1: Pehle backend MongoDB cache check karo
      const cached = await checkPosterCache(title, year);
      if (cached) {
        if (tmdbCache.size >= TMDB_CACHE_MAX) tmdbCache.delete(tmdbCache.keys().next().value);
        tmdbCache.set(key, cached);
        tmdbInFlight.delete(key);
        return cached;
      }

      // Step 2: Cache miss — TMDB se fetch karo
      const searches = [year ? { query: title, year } : null, { query: title }].filter(Boolean);
      let result = null;
      for (const params of searches) {
        const data = await tmdbGet("/search/multi", { ...params, page: 1 });
        const found = (data?.results || []).find(r => r.poster_path);
        if (found) { result = found; break; }
      }
      if (!result) {
        if (tmdbCache.size >= TMDB_CACHE_MAX) tmdbCache.delete(tmdbCache.keys().next().value);
        tmdbCache.set(key, null);
        tmdbInFlight.delete(key);
        return null;
      }
      const out = {
        id: result.id, tmdbId: result.id,
        title: result.title || result.name || title,
        poster: result.poster_path ? `${TMDB_IMG}${result.poster_path}` : null,
        posterMd: result.poster_path ? `${TMDB_IMG_MD}${result.poster_path}` : null,
        backdrop: result.backdrop_path ? `${TMDB_IMG_ORIG}${result.backdrop_path}` : null,
        rating: result.vote_average ? result.vote_average.toFixed(1) : null,
        year: (result.release_date || result.first_air_date || "").slice(0, 4) || year,
        overview: result.overview || null,
        type: result.media_type === "tv" ? "series" : "movie",
        genreIds: result.genre_ids || [],
      };
      if (tmdbCache.size >= TMDB_CACHE_MAX) tmdbCache.delete(tmdbCache.keys().next().value);
      tmdbCache.set(key, out);
      tmdbInFlight.delete(key);

      // ✅ Step 3: Background mein save karo (await nahi — non-blocking)
      savePosterCache(title, year, out);

      return out;
    } catch {
      tmdbInFlight.delete(key);
      return null;
    }
  })();

  tmdbInFlight.set(key, promise);
  return promise;
}

async function fetchPosterFromTMDB(title, year) {
  try {
    const data = await enrichWithTMDB(title, year);
    if (!data) return null;
    return { poster: data.poster || null, posterMd: data.posterMd || data.poster || null, imdb_rating: data.rating || null, plot: data.overview || null };
  } catch { return null; }
}

async function fetchTrailerKey(tmdbId, type = "movie") {
  try {
    const endpoint = type === "series" ? `/tv/${tmdbId}/videos` : `/movie/${tmdbId}/videos`;
    const data = await tmdbGet(endpoint, { language: "en-US" });
    const videos = data?.results || [];
    const trailer = videos.find(v => v.type === "Trailer" && v.site === "YouTube") || videos.find(v => v.site === "YouTube");
    return trailer?.key || null;
  } catch { return null; }
}

const CATEGORY_LANG_FILTER = {
  hindi: /\bhindi\b/i, tamil: /\btamil\b/i, malayalam: /\bmalayalam\b/i,
  telugu: /\btelugu\b/i, kannada: /\bkannada\b/i, bengali: /\bbengali\b/i,
  english: /\benglish\b/i, series: null,
};
const NON_BOLLYWOOD_PATTERNS = /\b(dubbed|dub|anime|doraemon|dragon\s?ball|naruto|one\s?piece|bleach|detective\s?conan|shin\s?chan|pokemon|hollywood|english|korean|chinese|japanese|kannada|telugu|tamil|malayalam|bengali)\b/i;
const CATEGORY_SEARCH_QUERY = {
  hindi: "hindi", tamil: "tamil", malayalam: "malayalam", telugu: "telugu",
  kannada: "kannada", bengali: "bengali", english: "english", series: null, all: null,
};

async function fetchDBCategory(category, limit = 12, offset = 0) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const searchQuery = CATEGORY_SEARCH_QUERY[category];
    let res;
    if (searchQuery) {
      const pageNum = offset > 0 ? Math.floor(offset / API_FETCH_BATCH) + 1 : 1;
      const params = new URLSearchParams({ q: searchQuery, quality: "All", language: "All", limit: API_FETCH_BATCH, page: pageNum });
      res = await fetch(`${API_BASE}/api/search?${params}`, { signal: controller.signal });
    } else {
      const pageNum = offset > 0 ? Math.floor(offset / API_FETCH_BATCH) + 1 : 1;
      const params = new URLSearchParams({ category, limit: API_FETCH_BATCH, page: pageNum });
      res = await fetch(`${API_BASE}/api/trending?${params}`, { signal: controller.signal });
    }
    clearTimeout(timer);
    if (!res.ok) throw new Error();
    const data = await res.json();
    let files = data.files || [];
    const rawApiCount = files.length;

    const _pMap = { "all": 26, "series": 32, "hindi": 38, "tamil": 44, "malayalam": 50, "telugu": 56, "kannada": 62, "bengali": 68, "english": 74 };
    const _mMap = { "all": "Loading trending...", "series": "Loading series...", "hindi": "Loading Bollywood...", "tamil": "Loading Tamil...", "malayalam": "Loading Malayalam...", "telugu": "Loading Telugu...", "kannada": "Loading Kannada...", "bengali": "Loading Bengali...", "english": "Loading English..." };
    if (_pMap[category]) window.__splashProgress?.(_pMap[category], _mMap[category]);

    if (category === "series") files = files.filter(f => isSeries(f.file_name));

    const langFilter = CATEGORY_LANG_FILTER[category];
    if (langFilter) {
      let filtered = files.filter(f => langFilter.test(f.file_name));
      if (category === "hindi") {
        filtered = filtered.filter(f => !NON_BOLLYWOOD_PATTERNS.test(f.file_name.replace(/\bhindi\b/gi, "")));
        if (filtered.length < files.length * 0.05 && files.length > 0) filtered = files.filter(f => langFilter.test(f.file_name));
      } else {
        if (filtered.length < files.length * 0.1 && files.length > 0) filtered = files.filter(f => langFilter.test(f.file_name));
      }
      files = filtered;
    }

    const seen = new Set();
    const unique = [];
    for (const f of files) {
      const title = extractMovieTitle(f.file_name);
      const key = title.toLowerCase().replace(/\s+/g, "");
      if (key.length > 2 && !seen.has(key)) { seen.add(key); unique.push({ ...f, _title: title, _year: extractYear(f.file_name) }); }
    }

    const sliced = unique.slice(0, limit);
    const enriched = [];
    // FIX: batches of 4 with sequential batching to not overwhelm free server
    for (let i = 0; i < sliced.length; i += 4) {
      const batch = sliced.slice(i, i + 4);
      const results = await Promise.all(batch.map(async f => {
        const tmdb = await enrichWithTMDB(f._title, f._year);
        if (tmdb) return { ...tmdb, _file: f };
        return { id: f.file_id, title: f._title, poster: null, posterMd: null, backdrop: null, rating: null, year: f._year, overview: null, type: "movie", _file: f, genreIds: [] };
      }));
      enriched.push(...results);
    }
    return { items: enriched.filter(Boolean), rawApiCount };
  } catch { return { items: [], rawApiCount: 0 }; }
}

// ── TMDB Discover ─────────────────────────────────────────────────────
const CATEGORY_TMDB_LANG = {
  hindi: "hi", tamil: "ta", malayalam: "ml", telugu: "te",
  kannada: "kn", bengali: "bn", english: "en", series: null, all: null,
};
const TMDB_DISCOVER_CACHE = new Map();

async function fetchTMDBDiscover(category, tmdbPage = 1) {
  const cacheKey = `disc_${category}_${tmdbPage}`;
  if (TMDB_DISCOVER_CACHE.has(cacheKey)) return TMDB_DISCOVER_CACHE.get(cacheKey);
  try {
    const origLang = CATEGORY_TMDB_LANG[category];
    const isTV = category === "series";
    const endpoint = isTV ? "/discover/tv" : "/discover/movie";
    const params = { sort_by: "popularity.desc", page: tmdbPage, "vote_count.gte": 50, ...(origLang ? { with_original_language: origLang } : {}) };
    const data = await tmdbGet(endpoint, params);
    const results = (data?.results || []).filter(r => r.poster_path);
    TMDB_DISCOVER_CACHE.set(cacheKey, results);
    return results;
  } catch { return []; }
}

async function fetchByTMDBTitles(tmdbResults, alreadySeenTitles = new Set()) {
  const candidates = tmdbResults.filter(r => {
    const t = (r.title || r.name || "").toLowerCase().replace(/\s+/g, "");
    return t.length > 1 && !alreadySeenTitles.has(t);
  });
  if (!candidates.length) return [];
  const BATCH = 5;
  const matched = [];
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async (tmdbItem) => {
      const title = tmdbItem.title || tmdbItem.name || "";
      const year = (tmdbItem.release_date || tmdbItem.first_air_date || "").slice(0, 4);
      const titleKey = title.toLowerCase().replace(/\s+/g, "");
      if (alreadySeenTitles.has(titleKey)) return null;
      const files = await fetchFiles(title, "All", "All", 5);
      if (!files || files.length === 0) return null;
      alreadySeenTitles.add(titleKey);
      return {
        id: tmdbItem.id, tmdbId: tmdbItem.id, title,
        poster: tmdbItem.poster_path ? `${TMDB_IMG}${tmdbItem.poster_path}` : null,
        posterMd: tmdbItem.poster_path ? `${TMDB_IMG_MD}${tmdbItem.poster_path}` : null,
        backdrop: tmdbItem.backdrop_path ? `${TMDB_IMG_ORIG}${tmdbItem.backdrop_path}` : null,
        rating: tmdbItem.vote_average ? tmdbItem.vote_average.toFixed(1) : null,
        year, overview: tmdbItem.overview || null,
        type: tmdbItem.first_air_date ? "series" : "movie",
        genreIds: tmdbItem.genre_ids || [],
        _file: files[0],
      };
    }));
    matched.push(...results.filter(Boolean));
  }
  return matched;
}

// ── TMDBCard ──────────────────────────────────────────────────────────
function TMDBCard({ item, onClick, gridMode = false }) {
  const [hov, setHov] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  // FIX: initialise imgSrc from item.poster directly — no re-fetch if already available
  const [imgSrc, setImgSrc] = useState(item.poster || null);
  const [imgFailed, setImgFailed] = useState(false);
  const [inList, setInList] = useState(() => isInWatchlist(item.id));
  const hue = [...(item.title || "")].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const initials = (item.title || "").split(" ").slice(0, 2).map(w => w[0] || "").join("").toUpperCase();

  useEffect(() => {
    setImgLoaded(false);
    setImgFailed(false);
    if (item.poster) {
      setImgSrc(item.poster);
    } else {
      setImgSrc(null);
      let cancelled = false;
      // Staggered delay: saare cards ek saath API hit na karein
      const delay = Math.floor(Math.random() * 600);
      const timer = setTimeout(() => {
        fetchPosterFromTMDB(item.title, item.year).then(data => {
          if (!cancelled && data?.poster) setImgSrc(data.poster);
        });
      }, delay);
      return () => { cancelled = true; clearTimeout(timer); };
    }
  }, [item.poster, item.id, item.title, item.year]);

  const handleImgError = () => {
    if (imgSrc && imgSrc.includes("/w185/")) { setImgSrc(imgSrc.replace("/w185/", "/w92/")); return; }
    setImgFailed(true);
    setImgLoaded(false);
  };

  const handleWatchlist = (e) => {
    e.stopPropagation();
    const added = toggleWatchlist(item);
    setInList(added);
  };

  return (
    <div
      onClick={() => onClick(item)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: gridMode ? "100%" : 120, flexShrink: 0, cursor: "pointer", borderRadius: 16,
        overflow: "hidden", background: "#141414",
        border: `1px solid ${hov ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)"}`,
        transform: hov ? "scale(1.03) translateY(-2px)" : "scale(1)",
        transition: "transform .25s cubic-bezier(.34,1.56,.64,1), border-color .2s, box-shadow .2s",
        boxShadow: hov ? `0 16px 40px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,0.06)` : "0 2px 8px rgba(0,0,0,.3)",
        position: "relative",
      }}
    >
      <div style={{ height: 165, background: "#181818", overflow: "hidden", position: "relative" }}>
        {imgSrc && !imgFailed ? (
          <>
            <div style={{
              position: "absolute", inset: 0,
              background: `linear-gradient(160deg,hsl(${hue},40%,11%),hsl(${(hue + 60) % 360},30%,7%))`,
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: imgLoaded ? 0 : 1, transition: "opacity 0.4s ease",
            }}>
              {!imgLoaded && <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.06)", borderTopColor: `hsl(${hue},70%,50%)`, animation: "spin 0.8s linear infinite" }} />}
            </div>
            <img
              src={imgSrc} alt={item.title} loading="lazy" decoding="async"
              style={{ width: "100%", height: "100%", objectFit: "cover", opacity: imgLoaded ? 1 : 0, transition: "opacity 0.5s ease", display: "block", position: "relative", zIndex: 1 }}
              onLoad={() => setImgLoaded(true)}
              onError={handleImgError}
            />
            {hov && imgLoaded && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(243,156,18,0.9)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(243,156,18,0.5)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{
            width: "100%", height: "100%", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: `linear-gradient(160deg,hsl(${hue},55%,18%),hsl(${(hue + 50) % 360},45%,10%))`,
            fontSize: "24px", fontWeight: "900", color: `hsl(${hue},70%,65%)`, letterSpacing: "2px",
          }}>{initials || "🎬"}</div>
        )}
        {item.rating && item.rating !== "0.0" && (
          <div style={{ position: "absolute", bottom: 7, left: 7, zIndex: 3, background: "rgba(0,0,0,0.82)", borderRadius: 8, padding: "3px 7px", display: "flex", alignItems: "center", gap: 3, backdropFilter: "blur(8px)", border: "1px solid rgba(241,196,15,0.2)" }}>
            <span style={{ fontSize: 9, color: "#f1c40f" }}>★</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#f1c40f" }}>{item.rating}</span>
          </div>
        )}
        {item.type === "series" && (
          <div style={{ position: "absolute", top: 7, right: 7, zIndex: 3, background: "rgba(99,102,241,0.9)", borderRadius: 6, padding: "2px 6px", fontSize: 8, fontWeight: 800, color: "#fff", letterSpacing: 0.5, backdropFilter: "blur(4px)" }}>SERIES</div>
        )}
        <button
          onClick={handleWatchlist}
          style={{
            position: "absolute", top: 7, left: 7, zIndex: 3,
            width: 26, height: 26, borderRadius: "50%",
            background: inList ? "rgba(243,156,18,0.95)" : "rgba(0,0,0,0.7)",
            border: `1px solid ${inList ? "rgba(243,156,18,0.5)" : "rgba(255,255,255,0.15)"}`,
            color: "#fff", cursor: "pointer", fontSize: 13,
            display: "flex", alignItems: "center", justifyContent: "center",
            backdropFilter: "blur(4px)", transition: "all .2s",
            opacity: hov || inList ? 1 : 0,
          }}
        >
          {inList ? "✓" : "+"}
        </button>
      </div>
      <div style={{ padding: "10px 10px 12px" }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: "#d4d4d4", lineHeight: 1.4, marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {item.title}
        </div>
        {item.year && <span style={{ fontSize: 10, color: "#555", fontWeight: 500 }}>{item.year}</span>}
      </div>
    </div>
  );
}

// ── Hero Banner Carousel ───────────────────────────────────────────────
function HeroBannerCarousel({ items, onClick }) {
  const [current, setCurrent] = useState(0);
  const [bgLoaded, setBgLoaded] = useState(false);
  const intervalRef = useRef(null);
  const touchStartX = useRef(null);
  const itemsLen = items.length;

  const startTimer = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCurrent(c => (c + 1) % itemsLen);
      setBgLoaded(false);
    }, HERO_AUTOPLAY_MS);
  }, [itemsLen]);

  useEffect(() => {
    if (!itemsLen) return;
    startTimer();
    return () => clearInterval(intervalRef.current);
  }, [itemsLen, startTimer]);

  const goTo = (i) => { setCurrent(i); setBgLoaded(false); startTimer(); };
  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) goTo(diff > 0 ? (current + 1) % itemsLen : (current - 1 + itemsLen) % itemsLen);
    touchStartX.current = null;
  };

  if (!items.length) return null;
  const item = items[current];
  const hue = [...(item.title || "")].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const bgSrc = item.backdrop || item.poster;

  // FIX: Preload next image to avoid visible lag on banner transition
  const nextItem = items[(current + 1) % itemsLen];
  const nextSrc = nextItem?.backdrop || nextItem?.poster;

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      style={{ margin: "0 0 28px", position: "relative", height: 240, cursor: "pointer", overflow: "hidden" }}>
      {/* Hidden preload for next banner image */}
      {nextSrc && <img src={nextSrc} alt="" style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />}
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg,hsl(${hue},35%,10%),hsl(${(hue + 60) % 360},25%,6%))`, transition: "background 0.5s" }} />
      {bgSrc && (
        <img key={bgSrc} src={bgSrc} alt={item.title} loading="lazy"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", opacity: bgLoaded ? 0.55 : 0, transition: "opacity 0.7s ease" }}
          onLoad={() => setBgLoaded(true)} onError={() => setBgLoaded(false)} />
      )}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right,rgba(0,0,0,.95) 30%,rgba(0,0,0,.2))" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,.98) 0%,transparent 55%)" }} />

      <div onClick={() => onClick(item)} style={{ position: "absolute", bottom: 0, left: 0, right: "20%", padding: "20px 18px" }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: "#f39c12", letterSpacing: "3px", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 20, height: 2, background: "linear-gradient(90deg,#f39c12,#e74c3c)", display: "inline-block", borderRadius: 2 }} />
          FEATURED TODAY
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", lineHeight: 1.15, marginBottom: 8, textShadow: "0 2px 12px rgba(0,0,0,.8)", letterSpacing: "-0.3px" }}>
          {item.title}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          {item.rating && item.rating !== "0.0" && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(241,196,15,0.1)", borderRadius: 8, padding: "3px 10px", border: "1px solid rgba(241,196,15,0.25)" }}>
              <span style={{ fontSize: 11, color: "#f1c40f" }}>★</span>
              <span style={{ fontSize: 12, color: "#f1c40f", fontWeight: 800 }}>{item.rating}</span>
            </span>
          )}
          {item.year && <span style={{ fontSize: 12, color: "#666", fontWeight: 500 }}>{item.year}</span>}
          {item.type === "series" && <span style={{ fontSize: 10, color: "#a78bfa", fontWeight: 700, background: "rgba(167,139,250,0.1)", padding: "3px 8px", borderRadius: 6, border: "1px solid rgba(167,139,250,0.2)" }}>SERIES</span>}
        </div>
        {/* FIX: overview color #888 instead of #555 — more readable */}
        {item.overview && (
          <p style={{ fontSize: 11, color: "#888", lineHeight: 1.6, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {item.overview}
          </p>
        )}
      </div>

      <div onClick={() => onClick(item)} style={{ position: "absolute", right: 18, bottom: 20, width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg,#f39c12,#e74c3c)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 24px rgba(243,156,18,.5)", cursor: "pointer" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
      </div>

      <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 5 }}>
        {items.map((_, i) => (
          <button key={i} onClick={() => goTo(i)} style={{ width: i === current ? 18 : 6, height: 6, borderRadius: 3, background: i === current ? "#f39c12" : "rgba(255,255,255,0.25)", border: "none", cursor: "pointer", padding: 0, transition: "all .3s" }} />
        ))}
      </div>
    </div>
  );
}

// ── Poster Component ───────────────────────────────────────────────────
function Poster({ file, seriesTitle = null, size = "card" }) {
  const [imgSrc, setImgSrc] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [rating, setRating] = useState(null);
  const title = seriesTitle || extractMovieTitle(file.file_name);
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
            <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.05)", borderTopColor: `hsl(${hue},60%,50%)`, animation: "spin 0.8s linear infinite" }} />
          </div>
        )}
        <img src={imgSrc} alt={title} loading="lazy" decoding="async"
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit", opacity: imgLoaded ? 1 : 0, transition: "opacity 0.4s ease", display: "block" }}
          onLoad={() => setImgLoaded(true)}
          onError={() => { setImgFailed(true); setImgLoaded(false); }}
        />
        {rating && rating !== "N/A" && rating !== "0.0" && imgLoaded && (
          <div style={{ position: "absolute", bottom: 5, left: 5, background: "rgba(0,0,0,.85)", borderRadius: 6, padding: "2px 6px", display: "flex", alignItems: "center", gap: 3, backdropFilter: "blur(6px)", border: "1px solid rgba(241,196,15,0.15)" }}>
            <span style={{ fontSize: 8, color: "#f1c40f" }}>★</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#f1c40f" }}>{rating}</span>
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

// ── File Card ──────────────────────────────────────────────────────────
function FileCard({ file, onClick, seriesTitle = null }) {
  const [hov, setHov] = useState(false);
  const q = extractQuality(file.file_name);
  const year = extractYear(file.file_name);
  const name = cleanFileName(file.file_name);

  return (
    <div onClick={() => onClick(file)} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", gap: 14, padding: "14px 16px",
        background: hov ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
        borderRadius: 18, cursor: "pointer",
        border: `1px solid ${hov ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)"}`,
        transition: "all .2s cubic-bezier(.34,1.56,.64,1)",
        transform: hov ? "translateX(4px)" : "translateX(0)",
        boxShadow: hov ? "0 8px 24px rgba(0,0,0,0.4)" : "none",
      }}>
      <div style={{ width: 68, height: 92, flexShrink: 0, borderRadius: 12, overflow: "hidden", boxShadow: "0 6px 18px rgba(0,0,0,.55)" }}>
        <Poster file={file} seriesTitle={seriesTitle} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#e8e8e8", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{name}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {q && (<span style={{ padding: "3px 9px", borderRadius: 7, fontSize: 10, fontWeight: 800, background: qualityBg(q), color: "#fff", letterSpacing: 0.3 }}>{q}</span>)}
          {year && <span style={{ padding: "3px 9px", borderRadius: 7, fontSize: 10, fontWeight: 500, background: "rgba(255,255,255,0.05)", color: "#777", border: "1px solid rgba(255,255,255,0.06)" }}>{year}</span>}
        </div>
        {file.file_size > 0 && <span style={{ fontSize: 11, color: "#444", fontWeight: 500 }}>💾 {formatSize(file.file_size)}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", color: hov ? "#f39c12" : "#2a2a2a", paddingRight: 2, transition: "color .2s", fontSize: 18 }}>›</div>
    </div>
  );
}

// ── Quality Row ────────────────────────────────────────────────────────
function QualityRow({ file, quality, lang, isLast, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", padding: "11px 16px",
        borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.04)",
        background: hov ? "rgba(255,255,255,0.04)" : "transparent",
        cursor: "pointer", transition: "background .15s", gap: 8,
      }}>
      {quality && (<span style={{ padding: "3px 10px", borderRadius: 7, fontSize: 10, fontWeight: 800, background: qualityBg(quality), color: "#fff", flexShrink: 0, letterSpacing: 0.3 }}>{quality}</span>)}
      {lang && (<span style={{ padding: "3px 10px", borderRadius: 7, fontSize: 10, fontWeight: 600, background: "rgba(255,255,255,0.05)", color: "#777", border: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>{lang}</span>)}
      {file.file_size > 0 && (<span style={{ fontSize: 10.5, color: "#444" }}>💾 {formatSize(file.file_size)}</span>)}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, color: "#f39c12", fontWeight: 600, opacity: hov ? 1 : 0, transition: "opacity .15s" }}>Download</span>
        <span style={{ color: hov ? "#f39c12" : "#2a2a2a", fontSize: 16, transition: "color .15s" }}>›</span>
      </div>
    </div>
  );
}

// ── groupFilesForDisplay ──────────────────────────────────────────────
function groupFilesForDisplay(files, activeQuality) {
  if (!files.length) return { type: "movie", items: [] };
  const seriesFiles = files.filter(f => isSeries(f.file_name));
  if (seriesFiles.length === 0) {
    const filtered = activeQuality !== "All"
      ? files.filter(f => extractQuality(f.file_name)?.toUpperCase() === activeQuality.toUpperCase())
      : files;
    const sorted = [...(filtered.length ? filtered : files)].sort((a, b) => {
      const qa = QUALITY_ORDER[extractQuality(a.file_name) || ""] ?? 99;
      const qb = QUALITY_ORDER[extractQuality(b.file_name) || ""] ?? 99;
      return qa - qb;
    });
    return { type: "movie", items: sorted };
  }

  const seriesTitle = extractMovieTitle(seriesFiles[0].file_name);
  const seasonMap = {};
  for (const f of seriesFiles) {
    const s = extractSeason(f.file_name) ?? 1;
    if (!seasonMap[s]) seasonMap[s] = {};
    const epInfo = extractEpisodeInfo(f.file_name);
    let epFrom, epTo, isCombined;
    if (!epInfo) { epFrom = 99999; epTo = 99999; isCombined = false; }
    else if (epInfo.type === "combined") { epFrom = epInfo.from; epTo = epInfo.to; isCombined = true; }
    else { epFrom = epInfo.ep; epTo = epInfo.ep; isCombined = false; }
    const epKey = isCombined ? `c_${epFrom}_${epTo}` : `e_${epFrom}`;
    if (!seasonMap[s][epKey]) seasonMap[s][epKey] = { epFrom, epTo, isCombined, files: [] };
    const existing = seasonMap[s][epKey].files.findIndex(
      x => (extractQuality(x.file_name) || "UNKNOWN") === (extractQuality(f.file_name) || "UNKNOWN")
    );
    if (existing !== -1) {
      if ((f.file_size || 0) > (seasonMap[s][epKey].files[existing].file_size || 0)) seasonMap[s][epKey].files[existing] = f;
    } else {
      seasonMap[s][epKey].files.push(f);
    }
  }

  const seasons = Object.entries(seasonMap)
    .map(([s, epMap]) => ({
      season: parseInt(s),
      epGroups: Object.entries(epMap)
        .map(([key, data]) => ({ key, ...data }))
        .sort((a, b) => {
          if (a.isCombined && !b.isCombined) return -1;
          if (!a.isCombined && b.isCombined) return 1;
          return a.epFrom - b.epFrom;
        }),
    }))
    .sort((a, b) => a.season - b.season);

  return { type: "series", seriesTitle, seasons };
}

// ── EpisodeQualityRow ─────────────────────────────────────────────────
function EpisodeQualityRow({ epFrom, epTo, isCombined, files, seriesTitle, season, onFileClick }) {
  const sorted = [...files].sort((a, b) => {
    const qa = QUALITY_ORDER[extractQuality(a.file_name) || ""] ?? 99;
    const qb = QUALITY_ORDER[extractQuality(b.file_name) || ""] ?? 99;
    return qa - qb;
  });
  const bestFile = sorted[0];
  const epLabel = isCombined
    ? `Episodes ${String(epFrom).padStart(2, "0")}–${String(epTo).padStart(2, "0")}`
    : epFrom === 99999 ? "Episode ??" : `Episode ${String(epFrom).padStart(2, "0")}`;

  return (
    <div style={{ background: "rgba(255,255,255,0.025)", borderRadius: 18, border: `1px solid ${isCombined ? "rgba(46,204,113,0.15)" : "rgba(255,255,255,0.06)"}`, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 14, padding: "14px 16px 12px" }}>
        <div style={{ width: 56, height: 76, flexShrink: 0, borderRadius: 10, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,.5)" }}>
          <Poster file={bestFile} seriesTitle={seriesTitle} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {isCombined && (<span style={{ fontSize: 8, fontWeight: 900, color: "#fff", background: "linear-gradient(135deg,#27ae60,#1e8449)", borderRadius: 5, padding: "2px 8px", letterSpacing: 0.5 }}>COMPLETE PACK</span>)}
            {season && (<span style={{ fontSize: 8, fontWeight: 800, color: "#fff", background: "linear-gradient(135deg,#6366f1,#4f46e5)", borderRadius: 5, padding: "2px 8px", letterSpacing: 0.5 }}>S{String(season).padStart(2, "0")}</span>)}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: isCombined ? "#2ecc71" : "#f39c12", letterSpacing: 0.3 }}>{epLabel}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#999", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{seriesTitle}</div>
        </div>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        {sorted.map((f, idx) => (
          <QualityRow key={f.file_id} file={f} quality={extractQuality(f.file_name)} lang={extractLanguage(f.file_name)} isLast={idx === sorted.length - 1} onClick={() => onFileClick(f)} />
        ))}
      </div>
    </div>
  );
}

// ── TMDB Category Row ─────────────────────────────────────────────────
function TMDBCategoryRow({ title, items, onItemClick, onSeeAll }) {
  if (!items || !items.length) return null;
  const icons = {
    "NOW PLAYING": "🎬", "GLOBAL TRENDING": "🌍", "TRENDING SERIES": "📺",
    "BOLLYWOOD": "🎭", "TAMIL MOVIES": "🌟", "MALAYALAM MOVIES": "🌴",
    "TELUGU MOVIES": "🎪", "KANNADA MOVIES": "🏔️", "BENGALI MOVIES": "🌊",
    "ENGLISH MOVIES": "🎥", "TOP RATED ALL TIME": "🏆",
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>{icons[title] || "🎬"}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#e8e8e8", letterSpacing: "0.5px" }}>{title}</span>
        </div>
        {onSeeAll && (<button onClick={onSeeAll} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#f39c12", fontWeight: 600, padding: "4px 0" }}>See all ›</button>)}
      </div>
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingLeft: 16, paddingRight: 16, paddingBottom: 6, scrollbarWidth: "none" }}>
          {items.map(item => (<TMDBCard key={item.id} item={item} onClick={onItemClick} />))}
        </div>
        <div style={{ position: "absolute", top: 0, right: 0, bottom: 6, width: 48, background: "linear-gradient(to right, transparent, #0a0a0a)", pointerEvents: "none" }} />
      </div>
    </div>
  );
}

// ── Offline Banner ────────────────────────────────────────────────────
// FIX: New component — shows when user loses internet connection
function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  if (!offline) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, zIndex: 9999, background: "#e74c3c", color: "#fff", fontSize: 12, fontWeight: 700, textAlign: "center", padding: "8px 16px", letterSpacing: 0.5 }}>
      📡 Internet nahi hai — offline mode
    </div>
  );
}

// ── Trailer Modal ─────────────────────────────────────────────────────
function TrailerModal({ trailerKey, onClose }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.95)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(20px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, padding: "0 16px" }}>
        <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 16, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,.9)" }}>
          <iframe
            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0`}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
            allow="autoplay; encrypted-media" allowFullScreen title="Trailer"
          />
        </div>
        <button onClick={onClose} style={{ display: "block", margin: "16px auto 0", padding: "10px 28px", borderRadius: 50, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#aaa", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          ✕ Close
        </button>
      </div>
    </div>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────
function DetailModal({ file, onClose }) {
  const [posterData, setPosterData] = useState(null);
  const [bgLoaded, setBgLoaded] = useState(false);
  const [toast, setToast] = useState(null);
  const [trailerKey, setTrailerKey] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [inList, setInList] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const isSer = isSeries(file.file_name);
  const q = extractQuality(file.file_name);
  const year = extractYear(file.file_name);
  const name = cleanFileName(file.file_name);
  const serTitle = isSer ? extractMovieTitle(file.file_name) : null;
  const title = serTitle || extractMovieTitle(file.file_name);
  const link = tgLink(file.file_id);
  const hue = [...title].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

  useEffect(() => {
    let cancelled = false;
    fetchPosterFromTMDB(title, year).then(data => { if (!cancelled && data) setPosterData(data); });
    return () => { cancelled = true; };
  }, [title, year]);

  useEffect(() => {
    let cancelled = false;
    enrichWithTMDB(title, year).then(tmdb => { if (!cancelled && tmdb?.id) setInList(isInWatchlist(tmdb.id)); });
    return () => { cancelled = true; };
  }, [title, year]);

  const handleWatchlist = async () => {
    const tmdb = await enrichWithTMDB(title, year);
    if (!tmdb) { showToast("ℹ️ TMDB data nahi mila"); return; }
    const added = toggleWatchlist(tmdb);
    setInList(added);
    showToast(added ? "✅ My List mein add hua!" : "🗑️ My List se remove hua");
  };

  const handleTrailer = async () => {
    if (trailerKey) { setShowTrailer(true); return; }
    setTrailerLoading(true);
    const tmdb = await enrichWithTMDB(title, year);
    if (tmdb?.tmdbId) {
      const key = await fetchTrailerKey(tmdb.tmdbId, tmdb.type);
      if (key) { setTrailerKey(key); setShowTrailer(true); }
      else showToast("❌ Trailer nahi mila");
    } else {
      showToast("❌ Trailer nahi mila");
    }
    setTrailerLoading(false);
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: name, url: link }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(link)
        .then(() => showToast("✅ Link copied!"))
        .catch(() => showToast("❌ Copy failed"));
    }
  };

  const heroSrc = posterData?.posterMd || posterData?.poster || null;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.9)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(16px)" }}>
        <div onClick={e => e.stopPropagation()}
          style={{ background: "#111", borderRadius: "28px 28px 0 0", width: "100%", maxWidth: 480, overflow: "hidden", animation: "slideUp .35s cubic-bezier(.32,1.4,.6,1)", maxHeight: "93vh", overflowY: "auto", border: "1px solid rgba(255,255,255,0.06)", borderBottom: "none" }}>
          <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.12)" }} />
          </div>

          <div style={{ position: "relative", height: 290, background: `linear-gradient(135deg,hsl(${hue},35%,10%),hsl(${(hue + 60) % 360},25%,7%))` }}>
            {heroSrc ? (
              <img src={heroSrc} alt={title}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", opacity: bgLoaded ? 1 : 0, transition: "opacity 0.6s ease" }}
                onLoad={() => setBgLoaded(true)} onError={() => setBgLoaded(false)} />
            ) : (
              <div style={{ position: "absolute", inset: 0 }}><Poster file={file} seriesTitle={serTitle} size="banner" /></div>
            )}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,rgba(0,0,0,0.1) 0%,rgba(17,17,17,1) 100%)" }} />
            <button onClick={onClose}
              style={{ position: "absolute", top: 16, right: 16, width: 38, height: 38, borderRadius: "50%", background: "rgba(0,0,0,.75)", border: "1px solid rgba(255,255,255,0.1)", color: "#aaa", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)" }}>✕</button>
            <button onClick={handleTrailer}
              style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", padding: "8px 20px", borderRadius: 50, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, backdropFilter: "blur(8px)", transition: "all .2s" }}>
              {trailerLoading
                ? <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.8s linear infinite" }} />
                : <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
              }
              Watch Trailer
            </button>
          </div>

          <div style={{ padding: "4px 20px 40px" }}>
            {(() => {
              const lines = buildCaption(file.file_name).split("\n");
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", lineHeight: 1.2, marginBottom: 6, letterSpacing: "-0.3px" }}>{lines[0]}</div>
                  {lines[1] && <div style={{ fontSize: 12, fontWeight: 700, color: "#6366f1", letterSpacing: 0.5, marginBottom: 3 }}>{lines[1]}</div>}
                  {lines[2] && <div style={{ fontSize: 11, fontWeight: 600, color: "#666", letterSpacing: 0.5 }}>{lines[2]}</div>}
                </div>
              );
            })()}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
              {q && <span style={{ padding: "5px 13px", borderRadius: 9, fontSize: 11, fontWeight: 800, background: qualityBg(q), color: "#fff" }}>{q}</span>}
              {year && <span style={{ padding: "5px 13px", borderRadius: 9, fontSize: 11, background: "rgba(255,255,255,0.05)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }}>{year}</span>}
              {file.file_size > 0 && <span style={{ padding: "5px 13px", borderRadius: 9, fontSize: 11, background: "rgba(255,255,255,0.05)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }}>💾 {formatSize(file.file_size)}</span>}
              {posterData?.imdb_rating && posterData.imdb_rating !== "N/A" && posterData.imdb_rating !== "0.0" && (
                <span style={{ padding: "5px 13px", borderRadius: 9, fontSize: 11, fontWeight: 800, background: "rgba(241,196,15,0.08)", color: "#f1c40f", border: "1px solid rgba(241,196,15,0.2)" }}>★ {posterData.imdb_rating}</span>
              )}
            </div>

            {posterData?.plot && (
              <p style={{ fontSize: 13, color: "#555", lineHeight: 1.75, marginBottom: 22, padding: "14px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.04)" }}>
                {posterData.plot}
              </p>
            )}

            <button onClick={handleWatchlist}
              style={{ width: "100%", padding: "13px 0", borderRadius: 14, background: inList ? "rgba(243,156,18,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${inList ? "rgba(243,156,18,0.3)" : "rgba(255,255,255,0.08)"}`, color: inList ? "#f39c12" : "#888", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 10, transition: "all .2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {inList ? "✓ My List mein Hai" : "+ My List mein Add Karo"}
            </button>

            <div style={{ display: "flex", gap: 10 }}>
              <a href={link} target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, padding: "16px 0", borderRadius: 18, background: "linear-gradient(135deg,#f39c12,#e74c3c)", color: "#fff", fontSize: 14, fontWeight: 800, textAlign: "center", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 6px 28px rgba(243,156,18,.35)", letterSpacing: 0.3 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-2.03 9.571c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.893.65z" />
                </svg>
                Open in Telegram
              </a>
              <button onClick={handleShare}
                style={{ width: 56, height: 56, borderRadius: 18, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#777", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {toast && (
          <div style={{ position: "fixed", bottom: 100, left: "50%", transform: "translateX(-50%)", background: "#1e1e1e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "11px 20px", fontSize: 13, fontWeight: 600, color: "#eee", zIndex: 2000, whiteSpace: "nowrap", animation: "toastIn 0.25s ease", boxShadow: "0 8px 28px rgba(0,0,0,0.7)" }}>
            {toast}
          </div>
        )}
      </div>

      {showTrailer && trailerKey && <TrailerModal trailerKey={trailerKey} onClose={() => setShowTrailer(false)} />}
    </>
  );
}

// ── Filter Pill ────────────────────────────────────────────────────────
function FilterRow({ label, items, active, onSelect, accent }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#444", letterSpacing: "1.5px", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" }}>
        {items.map(item => {
          const on = active === item;
          return (
            <button key={item} onClick={() => onSelect(item)} style={{
              padding: "7px 16px", borderRadius: 50, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", transition: "all .18s",
              background: on ? (accent ? "linear-gradient(135deg,#f39c12,#e74c3c)" : "rgba(255,255,255,0.9)") : "rgba(255,255,255,0.04)",
              color: on ? (accent ? "#fff" : "#111") : "#555",
              boxShadow: on && accent ? "0 4px 16px rgba(243,156,18,.35)" : "none",
              transform: on ? "scale(1.05)" : "scale(1)",
              border: on ? "none" : "1px solid rgba(255,255,255,0.06)",
            }}>{item}</button>
          );
        })}
      </div>
    </div>
  );
}

// ── Skeleton Loaders ──────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{ width: 120, flexShrink: 0, borderRadius: 16, overflow: "hidden", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
      <div style={{ height: 165, background: "rgba(255,255,255,0.03)", animation: "pulse 1.8s ease infinite" }} />
      <div style={{ padding: "10px 10px 14px" }}>
        <div style={{ height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 5, marginBottom: 6, animation: "pulse 1.8s ease infinite" }} />
        <div style={{ height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 5, width: "60%", animation: "pulse 1.8s ease infinite" }} />
      </div>
    </div>
  );
}
function SkeletonFile() {
  return (
    <div style={{ display: "flex", gap: 14, padding: "14px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 18, border: "1px solid rgba(255,255,255,0.04)" }}>
      <div style={{ width: 68, height: 92, borderRadius: 12, background: "rgba(255,255,255,0.04)", flexShrink: 0, animation: "pulse 1.8s ease infinite" }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: 13, background: "rgba(255,255,255,0.04)", borderRadius: 6, marginBottom: 8, animation: "pulse 1.8s ease infinite" }} />
        <div style={{ height: 13, background: "rgba(255,255,255,0.04)", borderRadius: 6, width: "75%", marginBottom: 10, animation: "pulse 1.8s ease infinite" }} />
        <div style={{ height: 20, background: "rgba(255,255,255,0.04)", borderRadius: 6, width: "35%", animation: "pulse 1.8s ease infinite" }} />
      </div>
    </div>
  );
}

// ── Category Full Page ────────────────────────────────────────────────
function CategoryPage({ title, category, initialItems, onBack, onItemClick }) {
  const [items, setItems] = useState(initialItems || []);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoading, setInitialLoading] = useState(false);
  const sentinelRef = useRef(null);
  const pageRef = useRef(1);
  const dbPageRef = useRef(1);
  const seenTitlesRef = useRef(new Set());
  const seenIdsRef = useRef(new Set());
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);

  useEffect(() => {
    if (!category) return;
    setInitialLoading(true);
    setHasMore(true);
    hasMoreRef.current = true;
    pageRef.current = 1;
    dbPageRef.current = 1;
    seenTitlesRef.current = new Set();
    seenIdsRef.current = new Set();

    fetchDBCategory(category, PAGE_SIZE, 0).then(({ items: fresh, rawApiCount }) => {
      fresh.forEach(x => {
        seenIdsRef.current.add(String(x.id));
        seenTitlesRef.current.add((x.title || "").toLowerCase().replace(/\s+/g, ""));
      });
      setItems(fresh);
      const more = rawApiCount >= API_FETCH_BATCH || fresh.length >= 8;
      setHasMore(more);
      hasMoreRef.current = more;
      setInitialLoading(false);
    });
  }, [category]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current || !category) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      pageRef.current += 1;
      const tmdbResults = await fetchTMDBDiscover(category, pageRef.current);
      let newCards = [];
      if (tmdbResults.length > 0) newCards = await fetchByTMDBTitles(tmdbResults, seenTitlesRef.current);

      if (newCards.length === 0) {
        dbPageRef.current += 1;
        const nextOffset = (dbPageRef.current - 1) * API_FETCH_BATCH;
        const { items: dbItems, rawApiCount } = await fetchDBCategory(category, PAGE_SIZE, nextOffset);
        const fresh = dbItems.filter(x => !seenIdsRef.current.has(String(x.id)));
        fresh.forEach(x => {
          seenIdsRef.current.add(String(x.id));
          seenTitlesRef.current.add((x.title || "").toLowerCase().replace(/\s+/g, ""));
        });
        newCards = fresh;
        if (rawApiCount < API_FETCH_BATCH && newCards.length === 0) {
          setHasMore(false); hasMoreRef.current = false;
          loadingMoreRef.current = false; setLoadingMore(false);
          return;
        }
      }

      if (newCards.length > 0) {
        const deduped = newCards.filter(x => !seenIdsRef.current.has(String(x.id)));
        deduped.forEach(x => {
          seenIdsRef.current.add(String(x.id));
          seenTitlesRef.current.add((x.title || "").toLowerCase().replace(/\s+/g, ""));
        });
        if (deduped.length > 0) setItems(prev => [...prev, ...deduped]);
      }

      const more = pageRef.current < 20;
      setHasMore(more);
      hasMoreRef.current = more;
    } catch {
      setHasMore(false);
      hasMoreRef.current = false;
    }

    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [category]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadMore();
    }, { rootMargin: INTERSECT_ROOT_MARGIN });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [loadMore]);

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 56, zIndex: 50, background: "rgba(10,10,10,0.96)", backdropFilter: "blur(14px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "50%", width: 34, height: 34, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
        </button>
        <span style={{ fontSize: 15, fontWeight: 900, color: "#e8e8e8", letterSpacing: 0.5 }}>{title}</span>
        {initialLoading
          ? <div style={{ marginLeft: "auto", width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(243,156,18,0.3)", borderTopColor: "#f39c12", animation: "spin 0.8s linear infinite" }} />
          : <span style={{ marginLeft: "auto", fontSize: 11, color: "#444" }}>{items.length} titles</span>
        }
      </div>

      {initialLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, padding: "14px 12px" }}>
          {[...Array(12)].map((_, i) => (
            <div key={i} style={{ borderRadius: 16, overflow: "hidden", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ height: 155, background: "rgba(255,255,255,0.03)", animation: "pulse 1.8s ease infinite" }} />
              <div style={{ padding: "8px 10px 12px" }}>
                <div style={{ height: 9, background: "rgba(255,255,255,0.04)", borderRadius: 4, marginBottom: 5, animation: "pulse 1.8s ease infinite" }} />
                <div style={{ height: 9, background: "rgba(255,255,255,0.04)", borderRadius: 4, width: "55%", animation: "pulse 1.8s ease infinite" }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, padding: "14px 12px" }}>
          {items.map((item, i) => (
            <div key={`${item.id}-${i}`} style={{ animation: `fadeIn .2s ease ${Math.min(i % PAGE_SIZE, 8) * 0.04}s both` }}>
              <TMDBCard item={item} onClick={onItemClick} gridMode />
            </div>
          ))}
        </div>
      )}

      <div ref={sentinelRef} style={{ height: 1 }} />

      {loadingMore && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, padding: "20px 0" }}>
          <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid rgba(243,156,18,0.2)", borderTopColor: "#f39c12", animation: "spin 0.8s linear infinite" }} />
          <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>Aur dhundh raha hai...</span>
        </div>
      )}

      {hasMore && !loadingMore && !initialLoading && items.length > 0 && (
        <div style={{ display: "flex", justifyContent: "center", padding: "16px 0 8px" }}>
          <button onClick={loadMore}
            style={{ padding: "13px 36px", borderRadius: 50, background: "linear-gradient(135deg,#f39c12,#e74c3c)", border: "none", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", letterSpacing: 0.5, boxShadow: "0 6px 20px rgba(243,156,18,0.35)", display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
            Load More
          </button>
        </div>
      )}

      {!hasMore && !loadingMore && items.length > 0 && (
        <div style={{ textAlign: "center", padding: "20px 0 10px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 1, background: "rgba(255,255,255,0.06)" }} />
            <span style={{ fontSize: 11, color: "#2a2a2a", fontWeight: 600 }}>Sab dekh liya! 🎬</span>
            <div style={{ width: 30, height: 1, background: "rgba(255,255,255,0.06)" }} />
          </div>
        </div>
      )}
      {!initialLoading && items.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🎬</div>
          <div style={{ fontSize: 14, color: "#555" }}>Koi content nahi mila</div>
        </div>
      )}
    </div>
  );
}

// ── Watchlist Tab ─────────────────────────────────────────────────────
function WatchlistTab({ onItemClick }) {
  // FIX: listen to storage events so list updates when changed from other tabs/modals
  const [items, setItems] = useState(() => getWatchlist());

  useEffect(() => {
    const refresh = () => setItems(getWatchlist());
    window.addEventListener("storage", refresh);
    // Also refresh when tab becomes visible (user switches back)
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const remove = (id) => {
    const item = items.find(x => String(x.id) === String(id));
    if (item) toggleWatchlist(item);
    setItems(getWatchlist());
  };

  if (items.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>📋</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#ccc", marginBottom: 8 }}>My List Khali Hai</div>
        <div style={{ fontSize: 13, color: "#444", lineHeight: 1.6 }}>
          Kisi bhi movie ya series ke card pe<br />"+" button press karo add karne ke liye
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 12px 80px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {items.map((item, i) => (
          <div key={item.id} style={{ position: "relative", animation: `fadeIn .2s ease ${i * 0.04}s both` }}>
            <TMDBCard item={item} onClick={onItemClick} gridMode />
            <button onClick={() => remove(item.id)}
              style={{ position: "absolute", top: 7, right: 7, width: 22, height: 22, borderRadius: "50%", background: "rgba(231,76,60,0.9)", border: "none", color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Voice Search ──────────────────────────────────────────────────────
const HINDI_TO_ROMAN = {
  "पुष्पा": "pushpa", "पठान": "pathaan", "जवान": "jawan", "दंगल": "dangal",
  "बाहुबली": "bahubali", "केजीएफ": "kgf", "आरआरआर": "rrr", "शाहरुख": "shahrukh",
  "सलमान": "salman", "आमिर": "aamir", "रणबीर": "ranbir", "दीपिका": "deepika",
  "कटरीना": "katrina", "प्रियंका": "priyanka", "अक्षय": "akshay", "अजय": "ajay",
  "विक्की": "vicky", "रोहित": "rohit", "जुग जुग जियो": "jug jugg jeeyo",
  "ब्रह्मास्त्र": "brahmastra", "गदर": "gadar", "भूल भुलैया": "bhool bhulaiyaa",
  "स्त्री": "stree", "एनिमल": "animal", "टाइगर": "tiger", "वॉर": "war",
  "क्रिक": "crick", "फिल्म": "film", "मूवी": "movie", "सीरीज": "series",
  "हिंदी": "hindi", "तमिल": "tamil", "तेलुगु": "telugu", "बंगाली": "bengali",
};

async function translateHindiToEnglish(text) {
  const lower = text.toLowerCase().trim();
  for (const [hi, en] of Object.entries(HINDI_TO_ROMAN)) {
    if (lower === hi.toLowerCase()) return en;
  }
  let result = text;
  for (const [hi, en] of Object.entries(HINDI_TO_ROMAN)) {
    result = result.replace(new RegExp(hi, "gi"), en);
  }
  if (/[\u0900-\u097F]/.test(result)) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=hi&tl=en&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      const data = await res.json();
      const translated = data?.[0]?.map(x => x?.[0]).filter(Boolean).join("") || result;
      return translated.trim();
    } catch { return result; }
  }
  return result.trim();
}

// FIX: accepts activeLanguage param — voice recognition locale now dynamic
function useVoiceSearch(onResult, activeLanguage = "All") {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  const start = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("Voice search is not supported in this browser"); return; }
    const r = new SpeechRecognition();
    // FIX: dynamic language based on selected language filter
    r.lang = LANG_TO_SPEECH_LOCALE[activeLanguage] || "hi-IN";
    r.interimResults = false;
    r.maxAlternatives = 3;
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.onresult = async (e) => {
      const alternatives = Array.from(e.results[0]).map(a => a.transcript);
      const englishAlt = alternatives.find(t => !/[\u0900-\u097F]/.test(t));
      const raw = englishAlt || alternatives[0];
      const translated = await translateHindiToEnglish(raw);
      onResult(translated);
    };
    r.onerror = () => setListening(false);
    recognitionRef.current = r;
    r.start();
  }, [onResult, activeLanguage]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return { listening, start, stop };
}

// ── Bottom Navigation ─────────────────────────────────────────────────
function BottomNav({ tab, setTab }) {
  const tabs = [
    {
      id: "home", label: "Home",
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "#f39c12" : "none"} stroke={active ? "#f39c12" : "#555"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
        </svg>),
    },
    {
      id: "search", label: "Search",
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#f39c12" : "#555"} strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>),
    },
    {
      id: "mylist", label: "My List",
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "#f39c12" : "none"} stroke={active ? "#f39c12" : "#555"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>),
    },
  ];

  return (
    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, zIndex: 200, background: "rgba(10,10,10,0.97)", borderTop: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(24px)", display: "flex", justifyContent: "space-around", padding: "10px 0 16px" }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)}
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "4px 20px", transition: "transform .2s", transform: tab === t.id ? "translateY(-1px)" : "none" }}>
          {t.icon(tab === t.id)}
          <span style={{ fontSize: 10, fontWeight: 700, color: tab === t.id ? "#f39c12" : "#444", letterSpacing: 0.3 }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────
function App() {
  const [tab, setTab] = useState("home");
  const [query, setQuery] = useState("");
  const [quality, setQuality] = useState("All");
  const [language, setLanguage] = useState("All");
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [focused, setFocused] = useState(false);
  const [categoryPage, setCategoryPage] = useState(null);

  const [homeData, setHomeData] = useState({
    nowPlaying: [], globalTrend: [], seriesTrend: [],
    bollywood: [], tamilFils: [], malayalamFils: [],
    teluguFils: [], kannadaFils: [], bengaliFils: [],
    englishFils: [], topRated: [], heroBannerItems: [],
  });
  const [homeLoading, setHomeLoading] = useState(true);
  const [homeSecondaryLoading, setHomeSecondaryLoading] = useState(false);
  const [serverWaking, setServerWaking] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const inputRef = useRef(null);
  const searchAbortRef = useRef(null);

  // ── Home load — 2-phase: primary fast, secondary in bg ────────────
  useEffect(() => {
    const cached = loadHomeCache();
    if (cached && retryKey === 0) {
      setHomeData(cached);
      setHomeLoading(false);
      window.__hideSplash?.();
      return;
    }

    setHomeLoading(true);
    setServerWaking(false);
    setLoadError(false);

    const wakingTimer = setTimeout(() => setServerWaking(true), SERVER_WAKING_DELAY_MS);
    const errorTimer = setTimeout(() => {
      setHomeLoading(false);
      setLoadError(true);
      setServerWaking(false);
      window.__hideSplash?.();
    }, SERVER_TIMEOUT_MS);

    window.__splashProgress?.(20, "Connecting to server...");

    fetchDBCategory("all", 50).then(({ items: latest }) => {
      clearTimeout(wakingTimer);
      window.__splashProgress?.(40, "Loading trending...");

      const bannerItems = latest.filter(m => m.backdrop).slice(0, 5);
      if (bannerItems.length < 3) bannerItems.push(...latest.slice(0, 5 - bannerItems.length));

      setHomeData(prev => ({ ...prev, nowPlaying: latest, heroBannerItems: bannerItems }));
      setHomeLoading(false);
      setServerWaking(false);
      window.__hideSplash?.();

      // Phase 2: FIX — sequential batches of 3 to reduce free-server overload
      setHomeSecondaryLoading(true);
      (async () => {
        try {
          const [series, bolly, tamil] = await Promise.all([
            fetchDBCategory("series", 50),
            fetchDBCategory("hindi", 50),
            fetchDBCategory("tamil", 50),
          ]);
          const [mal, telugu, kannada] = await Promise.all([
            fetchDBCategory("malayalam", 50),
            fetchDBCategory("telugu", 50),
            fetchDBCategory("kannada", 50),
          ]);
          const [bengali, english, topRatedRaw] = await Promise.all([
            fetchDBCategory("bengali", 50),
            fetchDBCategory("english", 50),
            fetchDBCategory("all", 50, API_FETCH_BATCH),
          ]);

          clearTimeout(errorTimer);
          window.__splashProgress?.(95, "Almost ready!");

          const globalItems = latest
            .filter((_, idx) => idx >= 3)
            .concat(bolly.items.slice(0, 3))
            .filter((item, idx, arr) => {
              const key = item.title?.toLowerCase().replace(/\s+/g, "");
              return arr.findIndex(x => x.title?.toLowerCase().replace(/\s+/g, "") === key) === idx;
            })
            .slice(0, 50);

          const topRated = topRatedRaw.items.filter(x => parseFloat(x.rating) >= 7.0).slice(0, 50);

          const newHomeData = {
            nowPlaying: latest, globalTrend: globalItems,
            seriesTrend: series.items, bollywood: bolly.items,
            tamilFils: tamil.items, malayalamFils: mal.items,
            teluguFils: telugu.items, kannadaFils: kannada.items,
            bengaliFils: bengali.items, englishFils: english.items,
            topRated, heroBannerItems: bannerItems,
          };

          saveHomeCache(newHomeData);
          setHomeData(newHomeData);
          setHomeSecondaryLoading(false);
          setLoadError(false);
        } catch {
          clearTimeout(errorTimer);
          setHomeSecondaryLoading(false);
        }
      })();

    }).catch(() => {
      clearTimeout(wakingTimer);
      clearTimeout(errorTimer);
      setHomeLoading(false);
      setLoadError(true);
      setServerWaking(false);
      window.__hideSplash?.();
    });

    return () => { clearTimeout(wakingTimer); clearTimeout(errorTimer); };
  }, [retryKey]);

  // FIX: Android hardware back button
  useEffect(() => {
    const handlePopState = () => {
      if (selected) { setSelected(null); return; }
      if (categoryPage) { setCategoryPage(null); return; }
      if (tab === "search") { setTab("home"); setQuery(""); setFiles([]); return; }
      if (tab !== "home") { setTab("home"); return; }
    };
    window.addEventListener("popstate", handlePopState);
    window.history.pushState({ page: "app" }, "");
    return () => window.removeEventListener("popstate", handlePopState);
  }, [selected, categoryPage, tab]);

  // FIX: doSearch — properly clears loading on abort
  const doSearch = useCallback(async (q = query, qual = quality, lang = language) => {
    if (!q.trim() && qual === "All" && lang === "All") {
      setFiles([]);
      setLoading(false);
      return;
    }
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setLoading(true);
    setFiles([]);
    const results = await fetchFiles(q, qual, lang, 50, controller.signal);
    if (results !== null) {
      // Search completed (not aborted)
      setFiles(results);
      setLoading(false);
    } else {
      // FIX: aborted — clear loading so UI doesn't stay stuck
      setLoading(false);
    }
  }, [query, quality, language]);

  useEffect(() => {
    if (tab !== "search") return;
    const t = setTimeout(() => doSearch(), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [doSearch, tab]);

  const clearAll = () => {
    setQuery(""); setQuality("All"); setLanguage("All");
    setFiles([]); setLoading(false);
    searchAbortRef.current?.abort();
  };
  const clearFilters = () => { setQuality("All"); setLanguage("All"); };

  // FIX: handleTMDBCardClick — no double fetch, single fetchFiles call
  const handleTMDBCardClick = useCallback((itemOrTitle) => {
    const movieTitle = typeof itemOrTitle === "string" ? itemOrTitle : itemOrTitle.title;
    setQuality("All");
    setLanguage("All");
    setTab("search");
    setFiles([]);
    setQuery(movieTitle);
    setLoading(true);
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    fetchFiles(movieTitle, "All", "All", 50, controller.signal).then(results => {
      if (results !== null) {
        setFiles(results || []);
        setLoading(false);
      } else {
        setLoading(false);
      }
    });
  }, []);

  // FIX: pass language to voice search so locale is dynamic
  const { listening, start: startVoice, stop: stopVoice } = useVoiceSearch((transcript) => {
    setQuery(transcript);
    setTab("search");
    doSearch(transcript, quality, language);
  }, language);

  const trendingChips = homeData.nowPlaying.slice(0, 6);

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'DM Sans',sans-serif", color: "#eee", maxWidth: 480, margin: "0 auto", paddingBottom: 64 }}>

      {/* FIX: Offline banner */}
      <OfflineBanner />

      {/* ── HEADER ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(10,10,10,0.92)", borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "13px 16px", backdropFilter: "blur(20px)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {tab === "search" ? (
            <button onClick={() => { setTab("home"); setQuery(""); setFiles([]); setLoading(false); setCategoryPage(null); searchAbortRef.current?.abort(); }}
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: "#888", padding: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Home</span>
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 26, fontWeight: 900, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 3, lineHeight: 1 }}>
                <span style={{ color: "#f39c12" }}>SUHANI</span><span style={{ color: "#fff", opacity: 0.9 }}> SEARCH</span>
              </span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={listening ? stopVoice : startVoice}
              style={{ width: 36, height: 36, borderRadius: "50%", background: listening ? "rgba(231,76,60,0.2)" : "rgba(255,255,255,0.04)", border: `1px solid ${listening ? "rgba(231,76,60,0.5)" : "rgba(255,255,255,0.08)"}`, color: listening ? "#e74c3c" : "#555", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", animation: listening ? "pulse 1s ease infinite" : "none", transition: "all .2s" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zm-1 18.93A8 8 0 0 1 4 12H2a10 10 0 0 0 9 9.93V24h2v-2.07A10 10 0 0 0 22 12h-2a8 8 0 0 1-7 7.93z" />
              </svg>
            </button>
            {tab === "home" && (
              <button onClick={() => { setTab("search"); setTimeout(() => inputRef.current?.focus(), 150); }}
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 50, padding: "8px 16px", display: "flex", alignItems: "center", gap: 7, cursor: "pointer", color: "#555", fontSize: 12, fontWeight: 500, transition: "all .2s" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                Search movies...
              </button>
            )}
            {tab === "search" && (
              <span style={{ fontSize: 17, fontWeight: 900, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2, color: "#f39c12" }}>SEARCH</span>
            )}
          </div>
        </div>
      </div>

      {/* ── HOME TAB ── */}
      {tab === "home" && !categoryPage && (
        <div style={{ paddingBottom: 36 }}>
          {homeLoading ? (
            <div style={{ padding: "20px 16px" }}>
              {serverWaking && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(243,156,18,0.08)", border: "1px solid rgba(243,156,18,0.2)", borderRadius: 14, padding: "12px 16px", marginBottom: 20 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid rgba(243,156,18,0.3)", borderTopColor: "#f39c12", animation: "spin 0.9s linear infinite", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#f39c12" }}>Server warm ho raha hai...</div>
                    <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>Render free server 30-60 sec leta hai. Thoda wait karo 🙏</div>
                  </div>
                </div>
              )}
              <div style={{ height: 240, borderRadius: 0, background: "rgba(255,255,255,0.03)", marginBottom: 32, animation: "pulse 1.8s ease infinite" }} />
              {[1, 2, 3].map(i => (
                <div key={i} style={{ marginBottom: 32 }}>
                  <div style={{ height: 14, width: 150, borderRadius: 6, background: "rgba(255,255,255,0.04)", marginBottom: 14, animation: "pulse 1.8s ease infinite" }} />
                  <div style={{ display: "flex", gap: 10, overflowX: "hidden" }}>
                    {[1, 2, 3].map(j => <SkeletonCard key={j} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div style={{ textAlign: "center", padding: "80px 24px" }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🔌</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#ccc", marginBottom: 8 }}>Server se connect nahi hua</div>
              <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6, marginBottom: 28 }}>
                Bot server temporarily down lag raha hai.<br />Thodi der baad try karo ya search use karo.
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <button onClick={() => { setLoadError(false); setHomeLoading(true); setRetryKey(k => k + 1); }}
                  style={{ padding: "12px 28px", borderRadius: 50, background: "linear-gradient(135deg,#f39c12,#e74c3c)", border: "none", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  🔄 Retry
                </button>
                <button onClick={() => { setTab("search"); setTimeout(() => inputRef.current?.focus(), 150); }}
                  style={{ padding: "12px 28px", borderRadius: 50, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#aaa", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  🔍 Search karo
                </button>
              </div>
            </div>
          ) : (
            <>
              {homeData.heroBannerItems.length > 0 && (
                <HeroBannerCarousel items={homeData.heroBannerItems} onClick={handleTMDBCardClick} />
              )}
              <TMDBCategoryRow title="NOW PLAYING" items={homeData.nowPlaying} onItemClick={handleTMDBCardClick} onSeeAll={() => setCategoryPage({ title: "NOW PLAYING", category: "all", items: homeData.nowPlaying })} />

              {homeSecondaryLoading && homeData.globalTrend.length === 0 ? (
                [1, 2].map(i => (
                  <div key={i} style={{ marginBottom: 32, paddingLeft: 16 }}>
                    <div style={{ height: 14, width: 160, borderRadius: 6, background: "rgba(255,255,255,0.04)", marginBottom: 14, animation: "pulse 1.8s ease infinite" }} />
                    <div style={{ display: "flex", gap: 10 }}>
                      {[1, 2, 3].map(j => <SkeletonCard key={j} />)}
                    </div>
                  </div>
                ))
              ) : (
                <>
                  <TMDBCategoryRow title="GLOBAL TRENDING" items={homeData.globalTrend} onItemClick={handleTMDBCardClick} onSeeAll={() => setCategoryPage({ title: "GLOBAL TRENDING", category: "all", items: homeData.globalTrend })} />
                  <TMDBCategoryRow title="TRENDING SERIES" items={homeData.seriesTrend} onItemClick={handleTMDBCardClick} onSeeAll={() => setCategoryPage({ title: "TRENDING SERIES", category: "series", items: homeData.seriesTrend })} />
                  <TMDBCategoryRow title="BOLLYWOOD" items={homeData.bollywood} onItemClick={handleTMDBCardClick} onSeeAll={() => setCategoryPage({ title: "BOLLYWOOD", category: "hindi", items: homeData.bollywood })} />
                  <TMDBCategoryRow title="TAMIL MOVIES" items={homeData.tamilFils} onItemClick={handleTMDBCardClick} onSeeAll={() => setCategoryPage({ title: "TAMIL MOVIES", category: "tamil", items: homeData.tamilFils })} />
                  <TMDBCategoryRow title="MALAYALAM MOVIES" items={homeData.malayalamFils} onItemClick={handleTMDBCardClick} onSeeAll={() => setCategoryPage({ title: "MALAYALAM MOVIES", category: "malayalam", items: homeData.malayalamFils })} />
                  <TMDBCategoryRow title="TELUGU MOVIES" items={homeData.teluguFils} onItemClick={handleTMDBCardClick} onSeeAll={() => setCategoryPage({ title: "TELUGU MOVIES", category: "telugu", items: homeData.teluguFils })} />
                  <TMDBCategoryRow title="KANNADA MOVIES" items={homeData.kannadaFils} onItemClick={handleTMDBCardClick} onSeeAll={() => setCategoryPage({ title: "KANNADA MOVIES", category: "kannada", items: homeData.kannadaFils })} />
                  <TMDBCategoryRow title="BENGALI MOVIES" items={homeData.bengaliFils} onItemClick={handleTMDBCardClick} onSeeAll={() => setCategoryPage({ title: "BENGALI MOVIES", category: "bengali", items: homeData.bengaliFils })} />
                  <TMDBCategoryRow title="ENGLISH MOVIES" items={homeData.englishFils} onItemClick={handleTMDBCardClick} onSeeAll={() => setCategoryPage({ title: "ENGLISH MOVIES", category: "english", items: homeData.englishFils })} />
                  <TMDBCategoryRow title="TOP RATED ALL TIME" items={homeData.topRated} onItemClick={handleTMDBCardClick} onSeeAll={() => setCategoryPage({ title: "TOP RATED ALL TIME", category: "all", items: homeData.topRated })} />
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── CATEGORY PAGE ── */}
      {tab === "home" && categoryPage && (
        <CategoryPage
          title={categoryPage.title}
          category={categoryPage.category}
          initialItems={categoryPage.items}
          onBack={() => setCategoryPage(null)}
          onItemClick={handleTMDBCardClick}
        />
      )}

      {/* ── SEARCH TAB ── */}
      {tab === "search" && (
        <div>
          <div style={{ padding: "18px 16px 0" }}>
            {trendingChips.length > 0 && !query && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#3a3a3a", letterSpacing: "1.5px", marginBottom: 10 }}>TRENDING NOW</div>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 20, scrollbarWidth: "none" }}>
                  {trendingChips.map(item => (
                    <button key={item.id} onClick={() => handleTMDBCardClick(item)}
                      style={{ padding: "7px 14px", borderRadius: 50, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "#666", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "all .2s" }}>
                      <span style={{ fontSize: 10 }}>🔥</span>{item.title}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 22, padding: "14px 16px", border: `1px solid ${focused ? "rgba(243,156,18,0.3)" : "rgba(255,255,255,0.06)"}`, marginBottom: 18, transition: "border-color .2s", boxShadow: focused ? "0 0 0 3px rgba(243,156,18,0.06)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.04)", border: `1px solid ${focused ? "rgba(243,156,18,0.2)" : "rgba(255,255,255,0.07)"}`, borderRadius: 14, padding: "11px 14px", marginBottom: 16, transition: "border-color .2s" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
                  onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                  onKeyDown={e => { if (e.key === "Enter" && tab === "search") doSearch(); }}
                  placeholder="Search movies, series..."
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 14, color: "#eee", fontFamily: "inherit" }} />
                <button onClick={listening ? stopVoice : startVoice}
                  style={{ background: listening ? "rgba(231,76,60,0.15)" : "transparent", border: "none", borderRadius: "50%", width: 28, height: 28, color: listening ? "#e74c3c" : "#555", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zm-1 18.93A8 8 0 0 1 4 12H2a10 10 0 0 0 9 9.93V24h2v-2.07A10 10 0 0 0 22 12h-2a8 8 0 0 1-7 7.93z" />
                  </svg>
                </button>
                {query && (
                  <button onClick={() => { setQuery(""); setFiles([]); setLoading(false); searchAbortRef.current?.abort(); inputRef.current?.focus(); }}
                    style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%", width: 22, height: 22, color: "#666", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                )}
              </div>
              <FilterRow label="QUALITY" items={QUALITIES} active={quality} onSelect={setQuality} accent />
              <FilterRow label="LANGUAGE" items={LANGUAGES} active={language} onSelect={setLanguage} />
            </div>
          </div>

          <div style={{ padding: "0 16px 36px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: "#3a3a3a", fontWeight: 600 }}>
                {loading ? "Searching..." : (query || quality !== "All" || language !== "All") ? (() => {
                  const g = groupFilesForDisplay(files, quality);
                  if (g.type === "series") {
                    const totalEp = g.seasons.reduce((sum, s) => sum + s.epGroups.length, 0);
                    return `${files.length} files · ${totalEp} episode group${totalEp !== 1 ? "s" : ""} found`;
                  }
                  return `${files.length} result${files.length !== 1 ? "s" : ""} found`;
                })() : ""}
              </span>
              {(query || quality !== "All" || language !== "All") && (
                <button onClick={clearAll} style={{ background: "none", border: "none", color: "#e74c3c", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>Clear all</button>
              )}
            </div>

            {loading && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[1, 2, 3, 4].map(i => <SkeletonFile key={i} />)}</div>}

            {!loading && (() => {
              const grouped = groupFilesForDisplay(files, quality);
              if (grouped.type === "series") {
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {grouped.seasons.map((seasonData) => (
                      <div key={seasonData.season}>
                        {grouped.seasons.length > 1 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
                            <span style={{ fontSize: 9, fontWeight: 900, color: "#6366f1", letterSpacing: 2.5, padding: "5px 14px", borderRadius: 50, border: "1px solid rgba(99,102,241,0.2)", background: "rgba(99,102,241,0.08)" }}>
                              SEASON {String(seasonData.season).padStart(2, "0")}
                            </span>
                            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
                          </div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {seasonData.epGroups.map((grp, i) => (
                            <div key={grp.key} style={{ animation: `fadeIn .25s ease ${i * 0.03}s both` }}>
                              <EpisodeQualityRow epFrom={grp.epFrom} epTo={grp.epTo} isCombined={grp.isCombined} files={grp.files} seriesTitle={grouped.seriesTitle} season={seasonData.season} onFileClick={setSelected} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {grouped.items.map((f, i) => (
                    <div key={f.file_id} style={{ animation: `fadeIn .3s ease ${i * 0.04}s both` }}>
                      <FileCard file={f} onClick={setSelected} />
                    </div>
                  ))}
                </div>
              );
            })()}

            {!loading && files.length === 0 && (query || quality !== "All" || language !== "All") && (
              <div style={{ textAlign: "center", padding: "70px 20px" }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>🎬</div>
                <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8, color: "#ccc" }}>No results found</div>
                <div style={{ fontSize: 13, color: "#444", lineHeight: 1.6 }}>Try different keywords or change filters</div>
                <button onClick={clearFilters} style={{ marginTop: 20, padding: "11px 26px", borderRadius: 50, background: "linear-gradient(135deg,#f39c12,#e74c3c)", border: "none", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Reset Filters</button>
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

      {/* ── MY LIST TAB ── */}
      {tab === "mylist" && (
        <div>
          <div style={{ padding: "16px 16px 8px" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#e8e8e8" }}>📋 My List</div>
            <div style={{ fontSize: 12, color: "#444", marginTop: 4 }}>Tumhari saved movies aur series</div>
          </div>
          <WatchlistTab onItemClick={handleTMDBCardClick} />
        </div>
      )}

      {/* ── FOOTER ── */}
      {tab === "home" && !categoryPage && (
        <div style={{ textAlign: "center", padding: "14px 16px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", fontSize: 11, color: "#2a2a2a" }}>
          <p style={{ margin: "0 0 6px", lineHeight: 1.7 }}>All contents are publicly available on Telegram.<br />We do not host any files.</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 16, alignItems: "center" }}>
            <span>© {new Date().getFullYear()} Suhani Search</span>
            <span style={{ color: "#1e1e1e" }}>•</span>
            <a href={`https://t.me/${BOT_USERNAME}`} style={{ color: "#333", textDecoration: "none" }}>Report issue</a>
          </div>
        </div>
      )}

      {/* ── BOTTOM NAV ── */}
      <BottomNav tab={tab} setTab={(t) => {
        setTab(t);
        if (t !== "search") { setCategoryPage(null); searchAbortRef.current?.abort(); }
      }} />

      {selected && <DetailModal file={selected} onClose={() => setSelected(null)} />}

      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { height: 3px; width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        @keyframes pulse { 0%,100%{opacity:.15}50%{opacity:.35} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp { from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1} }
        @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)} }
        input::placeholder { color: #3a3a3a; }
        div::-webkit-scrollbar { display: none; }
        button { font-family: inherit; }
        a { -webkit-tap-highlight-color: transparent; }
        button { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
}

// ── Safe Export with Error Boundary ──────────────────────────────────
const OriginalApp = App;
export default function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <OriginalApp />
    </ErrorBoundary>
  );
}
