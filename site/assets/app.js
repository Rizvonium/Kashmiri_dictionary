/* Kashmiri Dictionary — unified app: dictionary search + Roman/Kashmiri writer + translation + one keyboard.
   By Sajad Kainaat & RGMir. Data: see the "Sources" tab. */
"use strict";

/* ============================================================== utilities */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isTouch = matchMedia("(hover: none)").matches;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 1700); }
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

/* ============================================================== Kashmiri text (same rules as scripts/ks_normalize.py) */
const KS_MAP = { "ك": "ک", "ي": "ی", "ى": "ی", "ه": "ہ", "ۀ": "ۂ",
  "ۭ": "ٟ", "ۆ": "وٚ", "ٳ": "اٟ", "ڐ": "ڈ", "ٿ": "تھ",
  "ڇ": "چھ", "ـ": "", "‏": "", "‎": "", "﻿": "" };
const MARK_RE = /[ً-ْٔ-ٰٟ]/g;            // vowel signs (madda U+0653 kept: آ stays آ)
const ARABIC_RE = /[؀-ۿݐ-ݿﭐ-﻿]/;
const DEVA_RE = /[ऀ-ॿ]/;
function normKs(s) {
  s = String(s || "").replace(/[ﭐ-﷿ﹰ-﻾]/g, c => c.normalize("NFKC"));
  s = s.replace(/ٮ۪/g, "ؠ");
  s = s.replace(/[كيىهۀۭۆٳڐٿڇـ‏‎﻿]/g, c => KS_MAP[c]);
  return s.normalize("NFC").replace(/[ \t]+/g, " ").trim();
}
const bareKs = s => normKs(s).normalize("NFD").replace(MARK_RE, "").normalize("NFC");
const LOOSE = { "ٲ": "ا", "أ": "ا", "إ": "ا", "آ": "ا", "ۄ": "و", "ؤ": "و", "ؠ": "ی", "ێ": "ی", "ۍ": "ی", "ئ": "ی", "ے": "ی", "ۂ": "ہ", "ۃ": "ہ", "ة": "ہ", "ں": "ن", "ٓ": "", "‌": "" };
const looseKs = s => bareKs(s).normalize("NFD").replace(/[ٲأإآۄؤؠێۍئےۂۃةںٓ‌]/g, c => LOOSE[c] ?? c).normalize("NFC");
const LAT = { "ʦ": "ts", "ʰ": "h", "ʸ": "y", "ι": "i", "ͻ": "o", "ɔ": "o", "ə": "a", "ɨ": "i", "ñ": "n", "ŋ": "ng", "ʃ": "sh", "ʒ": "zh", "ʷ": "w", "ʼ": "", "ʻ": "", "'": "", "’": "", ":": "" };
const foldLat = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[ʦʰʸιͻɔəɨñŋʃʒʷʼʻ'’:]/g, c => LAT[c] ?? c).replace(/\s+/g, " ").trim();

/* ---- KoshurSoundex: spelling-tolerant keys for Roman Kashmiri (same as scripts/koshur_search.py) */
function soundKey(word) {
  if (!word) return "";
  let s = word.toLowerCase().trim().replace(/\([^)]*\)/g, "").replace(/\/[^/]*\//g, "");
  if (s.includes("/")) s = s.split("/")[0].trim();
  s = s.replace(/ʦ/g, "ts").replace(/ạ̄|ạ|ä/g, "a").replace(/ɨ̄|ɨ|ι/g, "i").replace(/ɔ̄|ɔ|ͻ|ö/g, "o").replace(/ü/g, "u").replace(/ʰ/g, "h").replace(/ʲ|ʸ/g, "y");
  s = s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+\d+$/, "");
  s = s.replace(/cxh|cx|tsh|tz/g, "ts").replace(/chh/g, "ch").replace(/shh/g, "sh").replace(/kh|q/g, "k").replace(/ph/g, "f")
    .replace(/th/g, "t").replace(/dh/g, "d").replace(/bh/g, "b").replace(/gh/g, "g").replace(/w/g, "v").replace(/['’`:]/g, "");
  s = s.replace(/ae|ea|aa|ai|ay/g, "a").replace(/ee|ii|ey|ei|e/g, "i").replace(/oo|uu|ou|ow|au|aw|oa|o/g, "u");
  return s.replace(/[^a-z0-9]/g, "").replace(/(.)\1+/g, "$1");
}
function rootKey(word) {
  const k = soundKey(word); if (!k) return "";
  return (("aiu".includes(k[0]) ? "V" : k[0]) + k.slice(1).replace(/[aiuy]/g, "")).replace(/(.)\1+/g, "$1");
}
const splitVariants = rom => String(rom || "").toLowerCase().split(/\s*\/\s*|\s+or\s+|\s*[,;]\s*/)
  .map(v => v.replace(/\([^)]*\)/g, "").replace(/\s+\d+$/, "").replace(/[.:]+$/, "").trim()).filter(Boolean);
function toClean26(rom) {
  return String(rom || "").normalize("NFC").replace(/ʦ/g, "ts").replace(/ạ̄/g, "ae").replace(/ā/g, "aa").replace(/ī/g, "ee").replace(/ū/g, "oo")
    .replace(/ē/g, "e").replace(/ō/g, "o").replace(/[ɔͻ]/g, "o").replace(/[ɨι]/g, "u").replace(/ə/g, "a").replace(/ʰ/g, "h").replace(/[ʲʸ]/g, "y")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s-]/g, "").replace(/\s+/g, " ").trim();
}
// Perso-Arabic -> Roman (readable approximation)
const R_DIGRAPHS = [["ژھ", "tsh"], ["چھ", "chh"], ["پھ", "ph"], ["تھ", "th"], ["ٹھ", "ṭh"], ["کھ", "kh"], ["بھ", "bh"], ["دھ", "dh"], ["ڈھ", "ḍh"], ["گھ", "gh"],
  ["یٖ", "ī"], ["وٗ", "ū"], ["یٚ", "e"], ["وٚ", "o"], ["اٟ", "ɨ̄"], ["إ", "ɨ"], ["أ", "ạ"], ["آ", "ā"], ["ٲ", "ạ̄"]];
const R_CHARS = { "ا": "a", "ب": "b", "پ": "p", "ت": "t", "ٹ": "ṭ", "ث": "s", "ج": "j", "چ": "ch", "ح": "h", "خ": "kh", "د": "d", "ڈ": "ḍ", "ذ": "z", "ر": "r",
  "ڑ": "ṛ", "ز": "z", "ژ": "ts", "س": "s", "ش": "sh", "ص": "s", "ض": "z", "ط": "t", "ظ": "z", "ع": "a", "غ": "g", "ف": "f", "ق": "q", "ک": "k", "گ": "g",
  "ل": "l", "م": "m", "ن": "n", "ں": "n", "و": "v", "ۄ": "ɔ", "ہ": "h", "ھ": "h", "ء": "'", "ی": "y", "ے": "ē", "ؠ": "'", "ۍ": "'", "ێ": "e",
  "َ": "a", "ِ": "i", "ُ": "u", "ٔ": "ạ", "ٕ": "ɨ", "ٟ": "ɨ̄", "ٖ": "ī", "ٗ": "ū", "ٚ": "e", "ٛ": "",
  "ٰ": "ā", "ْ": "", "ّ": "", "‌": "", "،": ",", "۔": "." };
function romanize(ks) {
  let s = normKs(ks); for (const [a, b] of R_DIGRAPHS) s = s.split(a).join(b);
  let o = ""; for (const ch of s) o += R_CHARS[ch] ?? ch; return o.replace(/\s+/g, " ").trim();
}
// Roman -> Perso-Arabic by rule (letter by letter)
const NAME_SPELLINGS = { shafi: "شفیع", shauq: "شوق", ali: "علی", mohammad: "محمد", muhammad: "محمد", srinagar: "سرینگر", kashmir: "کشمیر",
  jammu: "جموں", delhi: "دہلی", india: "انڈیا", lal: "لل", ded: "دید", habba: "حبہ", khatoon: "خاتون", mahjoor: "مہجور", nund: "نُنٛد", rishi: "ریشی", sons: "سنز", and: "اینڈ" };
function literalToKs(raw) {
  let s = String(raw || "").toLowerCase().trim();
  if (!s) return ""; if (/^\d+([.,]\d+)?$/.test(s)) return s;
  const rules = [["tsh", "ژھ"], ["cxh", "ژھ"], ["chh", "چھ"], ["sh", "ش"], ["ts", "ژ"], ["cx", "ژ"], ["ch", "چ"], ["kh", "کھ"], ["ph", "پھ"], ["th", "تھ"], ["bh", "بھ"],
    ["dh", "دھ"], ["gh", "گھ"], ["ṭh", "ٹھ"], ["ae", "ٲ"], ["ạ̄", "ٲ"], ["aa", "آ"], ["ā", "آ"], ["ee", "یٖ"], ["ī", "یٖ"], ["oo", "وٗ"], ["ū", "وٗ"], ["oa", "ۄ"], ["ɔ", "ۄ"],
    ["ɨ̄", "ٟ"], ["ɨ", "ٕ"], ["ạ", "ٔ"], ["ṭ", "ٹ"], ["ḍ", "ڈ"], ["ṛ", "ڑ"], ["'", "ؠ"]];
  for (const [k, v] of rules) s = s.split(k).join(v);
  if (/^[aiueo]/.test(s)) s = "ا" + s;
  if (s.length > 1 && s.endsWith("i")) s = s.slice(0, -1) + "ی";
  const ch = { a: "َ", i: "ِ", u: "ُ", e: "ے", o: "و", b: "ب", p: "پ", t: "ت", j: "ج", d: "د", r: "ر", z: "ز", s: "س", f: "ف", q: "ق", k: "ک", g: "گ",
    l: "ل", m: "م", n: "ن", v: "و", w: "و", h: "ہ", y: "ی", c: "چ", x: "ش" };
  let o = ""; for (const c of s) o += ch[c] ?? c; return normKs(o);
}
const escapedToKs = text => text.split(/(\s+)/).map(p => /^\s+$/.test(p) || !p ? p : (NAME_SPELLINGS[p.toLowerCase().replace(/[^a-z]/g, "")] || literalToKs(p))).join("");

/* ============================================================== data */
const QRANK = { "native": 0, "core": 0.5, "user": 0.5, "source-perso-arabic (1932)": 1, "spelling": 1.5, "": 2, "auto-transliterated": 3, "unverified": 4 };
const SRC_LABEL = { modern: "Modern dictionary", hassan: "Hassan · DSAL", grierson: "Grierson 1932", chikhapo: "ChiKhaPo lexicon", other: "Stop-word list", core: "KoshurLex core list", mine: "My word", spelling: "Aksharantar spelling" };
// Frequently used words for the writer (hand-entered; labelled as such)
const CORE = [
  ["کٲشُر", "kạ̄shur / kaeshur / koshur / kashur", "Kashmiri language; a Kashmiri person"], ["ترٛومُت", "trovmut / traavmut", "abandoned, left behind"],
  ["آب", "āb / aab", "water"], ["ژوٗنٛٹھ", "tsūnṭh / cxoont / tsoont", "apple"], ["ژھاے", "tshāy / cxhaay", "shadow, shade"], ["گَگُر", "gagur / gạgɨr / gagir", "mouse, rat"],
  ["کۄہ", "kɔh / koh", "mountain, hill"], ["پؠٹھ", "peth / pyeth / peṭh", "since, from, on"], ["پوش", "posh / poash", "flower, blossom"],
  ["کَنٛگُر", "kangur / kangɨr / kangri", "Kashmiri fire-pot (kangri)"], ["پھیرَن", "pheran / phyaran", "Kashmiri woollen gown (pheran)"], ["کَتھ", "kath", "story, word, talk"],
  ["زَبان", "zabaan / zabān", "language, tongue"], ["مِیٖٹھ", "meeth / mīṭh", "sweet"], ["چُھ", "chhu / chu", "is (masculine)"], ["چھِ", "chhi / chi", "are; is (feminine)"],
  ["چُھس", "chhus / chus", "am (masculine)"], ["یہِ", "yih / yi / yeh", "this, it"], ["مَکان", "makaan / makan / makān", "house, building"], ["بہٕ", "bu / bɨ / ba", "I"],
  ["تہٕ", "te / ta / tɨ", "and"], ["ترٛےٚ", "tre / treh / trē", "three"], ["آزاد", "aazaad / azaad / āzād", "free, independent"], ["اِنسان", "insaan / insān", "human being, people"],
  ["سٲری", "saeri / saeree / sạ̄rī", "all, everyone"], ["لُغَت", "lughat / lugat", "dictionary"], ["پَرُن", "parun", "to read, to study"], ["کھیوٚن", "khyon / khyun", "to eat"],
  ["کِتاب", "kitaab / kitāb", "book"], ["سٕنٛز", "sinz / sɨnz", "of (feminine possessed noun)"], ["دَہ", "dah / daha", "ten"], ["ؤری", "warih / wahar / vạrī", "year"],
  ["ؤریو", "waryo / vạryo", "years (oblique plural)"], ["زامُت", "zaamut / zāmut", "born"],
  ["سُنٛد", "sund / sond / sundu", "of, 's (masculine possessed noun)"], ["ہُنٛد", "hund / hond", "of, 's (masculine possessed noun)"],
  ["ہُنٛز", "hunz / honz", "of, 's (feminine possessed noun)"], ["کٲم", "kaam / kaem / kām / kam", "work, job"], ["کَران", "karaan / karan / karān", "doing"],
  ["کَرُن", "karun / karin", "to do"], ["کیاہ", "kyah / kya / kyaa", "what"], ["اَز", "az / aaz", "today"], ["گَژُھن", "gatshun / gachun / gatsun", "to go"],
  ["یُن", "yun / yiun / yeun", "to come"],
];

const DB = { rows: [], spell: [], byVariant: new Map(), bySound: new Map(), byRoot: new Map(), ready: false, vocab: new Map(), posCount: {} };
function push(map, key, v) { if (!key) return; let a = map.get(key); if (!a) map.set(key, a = []); a.push(v); }

function makeEntry(o) {
  const e = Object.assign({ ks: "", rom: "", rv: "", deva: "", pos: "", gender: "", gloss: "", def: "", hindi: "", exEn: "", exKs: "", exKsR: "", audio: "", src: "", grp: "modern", ref: "", q: "", scheme: "" }, o);
  e.ks = e.ks ? normKs(e.ks) : "";
  e.bare = e.ks ? bareKs(e.ks) : ""; e.loose = e.ks ? looseKs(e.ks) : "";
  e.romAuto = false;
  if (!e.rom && e.ks) { e.rom = romanize(e.ks); e.romAuto = true; }
  e.variants = [...new Set(splitVariants(e.rom).concat(splitVariants(e.rv)))];
  e.vSound = e.variants.map(soundKey); e.vRoot = e.variants.map(rootKey);
  e.romF = e.variants.map(foldLat);
  e.glossF = (e.gloss || "").toLowerCase();
  e.glossWords = e.glossF.split(/[;,]\s*/).map(s => s.replace(/^(to|a|an|the)\s+/, "").trim());
  e.rank = QRANK[e.q] ?? 2;
  e.meaning = e.gloss || (e.def ? (e.def.length > 220 ? e.def.slice(0, 220) + "…" : e.def) : "");
  return e;
}
function indexEntry(e) {
  e.variants.forEach(v => push(DB.byVariant, v, e));
  new Set(e.vSound).forEach(k => push(DB.bySound, k, e));
  new Set(e.vRoot).forEach(k => k.length >= 3 && push(DB.byRoot, k, e));
}
function addRow(o, front) {
  const e = makeEntry(o); e.i = DB.rows.length;
  front ? DB.rows.unshift(e) : DB.rows.push(e);
  indexEntry(e);
  if (e.pos) DB.posCount[e.pos] = (DB.posCount[e.pos] || 0) + 1;
  return e;
}

async function fetchJSON(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const total = +res.headers.get("content-length") || 0;
  if (!res.body || !total || !onProgress) return res.json();
  const reader = res.body.getReader(); const chunks = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress(got / total); }
  const buf = new Uint8Array(got); let o = 0; chunks.forEach(c => { buf.set(c, o); o += c.length; });
  return JSON.parse(new TextDecoder().decode(buf));
}

async function loadData() {
  const d = await fetchJSON("data/dictionary.json", p => { const b = $("barFill"); if (b) b.style.width = Math.round(p * 100) + "%"; });
  const F = Object.fromEntries(d.fields.map((f, i) => [f, i]));
  for (const r of d.rows) {
    const src = d.sources[r[F.source]];
    const grp = src.startsWith("grierson") ? "grierson" : src.startsWith("hassan") ? "hassan" : src.startsWith("chikhapo") ? "chikhapo" : src.startsWith("injilashah") ? "other" : src.startsWith("user") ? "upload" : "modern";
    addRow({ ks: r[F.headword_ks], rom: r[F.headword_roman], rv: r[F.roman_variants] || "", scheme: d.schemes[r[F.roman_scheme]], deva: r[F.headword_deva],
      pos: r[F.pos], gender: r[F.gender], gloss: r[F.gloss_en], def: r[F.definition_en], hindi: r[F.hindi_gloss], exEn: r[F.example_en], exKs: r[F.example_ks],
      exKsR: r[F.example_ks_roman], audio: r[F.audio_url] ? r[F.audio_url].replace(/^@h\//, "https://dsal.uchicago.edu/dictionaries/hassan/audio/") : "",
      src, grp, ref: r[F.source_ref], q: d.quality[r[F.script_quality]] });
  }
  CORE.forEach(([ks, rom, gloss]) => addRow({ ks, rom, gloss, grp: "core", src: "KoshurLex core list", q: "core" }));
  store.get("ksd-mine", []).forEach(m => addRow({ ks: m.ks, rom: m.rom, gloss: m.mean, grp: "mine", src: "My words", q: "user" }));
  // English vocabulary for "did you mean"
  DB.rows.forEach(r => { if (r.grp !== "grierson") r.glossF.split(/[^a-z]+/).forEach(w => { if (w.length > 2) DB.vocab.set(w, (DB.vocab.get(w) || 0) + 1); }); });
  fetchJSON("data/english_words.json").then(list => { list.forEach(w => ENG.add(w)); if (W.ready) updateWriter(); }).catch(() => {});
  // Spelling-only pairs (Aksharantar) — used by the writer, and as extra spellings; loaded after the dictionary is usable
  fetchJSON("data/roman_pairs.json").then(pairs => {
    for (const [ks, roms] of pairs) {
      const e = makeEntry({ ks, rom: roms.replace(/;\s*/g, " / "), grp: "spelling", src: "Aksharantar (spelling only)", q: "spelling" });
      DB.spell.push(e); indexEntry(e);
    }
    if (W.ready) updateWriter();
  }).catch(() => {});
  DB.ready = true;
}

/* ============================================================== DICTIONARY SEARCH */
const S = { mode: "auto", field: "any", src: "", pos: "", audio: false, dia: false, page: 0, hits: [], browseAll: false };
const PAGE = 40;
const detect = q => ARABIC_RE.test(q) ? "ks" : DEVA_RE.test(q) ? "deva" : "lat";
function matcher(n, mode) {
  if (mode === "exact") return h => h === n ? 3 : 0;
  if (mode === "start") return h => h === n ? 3 : h.startsWith(n) ? 2 : 0;
  return h => h === n ? 3 : h.startsWith(n) ? 2 : h.includes(n) ? 1 : 0;
}
const activeFilters = () => !!(S.src || S.pos || S.audio || S.field !== "any");
function search() {
  const raw = $("q").value.trim();
  const { field, mode, src, pos, audio, dia } = S;
  let pool = DB.rows;
  if (src) pool = pool.filter(r => src === "mine" ? r.grp === "mine" : src === "modern" ? (r.grp === "modern" || r.grp === "core" || r.grp === "upload") : r.grp === src);
  if (pos) pool = pool.filter(r => r.pos === pos);
  if (audio) pool = pool.filter(r => r.audio);
  if (!raw) return pool.map(r => ({ r, s: 0, why: "" }));
  const hits = new Map();
  const add = (r, s, why) => { const p = hits.get(r); if (!p || p.s < s) hits.set(r, { r, s, why }); };
  const script = detect(raw);
  if (script === "ks") {
    const n = dia ? normKs(raw) : bareKs(raw), l = looseKs(raw), m = matcher(n, mode === "auto" ? "contains" : mode), ml = matcher(l, mode === "auto" ? "contains" : mode);
    for (const r of pool) {
      if (field === "any" || field === "ks") {
        if (r.ks) { let s = m(dia ? r.ks : r.bare) * 10; if (!s && !dia) s = ml(r.loose) * 8; if (s) add(r, s, ""); }
        if (r.exKs && mode === "contains" && bareKs(r.exKs).includes(n)) add(r, 1, "in example");
      }
      if ((field === "def" || (field === "any" && (mode === "auto" || mode === "contains"))) && r.def && r.def.includes(normKs(raw))) add(r, 1, "in definition");
    }
  } else if (script === "deva") {
    const n = raw.normalize("NFC"), m = matcher(n, mode === "auto" ? "contains" : mode);
    for (const r of pool) {
      if (field !== "any" && field !== "hi") continue;
      let s = Math.max(0, ...r.deva.split(/[,،]\s*/).map(x => m(x.trim()))) * 10;
      if (!s && r.hindi) s = Math.max(0, ...r.hindi.split(/;\s*/).map(m)) * 5;
      if (s) add(r, s, "");
    }
  } else {
    const nl = raw.toLowerCase(), nf = foldLat(raw);
    const wordRe = new RegExp(`(^|[^a-z])${escRe(nl)}([^a-z]|$)`);
    const inPool = pool === DB.rows ? null : new Set(pool);
    for (const r of pool) {
      if (field === "any" || field === "en") {
        if (mode === "auto") { if (r.glossWords.includes(nl)) add(r, 30, ""); else if (wordRe.test(r.glossF)) add(r, 20, ""); else if (r.glossF.includes(nl)) add(r, 6, ""); }
        else { const s = Math.max(0, ...r.glossWords.map(matcher(nl, mode))) * 10; if (s) add(r, s, ""); }
      }
      if ((field === "any" || field === "roman") && r.romF.length) {
        const m = matcher(nf, mode === "auto" ? "start" : mode);
        const s = Math.max(0, ...r.romF.map(m)) * 10 + (mode === "auto" && r.romF.includes(nf) ? 5 : 0);
        if (s) add(r, s, "");
      }
      if ((field === "def" || (field === "any" && mode === "auto")) && r.def && nl.length > 2 && wordRe.test(r.def.toLowerCase())) add(r, field === "def" ? 5 : 2, "in definition");
      else if (field === "def" && r.def && r.def.toLowerCase().includes(nl)) add(r, 1, "in definition");
    }
    // any-spelling tiers (sound key / consonant root) — the KoshurLex engine
    if ((field === "any" || field === "roman") && (mode === "auto" || mode === "contains") && nl.length >= 3 && /^[a-z' ]+$/.test(nl)) {
      const sk = soundKey(nl), rk = rootKey(nl);
      (DB.bySound.get(sk) || []).forEach(r => (!inPool || inPool.has(r)) && r.grp !== "spelling" && add(r, 24, `sounds like “${raw}”`));
      if (rk.length >= 3) (DB.byRoot.get(rk) || []).forEach(r => (!inPool || inPool.has(r)) && r.grp !== "spelling" && add(r, 14, `similar spelling`));
    }
  }
  const out = [...hits.values()];
  out.forEach(h => { if (h.r.q === "unverified") h.s -= 7; });
  out.sort((a, b) => b.s - a.s || a.r.rank - b.r.rank || (a.r.ks || a.r.rom).length - (b.r.ks || b.r.rom).length || a.r.i - b.r.i);
  return out;
}

function hl(text, raw) {
  const safe = esc(text);
  if (!raw || ARABIC_RE.test(raw) || raw.length < 2) return safe;
  try { return safe.replace(new RegExp(`(${escRe(esc(raw))})`, "gi"), "<mark>$1</mark>"); } catch (e) { return safe; }
}
const QLABEL = {
  "source-perso-arabic (1932)": ["1932 spelling", "Perso-Arabic as printed by Grierson in 1932 (Persian style, without Kashmiri vowel signs)"],
  "auto-transliterated": ["auto script", "Perso-Arabic generated by machine from the romanization; trust the Roman spelling and the audio"],
  "unverified": ["unverified", "Automatically compiled word list; spelling and meaning not checked by an editor"],
  "core": ["core list", "Hand-entered common word used by the writer"], "user": ["my word", "Added by you in this browser"],
};
function entryCard(h, raw) {
  const r = h.r;
  const el = document.createElement("article"); el.className = "card entry";
  const P = [];
  P.push(`<div class="entry-top"><div class="hw">`);
  if (r.ks) P.push(`<span class="ks" lang="ks" title="Look this word up">${esc(r.ks)}</span>`);
  if (r.rom && !r.romAuto) P.push(`<span class="rom${r.ks ? "" : " big"}">${hl(r.rom, raw)}</span>`);
  if (r.deva) P.push(`<span class="sub" lang="ks-Deva">${esc(r.deva)}</span>`);
  if (r.rv) P.push(`<span class="sub" title="Everyday Roman spellings (AI4Bharat Aksharantar)">also typed: ${hl(r.rv.replace(/;\s*/g, " · "), raw)}</span>`);
  P.push(`</div><div class="actions">`);
  if (r.audio) P.push(`<button class="act" data-audio="${esc(r.audio)}" title="Play pronunciation" aria-label="Play pronunciation"><svg class="ic"><use href="#i-volume"/></svg></button>`);
  if (r.ks) P.push(`<button class="act" data-write="${esc(r.variants[0] || r.ks)}" title="Use in Write and translate" aria-label="Use in Write and translate"><svg class="ic"><use href="#i-pen"/></svg></button>`);
  P.push(`<button class="act" data-copy="${esc(r.ks || r.rom || r.deva)}" title="Copy" aria-label="Copy"><svg class="ic"><use href="#i-copy"/></svg></button>`);
  P.push(`</div></div><div class="meta">`);
  if (r.pos) P.push(`<span class="badge pos">${esc(r.pos)}</span>`);
  if (r.gender) P.push(`<span class="badge">${esc({ m: "masculine", f: "feminine", "c.g.": "common gender", "m/f": "m / f" }[r.gender] || r.gender)}</span>`);
  const ql = QLABEL[r.q]; if (ql) P.push(`<span class="badge ${r.q === "core" || r.q === "user" ? "note" : "warn"}" title="${esc(ql[1])}">${ql[0]}</span>`);
  if (h.why) P.push(`<span class="badge note">${esc(h.why)}</span>`);
  P.push(`</div>`);
  if (r.gloss) P.push(`<p class="gloss">${hl(r.gloss, raw)}</p>`);
  if (r.hindi) P.push(`<p class="hindi">हिन्दी: ${esc(r.hindi)}</p>`);
  if (r.exKs || r.exEn || r.exKsR) {
    P.push(`<div class="ex">`);
    if (r.exKs) P.push(`<span class="ks" lang="ks">${esc(r.exKs)}</span>`);
    if (r.exKsR) P.push(`<i>${esc(r.exKsR)}</i><br>`);
    if (r.exEn) P.push(hl(r.exEn, raw));
    P.push(`</div>`);
  }
  if (r.def) {
    const long = r.def.length > 320;
    P.push(`<p class="def${long ? " clamp" : ""}">${hl(r.def.replace(/ ¶ /g, "\n"), raw)}</p>`);
    if (long) P.push(`<button class="more" data-more>Read the full entry</button>`);
  }
  P.push(`<div class="foot">${SRC_LABEL[r.grp] || esc(r.src)}${r.grp === "grierson" && r.ref ? " · " + esc(r.ref.replace("Grierson 1932 ", "")) : ""}${r.scheme ? " · romanization: " + esc(r.scheme) : ""}</div>`);
  el.innerHTML = P.join("");
  return el;
}

const ALPHABET = ["ا", "آ", "أ", "ٲ", "ب", "پ", "ت", "ٹ", "ث", "ج", "چ", "ح", "خ", "د", "ڈ", "ذ", "ر", "ڑ", "ز", "ژ", "س", "ش", "ص", "ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ک", "گ", "ل", "م", "ن", "و", "ۄ", "ہ", "ھ", "ی", "ؠ", "ے"];
const EXAMPLES = [["water"], ["mother"], ["آب", "ks"], ["کاشر", "ks", "no vowel signs"], ["tsoont", "", "any spelling"], ["koshur"], ["पानी"], ["ʦūr", "", "Grierson"]];
const LEAF = cls => `<svg class="${cls}" aria-hidden="true"><use href="#chinar"/></svg>`;
const fmt = n => n.toLocaleString("en-US");
function renderWelcome() {
  $("panes").hidden = true; $("welcome").hidden = false;
  const natives = DB.rows.filter(r => r.q === "native" && r.exEn && r.gloss);
  const w = natives.length ? natives[(Math.floor(Date.now() / 864e5) * 2654435761 >>> 0) % natives.length] : null;
  const nKs = DB.rows.filter(r => r.ks).length, nAudio = DB.rows.filter(r => r.audio).length;
  $("welcome").innerHTML = `<div class="welcome-grid">
    <div class="card stat"><div class="label">Entries</div><div class="fig">${fmt(DB.rows.length)}</div><div class="sub">from five dictionaries and word lists</div></div>
    <div class="card stat"><div class="label">In Kashmiri script</div><div class="fig">${fmt(nKs)}</div><div class="sub">one Unicode convention</div></div>
    <div class="card stat"><div class="label">Spoken by a native speaker</div><div class="fig">${fmt(nAudio)}</div><div class="sub">Hassan pronouncing dictionary</div></div>
    <div class="card stat"><div class="label">Everyday Roman spellings</div><div class="fig">${fmt(DB.spell.length || 38887)}</div><div class="sub">so koshur finds کٲشُر</div></div>
    <div class="card hero">${LEAF("hero-leaf")}
      <h2>Look up Kashmiri the way you type it</h2>
      <p>English, Kashmiri script, Hindi, or Roman Kashmiri in any spelling. Whole sentences go to <a href="#write">Write and translate</a>.</p>
      <div class="demo" aria-label="Example: a Roman sentence written in Kashmiri script">
        <div class="demo-bar">${LEAF("leaf-mini")}Write and translate</div>
        <div class="demo-row"><span class="demo-k">You type</span><span class="demo-roman" id="demoRoman"></span></div>
        <div class="demo-row"><span class="demo-k">Kashmiri</span><span class="demo-ks" id="demoKs" lang="ks"></span></div>
        <div class="demo-row"><span class="demo-k">Meaning</span><span class="demo-en" id="demoEn"></span></div>
      </div>
      <div class="chips">${EXAMPLES.map(([q, k, n]) => `<button class="chip" data-q="${esc(q)}">${k ? `<span class="ks" lang="ks">${esc(q)}</span>` : esc(q)}${n ? `<small>${esc(n)}</small>` : ""}</button>`).join("")}</div>
    </div>
    <div class="card wotd"><div class="section-label">${LEAF("leaf-mini")}Word of the day</div><div id="wotd"></div></div>
    <div class="card tips">
      <div><h3>Any spelling</h3><p>koshur, kaeshur and kạ̄shur find the same word. Kashmiri script works with or without vowel signs.</p></div>
      <div><h3>No Kashmiri keyboard needed</h3><p>Press the keyboard button or <kbd>Ctrl</kbd> <kbd>K</kbd>. It follows the box you are in and stays closed once you close it.</p></div>
      <div><h3>Everything, in order</h3><p><button class="chip" data-browseall>Browse all ${fmt(DB.rows.length)} entries</button></p></div>
    </div></div>`;
  if (w) $("wotd").appendChild(entryCard({ r: w, why: "" }, ""));
  startDemo();
}
function rowHtml(h, i, raw) {
  const r = h.r;
  const src = { grierson: "Grierson", hassan: "Hassan", chikhapo: "ChiKhaPo", modern: "modern", core: "core", mine: "mine", upload: "added", other: "list" }[r.grp] || "";
  const gloss = r.gloss || (r.def ? r.def.slice(0, 140) : "");
  return `<div class="row" role="option" data-row="${i}" aria-selected="false">
    <div class="row-main">${r.ks ? `<span class="row-ks" lang="ks">${esc(r.ks)}</span>` : ""}${r.rom && !r.romAuto ? `<span class="row-rom">${hl(r.rom, raw)}</span>` : (r.deva && !r.ks ? `<span class="row-rom">${esc(r.deva)}</span>` : "")}</div>
    <span class="row-src">${src}</span>
    <div class="row-gloss">${h.why ? `<span class="row-why">${esc(h.why)} · </span>` : ""}${hl(gloss, raw) || '<span class="muted">no meaning given</span>'}</div></div>`;
}
const isNarrow = () => matchMedia("(max-width: 980px)").matches;
function renderResults(reset) {
  const host = $("results"), raw = $("q").value.trim();
  if (reset && !raw && !S.browseAll && !activeFilters()) { renderWelcome(); return; }
  stopDemo();
  $("welcome").hidden = true; $("panes").hidden = false;
  if (reset) { host.innerHTML = ""; S.page = 0; S.sel = -1; $("results").parentElement.scrollTop = 0; }
  const start = S.page * PAGE, slice = S.hits.slice(start, start + PAGE);
  host.insertAdjacentHTML("beforeend", slice.map((h, k) => rowHtml(h, start + k, raw)).join(""));
  S.page++;
  const n = S.hits.length;
  if (!n) {
    host.innerHTML = `<div class="empty"><span class="ks" lang="ks">کہِنہٕ میوٗل نہٕ</span>Nothing found for “${esc(raw)}”<div class="chips" style="justify-content:center;margin-top:16px">${S.mode !== "contains" ? '<button class="chip" data-mode="contains">Try Contains</button>' : ""}${activeFilters() ? '<button class="chip" data-reset>Clear filters</button>' : ""}<a class="chip" href="#write" data-towrite="${esc(raw)}">Write it in the writer</a></div></div>`;
    $("detail").innerHTML = "";
  }
  $("count").textContent = raw ? `${fmt(n)} result${n === 1 ? "" : "s"}` : `${fmt(n)} entries`;
  $("more").hidden = S.page * PAGE >= n;
  $("more").textContent = `Show more · ${fmt(Math.max(0, n - S.page * PAGE))} left`;
  if (reset) { renderSuggest(raw, n); if (n) selectHit(0, false); }
}
function related(r) {
  const k = r.vSound[0], out = [];
  for (const x of DB.rows) {
    if (x === r) continue;
    if ((r.bare && x.bare === r.bare) || (k && k.length >= 3 && x.vSound.includes(k))) { out.push(x); if (out.length >= 10) break; }
  }
  return out.sort((a, b) => a.rank - b.rank);
}
function showDetail(h, raw) {
  const host = $("detail"); host.innerHTML = "";
  host.appendChild(entryCard(h, raw));
  const rel = related(h.r);
  if (rel.length) {
    S.rel = rel;
    host.insertAdjacentHTML("beforeend", `<div class="card related"><h3>Same word in other sources and spellings</h3>${rel.map((x, i) =>
      `<button class="rel" data-rel="${i}"><span class="ks" lang="ks">${esc(x.ks || "")}</span><span class="g">${esc(x.variants[0] || x.deva || "")}${x.gloss || x.def ? " · " + esc(shortMeaning(x.gloss || x.def)) : ""}</span><span class="s">${SRC_LABEL[x.grp] || ""}</span></button>`).join("")}</div>`);
  }
  $("detailPane").scrollTop = 0;
}
function selectHit(i, open = true) {
  const h = S.hits[i]; if (!h) return;
  S.sel = i;
  document.querySelectorAll("#results .row").forEach(el => el.setAttribute("aria-selected", +el.dataset.row === i));
  showDetail(h, $("q").value.trim());
  if (open && isNarrow()) $("detailPane").classList.add("open");
}
function renderRecent() {
  const rec = store.get("ksd-recent", []), box = $("sideRecent");
  box.innerHTML = rec.length ? rec.map(q => `<button class="${ARABIC_RE.test(q) ? "ks" : ""}" data-q="${esc(q)}" title="${esc(q)}">${esc(q)}</button>`).join("") : '<span class="side-empty">Your searches appear here</span>';
}

/* ---- demo on the home screen: a real sentence becoming Kashmiri (the engine's own output) */
const DEMO_LINES = ["koshur zabaan chhu meeth", "yih makaan chhu dah waryo peth trovmut", "saeri insaan chhi aazaad zaamut"];
let demoTimers = [];
function stopDemo() { demoTimers.forEach(clearTimeout); demoTimers = []; }
function startDemo() {
  stopDemo();
  const R = $("demoRoman"), K = $("demoKs"), E = $("demoEn"); if (!R) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let n = 0;
  const at = (ms, fn) => demoTimers.push(setTimeout(fn, ms));
  const play = () => {
    const line = DEMO_LINES[n++ % DEMO_LINES.length], r = infer(line);
    const words = r.ks.join("").split(" ");
    K.innerHTML = words.map(w => `<span>${esc(w)}</span> `).join(""); E.textContent = r.meaning.text; E.classList.remove("in");
    if (reduced) { R.textContent = line; K.querySelectorAll("span").forEach(s => s.classList.add("in")); E.classList.add("in"); return; }
    R.innerHTML = '<span class="demo-caret"></span>';
    let t = 300;
    for (let i = 1; i <= line.length; i++) { const part = line.slice(0, i); at(t, () => { R.innerHTML = esc(part) + '<span class="demo-caret"></span>'; }); t += 55 + (line[i - 1] === " " ? 70 : 0); }
    t += 250;
    K.querySelectorAll("span").forEach((s, i) => at(t + i * 140, () => s.classList.add("in")));
    t += words.length * 140 + 350;
    at(t, () => E.classList.add("in"));
    at(t + 3600, play);
  };
  play();
}
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < best) best = cur[j]; }
    if (best > max) return max + 1; prev = cur; }
  return prev[b.length];
}
function renderSuggest(raw, n) {
  const box = $("suggest"); box.hidden = true;
  const direct = S.hits.filter(h => h.s >= 20).length;
  if (!raw || direct >= 3 || detect(raw) !== "lat") return;
  const w = raw.toLowerCase(); if (!/^[a-z]{3,}$/.test(w)) return;
  const max = w.length > 5 ? 2 : 1, c = [];
  for (const [v, k] of DB.vocab) if (v !== w && v[0] === w[0]) { const d = lev(w, v, max); if (d <= max) c.push([d, -k, v]); }
  c.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (!c.length) return;
  box.innerHTML = "Did you mean: " + c.slice(0, 4).map(x => `<button class="chip" data-q="${x[2]}">${x[2]}</button>`).join("");
  box.hidden = false;
}
let searchTimer = null;
function runSearch() {
  if (!DB.ready) return;
  $("filterDot").hidden = !activeFilters();
  $("optDot").hidden = !(activeFilters() || S.mode !== "auto" || S.dia);
  S.hits = search(); renderResults(true);
  const qv = $("q").value.trim();
  clearTimeout(runSearch.t);
  if (qv) runSearch.t = setTimeout(() => { if ($("q").value.trim() === qv && S.hits.length) { store.set("ksd-recent", [qv, ...store.get("ksd-recent", []).filter(x => x !== qv)].slice(0, 8)); renderRecent(); } }, 1500);
  $("hint").textContent = qv ? ({ ks: "Kashmiri script", deva: "Devanagari", lat: "English or Roman, any spelling" })[detect(qv)] : (isTouch ? "" : "/ to search · Ctrl K keyboard");
  if (route() === "dict") history.replaceState(null, "", qv ? "#dict?q=" + encodeURIComponent(qv) : "#dict");
}
function onSearchInput(now) {
  const v = $("q").value;
  $("q").classList.toggle("rtl", ARABIC_RE.test(v));
  if (v.trim()) S.browseAll = false; else if (S.mode !== "auto") setMode("auto");
  clearTimeout(searchTimer); if (now === true) runSearch(); else searchTimer = setTimeout(runSearch, 130);
}
function setMode(v) { S.mode = v; document.querySelectorAll("#modeSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === v)); }
function searchFor(text, mode) { go("dict"); $("detailPane").classList.remove("open"); $("q").value = text; setMode(mode || "auto"); S.browseAll = false; onSearchInput(true); scrollTo({ top: 0, behavior: "smooth" }); }
function resetFilters() {
  Object.assign(S, { src: "", pos: "", audio: false, field: "any" });
  $("srcSel").value = ""; $("posSel").value = ""; $("fieldSel").value = "any"; $("audioChk").checked = false; runSearch();
}

/* ============================================================== WRITE & TRANSLATE */
const W = { ready: false, last: null, trace: [] };
// English words stay in English in all four boxes (unless the word is a known Kashmiri word, or the user flips it)
const ENG = new Set();
const KS_PRIORITY = new Set(["me", "so", "te", "ti", "na", "ma", "yi", "su", "tu", "bu", "ba", "ta", "chu", "chi", "yeh", "ath", "as"]);
const OVR = { toKs: new Set(store.get("ksd-toKs", [])), toEn: new Set(store.get("ksd-toEn", [])) };
function saveOvr() { store.set("ksd-toKs", [...OVR.toKs]); store.set("ksd-toEn", [...OVR.toEn]); }
function keepEnglish(clean) {
  if (!$("keepEn") || !$("keepEn").checked) return OVR.toEn.has(clean);
  if (OVR.toKs.has(clean)) return false;
  if (OVR.toEn.has(clean)) return true;
  if (!ENG.has(clean) || KS_PRIORITY.has(clean)) return false;
  return !(DB.byVariant.get(clean) || []).some(e => e.grp === "core" || e.grp === "mine");   // hand-checked Kashmiri words win
}
const STOP = new Set("the a an of to and or in on at for with from by is are be was were as it its this that these those which who whom not no".split(" "));
const glossWords = m => new Set(String(m || "").toLowerCase().replace(/^[a-z.]+\.\s/, "").split(/[^a-z]+/).filter(w => w.length > 2 && !STOP.has(w)));
const CONTEXT_HINTS = { "ترٛےٚ": ["cxoont", "tsoont", "insaan", "kitaab", "makaan", "waryo", "dah"] };
const QBONUS = { "native": 8, "core": 9, "user": 9, "source-perso-arabic (1932)": 2, "spelling": 4, "": 0, "auto-transliterated": -12, "unverified": -6 };
const MEMORY = { "yih makaan chhu dah waryo peth trovmut": "This house has been abandoned for the last ten years.", "saeri insaan chhi aazaad zaamut": "All human beings are born free." };
const shortMeaning = m => String(m || "").replace(/^[a-z ]+\.\s/i, "").split(/[;,(]/)[0].trim();

function tokenize(str) {
  const re = /\\\{([\s\S]*?)\\\}|\\([^\s\\]+)|(\s+)|([^\s\\]+)|(\\)/g, out = []; let m;
  while ((m = re.exec(str)) !== null) {
    if (m[1] !== undefined) out.push({ type: "esc", raw: m[0], text: m[1] });
    else if (m[2] !== undefined) out.push({ type: "esc", raw: m[0], text: m[2] });
    else if (m[3] !== undefined) out.push({ type: "sp", text: m[3] });
    else out.push({ type: "w", text: m[4] ?? m[5] });
  }
  return out;
}
function candidates(clean) {
  const sk = soundKey(clean), rk = rootKey(clean), best = new Map();
  const add = (e, base, how) => { if (!e.ks) return; const sc = base + (QBONUS[e.q] ?? 0) + (e.gloss || e.def ? 3 : 0); const p = best.get(e); if (!p || p.score < sc) best.set(e, { e, base, score: sc, how }); };
  (DB.byVariant.get(clean) || []).forEach(e => add(e, 95, "exact spelling"));
  if (sk) (DB.bySound.get(sk) || []).forEach(e => add(e, 88, "sounds alike"));
  if (best.size < 3 && rk.length >= 3) (DB.byRoot.get(rk) || []).slice(0, 400).forEach(e => add(e, 79, "similar root"));
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, 8);
}
function infer(str) {
  const toks = tokenize(str), words = [];
  toks.forEach(t => {
    if (t.type !== "w") return;
    const m = t.text.match(/^([^A-Za-z'’]*)([A-Za-z'’]*)([^A-Za-z'’]*)$/) || ["", "", t.text, ""];
    Object.assign(t, { pre: m[1], core: m[2], post: m[3], clean: m[2].toLowerCase().replace(/’/g, "'") });
    t.cands = t.clean ? candidates(t.clean) : [];
    t.english = !!t.clean && keepEnglish(t.clean);
    if (t.english) return;
    t.wi = words.length; words.push(t);
  });
  const rawSet = new Set(words.map(w => w.clean)), rawSnd = new Set(words.map(w => soundKey(w.clean)));
  words.forEach(w => { w.choice = w.cands[0] || null; w.bonus = 0; });
  for (let pass = 0; pass < 2; pass++) words.forEach(w => {      // 2-pass context: gloss overlap with neighbours + checked hints
    if (w.cands.length < 2) return;
    const ctx = new Set();
    words.forEach(o => { if (o !== w && Math.abs(o.wi - w.wi) <= 3 && o.choice) glossWords(o.choice.e.meaning).forEach(g => ctx.add(g)); });
    let top = null;
    for (const c of w.cands) {
      let b = 0; for (const g of glossWords(c.e.meaning)) if (ctx.has(g)) b += 6; b = Math.min(b, 18);
      for (const h of CONTEXT_HINTS[c.e.ks] || []) if (rawSet.has(h) || rawSnd.has(soundKey(h))) { b += 12; break; }
      if (!top || c.score + b > top.t) top = { c, t: c.score + b, b };
    }
    w.choice = top.c; w.bonus = top.b;
  });
  const o = { ks: [], lit: [], rom: [], clean: [], trace: [], guessed: [], found: 0, total: 0 };
  toks.forEach(t => {
    if (t.type === "sp") { ["ks", "lit", "rom", "clean"].forEach(k => o[k].push(t.text)); return; }
    if (t.type === "esc") {
      ["ks", "lit", "rom", "clean"].forEach(k => o[k].push(t.text));
      o.trace.push({ raw: t.raw, ks: t.text, rom: t.text, meaning: "kept exactly as typed (\\escape — any language)", gloss: t.text, how: "\\escape", kind: "escaped", keep: true }); return;
    }
    if (!t.clean) { ["ks", "lit", "rom", "clean"].forEach(k => o[k].push(t.text)); return; }
    if (t.english) {
      ["ks", "lit", "rom", "clean"].forEach(k => o[k].push(t.text));
      o.trace.push({ raw: t.text, ks: t.text, rom: t.text, meaning: "English word — kept in English (tap for Kashmiri)", gloss: t.core, how: "English", kind: "english", keep: true, cands: t.cands, clean: t.clean });
      return;
    }
    const lit = literalToKs(t.core); o.lit.push(t.pre + lit + t.post);
    o.total++;
    if (!t.choice) {
      o.ks.push(t.pre + lit + t.post); o.rom.push(t.text); o.clean.push(toClean26(t.text)); o.guessed.push(lit);
      o.trace.push({ raw: t.text, word: t.clean, isEng: ENG.has(t.clean), ks: lit, rom: t.text, meaning: "not in the dictionary — spelled by rule", gloss: t.text, how: "guess", kind: "guess", cands: [] }); return;
    }
    o.found++;
    const e = t.choice.e, primary = (e.rom.split(/\s*\/\s*|\s+or\s+|;\s*/)[0] || t.core).replace(/\s+\d+$/, "").trim();
    o.ks.push(t.pre + e.ks + t.post); o.rom.push(t.pre + primary + t.post); o.clean.push(t.pre + toClean26(primary) + t.post);
    o.trace.push({ raw: t.text, word: t.clean, isEng: ENG.has(t.clean), ks: e.ks, rom: primary, clean: toClean26(primary), meaning: e.meaning || "spelling only", gloss: shortMeaning(e.meaning) || t.core,
      how: t.choice.how + (t.bonus ? ` + context +${t.bonus}` : ""), kind: t.bonus ? "context" : "dict", cands: t.cands, chosen: t.choice, src: SRC_LABEL[e.grp] || e.src });
  });
  o.meaning = synthesize(str, o.trace);
  return o;
}
function synthesize(str, trace) {
  const key = toClean26(str.replace(/\\[{}]?/g, ""));
  if (MEMORY[key]) return { text: MEMORY[key], note: "Attested translation from the sources." };
  if (!trace.length) return { text: "", note: "" };
  const parts = []; let i = 0;
  while (i < trace.length) {
    const c = trace[i], n = trace[i + 1], nk = n && (n.clean || "");
    if (n && /^(sinz|sund|hund|hanz|hinz)$/.test(nk)) { parts.push(`${c.gloss}'s`); i += 2; continue; }
    if (n && /^(peth|pyeth|pethu|pethi)$/.test(nk)) { parts.push(`since ${c.gloss}`); i += 2; continue; }
    parts.push(c.gloss); i++;
  }
  let s = parts.join(" ").replace(/\s+/g, " ").trim().split(" ").filter((w, i, a) => i === 0 || w.toLowerCase() !== a[i - 1].toLowerCase()).join(" "); if (s) s = s[0].toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? "" : ".");
  return { text: s, note: "Word-by-word meanings in Kashmiri word order — use “Translate & correct” for fluent English." };
}
function updateWriter() {
  const r = infer($("w1").value); W.last = r; W.trace = r.trace;
  $("w4").value = r.ks.join(""); $("w2").value = r.lit.join(""); $("w3").value = r.rom.join("");
  $("w3Clean").textContent = r.clean.join("") || "—";
  $("w1Count").textContent = r.trace.length ? `${r.trace.length} word${r.trace.length === 1 ? "" : "s"}` : "";
  const kept = r.trace.filter(t => t.keep).length;
  $("w4Badge").textContent = (r.total ? `found in the dictionary: ${r.found}/${r.total}` : "") + (kept ? `${r.total ? " · " : ""}${kept} kept in English` : "") || "—";
  $("w4Guess").textContent = r.guessed.length ? `spelled by rule: ${r.guessed.join(" ")}` : "";
  $("trDict").textContent = r.meaning.text || "—"; $("trDictNote").textContent = r.meaning.note;
  $("glossStrip").textContent = r.trace.length ? r.trace.map(t => t.gloss).join(" · ") : "";
  $("trace").innerHTML = r.trace.map((t, i) => `<button type="button" class="tok ${t.kind}" data-tok="${i}">
      <span class="r"><span class="raw">${esc(t.raw)}</span><span class="how">${esc(t.how)}</span></span>
      <span class="r"><span class="rom">${esc(t.rom)}</span><span class="ks" lang="ks">${esc(t.ks)}</span></span>
      <span class="mean" title="${esc(t.meaning)}">${esc(t.meaning)}</span></button>`).join("");
  $("cands").hidden = true; $("aiSuggest").hidden = true;
  store.set("ksd-draft", $("w1").value);
}
function showCands(i) {
  const t = W.trace[i], box = $("cands");
  if (!t) { box.hidden = true; return; }
  if (t.kind === "escaped") { box.innerHTML = `<div class="muted"><b>${esc(t.raw)}</b> is escaped with \\ — it always stays exactly as typed.</div>`; box.hidden = false; return; }
  if (t.kind === "english") {
    box.innerHTML = `<div class="muted" style="margin-bottom:6px"><b>${esc(t.raw)}</b> is an English word, so it stays in English in all four boxes.</div>` +
      (t.cands && t.cands.length ? `<button class="btn sm primary" data-flip="ks:${esc(t.clean)}">Write it in Kashmiri instead</button> <span class="muted">(would become <span class="ks" lang="ks">${esc(t.cands[0].e.ks)}</span> — ${esc(shortMeaning(t.cands[0].e.meaning) || "spelling only")})</span>` : `<span class="muted">No Kashmiri word with this spelling was found.</span>`);
    box.hidden = false; return;
  }
  const flip = t.isEng ? `<div style="margin:2px 0 8px"><button class="btn sm" data-flip="en:${esc(t.word)}">Keep “${esc(t.raw)}” in English</button> <span class="muted">— it is also an English word</span></div>` : "";
  if (!t.cands || !t.cands.length) { box.innerHTML = flip || `<div class="muted">No dictionary spellings for <b>${esc(t.raw)}</b>.</div>`; box.hidden = false; return; }
  box.innerHTML = flip + `<div class="muted" style="margin-bottom:4px">Other dictionary spellings for <b>${esc(t.raw)}</b> — tap one to use it:</div>` +
    t.cands.map((c, j) => `<div class="cand"><span class="ks" lang="ks">${esc(c.e.ks)}</span><span class="mono">${esc(c.e.rom.slice(0, 40))}</span><span class="src muted">${esc(c.e.meaning || "spelling only")} · ${esc(SRC_LABEL[c.e.grp] || "")}</span><button data-pick="${i}:${j}" ${c === t.chosen ? 'title="current choice"' : ""}>${c === t.chosen ? "chosen" : "use"}</button></div>`).join("");
  box.hidden = false;
}
function pickCandidate(i, j) {     // replace one word in box 2 with an alternative spelling (and lock it in box 1 via the chosen roman form)
  const t = W.trace[i], c = t && t.cands[j]; if (!c) return;
  const prim = (c.e.rom.split(/\s*\/\s*|\s+or\s+|;\s*/)[0] || t.raw).trim();
  const w1 = $("w1"), parts = tokenize(w1.value); let n = -1;
  w1.value = parts.map(p => { if (p.type === "w" || p.type === "esc") n++; return n === i && p.type === "w" && p.text === t.raw ? toClean26(prim) || t.raw : (p.raw || p.text); }).join("");
  updateWriter();
  // if the cleaned spelling still resolves to another word, put the chosen script in box 2 directly
  const r = W.trace[i]; if (r && r.ks !== c.e.ks) { const v = $("w4").value; $("w4").value = v.replace(r.ks, c.e.ks); }
  toast("Word replaced");
}

/* ---- AI translation: Claude on this site's server (api/translate) when configured, else a free public model */
let serverAI = null;   // null = unknown, true/false after probing
async function probeServer() {
  try { const r = await fetch("/api/translate", { method: "GET" }); if (!r.ok) throw 0; const j = await r.json(); serverAI = !!j.ready; }
  catch (e) { serverAI = false; }
  $("aiProvider").textContent = serverAI ? "Claude (this site)" : "free public model";
}
function hintsForWriter() {
  return (W.last?.trace || []).map(t => t.keep ? `${t.raw} -> KEEP EXACTLY "${t.rom}" in Latin letters in every output (${t.kind === "english" ? "English word" : "escaped text — a name, English or another language; do not translate it"})`
    : `${t.raw} -> ${t.ks}${t.cands && t.cands.length > 1 ? " (alternatives: " + t.cands.slice(1, 4).map(c => c.e.ks + " = " + shortMeaning(c.e.meaning)).join("; ") + ")" : ""} = ${t.meaning}`);
}
function hintsForEnglish(text) {
  const out = [];
  for (const w of [...new Set(text.toLowerCase().split(/[^a-z']+/).filter(x => x.length > 1 && !STOP.has(x)))].slice(0, 25)) {
    const hits = DB.rows.filter(r => r.ks && r.glossWords.includes(w)).sort((a, b) => a.glossWords.indexOf(w) - b.glossWords.indexOf(w) || a.glossWords.length - b.glossWords.length || a.rank - b.rank).slice(0, 4);
    if (hits.length) out.push(`${w} -> ${hits.map(h => `${h.ks} (${h.variants[0] || ""}; ${shortMeaning(h.gloss)})`).join(", ")}`);
  }
  return out;
}
const FREE_SYSTEM = "You are an expert translator and editor of the Kashmiri language (Koshur). Use correct Kashmiri Perso-Arabic orthography with Kashmiri vowel signs. Output only valid JSON.";
async function aiRequest(payload) {
  if (serverAI === null) await probeServer();
  if (serverAI) {
    const r = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return { ...j, provider: "Claude (this site)" };
    if (r.status !== 501) throw new Error(j.error || `HTTP ${r.status}`);
  }
  // free public model (text.pollinations.ai) — same task, same hints
  const task = payload.mode === "en2ks"
    ? `Translate this English text into Kashmiri.\nEnglish: ${payload.english}\nDictionary hints (English word -> Kashmiri candidates):\n${payload.hints.join("\n") || "(none)"}`
    : `Correct and translate this Kashmiri text.\nRoman Kashmiri as typed: ${payload.roman || "(none)"}\nKashmiri script (may contain errors): ${payload.kashmiri}\nWords marked KEEP (written as \\word or \\{phrase\\} — names, English or any other language — or English words) must stay exactly as typed, in Latin letters, in every output including "kashmiri" and "roman".\nDictionary hints (typed word -> candidate spelling = meaning):\n${payload.hints.join("\n") || "(none)"}`;
  const prompt = `${task}\nReturn ONLY a JSON object with keys "english_translation", "kashmiri" (Perso-Arabic), "roman" (Romanized Kashmiri), "notes" (corrections or uncertain words; empty if none).`;
  const r = await fetch("https://text.pollinations.ai/", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "system", content: FREE_SYSTEM }, { role: "user", content: prompt }], model: "openai", jsonMode: true }) });
  const raw = await r.text();
  if (!r.ok) throw new Error(/Turnstile/i.test(raw) ? "the free model blocks pages opened from localhost — it works on the deployed site" : `free model unavailable (HTTP ${r.status})`);
  const j = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]);
  if (!j.english_translation && !j.kashmiri) throw new Error("no answer from the free model");
  return { ...j, provider: "free public model" };
}
async function translateWriter() {
  const ks = $("w4").value.trim(), roman = $("w1").value.trim();
  if (!ks && !roman) { toast("Type something in box 1 first"); return; }
  const btn = $("translateBtn"); btn.disabled = true; $("trAi").textContent = "Translating…"; $("trAi").classList.add("placeholder");
  try {
    const j = await aiRequest({ mode: "ks2en", roman, kashmiri: ks, hints: hintsForWriter() });
    $("aiProvider").textContent = j.provider; $("trAi").textContent = j.english_translation || "—"; $("trAi").classList.remove("placeholder");
    $("aiKs").textContent = j.kashmiri ? normKs(j.kashmiri) : "—"; $("aiRom").textContent = j.roman || "—"; $("aiNotes").textContent = j.notes ? "Notes: " + j.notes : "";
    $("aiSuggest").hidden = false;
  } catch (e) { $("trAi").textContent = `Translation unavailable: ${e.message}. The dictionary meaning on the left still works.`; }
  btn.disabled = false;
}
async function translateEnglish() {
  const text = $("enInput").value.trim(); if (!text) return;
  const hints = hintsForEnglish(text);
  const wordsHtml = [];
  for (const w of [...new Set(text.toLowerCase().split(/[^a-z']+/).filter(x => x.length > 1 && !STOP.has(x)))].slice(0, 12)) {
    const hits = DB.rows.filter(r => r.ks && r.glossWords.includes(w)).sort((a, b) => a.glossWords.indexOf(w) - b.glossWords.indexOf(w) || a.glossWords.length - b.glossWords.length || a.rank - b.rank).filter((h, i, a) => a.findIndex(x => x.ks === h.ks) === i).slice(0, 3);
    if (hits.length) wordsHtml.push(`<b>${esc(w)}</b>: ${hits.map(h => `<span class="ks" lang="ks" style="font-size:17px">${esc(h.ks)}</span>`).join(" · ")}`);
  }
  $("enWords").innerHTML = wordsHtml.length ? "From the dictionary — " + wordsHtml.join(" &nbsp;|&nbsp; ") : "No dictionary words found for this text.";
  $("enOut").innerHTML = `<span class="muted">Translating…</span>`; $("enBtn").disabled = true;
  try {
    const j = await aiRequest({ mode: "en2ks", english: text, hints });
    $("enOut").innerHTML = `<div class="ks" lang="ks" style="font-size:24px">${esc(normKs(j.kashmiri || ""))}</div><code>${esc(j.roman || "")}</code>${j.notes ? `<div class="tr-small">Notes: ${esc(j.notes)}</div>` : ""}
      <div class="tr-small">${esc(j.provider)} · <button class="btn sm" id="enToWriter">Open in writer</button></div>`;
    $("enToWriter").onclick = () => { $("w1").value = toClean26(j.roman || "") || ""; updateWriter(); scrollTo({ top: 0, behavior: "smooth" }); };
  } catch (e) { $("enOut").innerHTML = `<span class="muted">AI translation unavailable: ${esc(e.message)}</span>`; }
  $("enBtn").disabled = false;
}

/* ============================================================== ONE KEYBOARD (auto-switching) */
// Kashmiri: phonetic layout (Urdu-phonetic style, extended for Kashmiri) — every letter and vowel sign; also maps the physical keyboard.
const KS_LAYOUT = [
  [["Backquote", "‌", "ً", "`"], ["Digit1", "1", "َ", "1"], ["Digit2", "2", "ِ", "2"], ["Digit3", "3", "ُ", "3"], ["Digit4", "4", "ٔ", "4"], ["Digit5", "5", "ٕ", "5"], ["Digit6", "6", "ٖ", "6"], ["Digit7", "7", "ٗ", "7"], ["Digit8", "8", "ٚ", "8"], ["Digit9", "9", "ٛ", "9"], ["Digit0", "0", "ٟ", "0"], ["Minus", "-", "ّ", "-"], ["Equal", "=", "ٰ", "="]],
  [["KeyQ", "ق", "ۄ", "q"], ["KeyW", "و", "ؤ", "w"], ["KeyE", "ع", "ٲ", "e"], ["KeyR", "ر", "ڑ", "r"], ["KeyT", "ت", "ٹ", "t"], ["KeyY", "ے", "ؠ", "y"], ["KeyU", "ء", "ۍ", "u"], ["KeyI", "ی", "ێ", "i"], ["KeyO", "ہ", "أ", "o"], ["KeyP", "پ", "إ", "p"], ["BracketLeft", "ْ", "ٓ", "["], ["BracketRight", "ٌ", "ٍ", "]"], ["Backslash", "٘", "ۃ", "\\"]],
  [["KeyA", "ا", "آ", "a"], ["KeyS", "س", "ص", "s"], ["KeyD", "د", "ڈ", "d"], ["KeyF", "ف", "ئ", "f"], ["KeyG", "گ", "غ", "g"], ["KeyH", "ھ", "ح", "h"], ["KeyJ", "ج", "ض", "j"], ["KeyK", "ک", "خ", "k"], ["KeyL", "ل", "ۂ", "l"], ["Semicolon", "؛", ":", ";"], ["Quote", "'", "\"", "'"]],
  [["KeyZ", "ز", "ذ", "z"], ["KeyX", "ش", "ژ", "x"], ["KeyC", "چ", "ث", "c"], ["KeyV", "ط", "ظ", "v"], ["KeyB", "ب", "ة", "b"], ["KeyN", "ن", "ں", "n"], ["KeyM", "م", "ۓ", "m"], ["Comma", "،", "<", ","], ["Period", "۔", ">", "."], ["Slash", "/", "؟", "/"]],
];
const KS_MARKS = [["َ", "zabar · a"], ["ِ", "zer · i"], ["ُ", "pesh · u"], ["ٔ", "ə"], ["ٕ", "ɨ"], ["ٖ", "iː"], ["ٗ", "uː"], ["ٚ", "e / o"], ["ٛ", "ʲ / ʷ"], ["ٟ", "ɨː"],
  ["ّ", "shad"], ["ْ", "sukun"], ["ٰ", "khaḍā zabar"], ["ً", "an"], ["ٓ", "madd"], ["ٲ", "əː"], ["ؠ", "yē ʲ"], ["ۄ", "ɔ"], ["ۍ", "yē tail"], ["ێ", "e"], ["ژھ", "tsʰ"], ["‌", "no-join"]];
const ROMAN_ROWS = [["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"], ["a", "s", "d", "f", "g", "h", "j", "k", "l", "'"], ["z", "x", "c", "v", "b", "n", "m"]];
const ROMAN_EXTRA = [["\\", "escape"], ["\\{", "start"], ["\\}", "end"], ["ạ̄", "ٲ"], ["ạ", "ٔ"], ["ɨ", "ٕ"], ["ɨ̄", "ٟ"], ["ɔ", "ۄ"], ["ā", "آ"], ["ī", "یٖ"], ["ū", "وٗ"], ["ṭ", "ٹ"], ["ḍ", "ڈ"], ["ṛ", "ڑ"]];
const KEYMAP = {}; KS_LAYOUT.flat().forEach(([c, n, s]) => KEYMAP[c] = [n, s]);
const KB = { open: false, mode: "ks", shift: false, target: null };
const isMark = ch => /^[ً-ٰٟ]$/.test(ch);
const showCh = ch => ch === "‌" ? "ZW" : isMark(ch) ? "◌" + ch : ch;
const FIELD_NAMES = { q: "search", w1: "box 1 · Roman", w4: "box 2 · Kashmiri", w3: "box 3 · Roman", w2: "box 4 · letter-by-letter", enInput: "English", addKs: "new word · Kashmiri", addRom: "new word · Roman", addMean: "new word · meaning" };
function kbButton(cls, html, title, fn) {
  const b = document.createElement("button"); b.type = "button"; b.className = cls; b.innerHTML = html; if (title) b.title = title;
  b.addEventListener("mousedown", e => e.preventDefault()); b.addEventListener("click", fn); return b;
}
function renderKb() {
  const rows = $("kbRows"), marks = $("kbMarks"); rows.innerHTML = ""; marks.innerHTML = "";
  $("kbRoman").setAttribute("aria-pressed", KB.mode === "roman"); $("kbKs").setAttribute("aria-pressed", KB.mode === "ks");
  $("kbLabel").textContent = `${KB.mode === "ks" ? "کٲشُر Kashmiri" : "Roman a–z"} → ${FIELD_NAMES[KB.target?.id] || "search"}`;
  if (KB.mode === "ks") {
    KS_LAYOUT.forEach((row, i) => {
      const r = document.createElement("div"); r.className = "krow";
      if (i === 3) r.appendChild(kbButton("key wide" + (KB.shift ? " on" : ""), "⇧ Shift", "", () => { KB.shift = !KB.shift; renderKb(); }));
      row.forEach(([code, n, s, lat]) => {
        const main = KB.shift ? s : n, alt = KB.shift ? n : s;
        const b = kbButton("key ksk", `<span class="main">${esc(showCh(main))}</span><span class="alt">${esc(showCh(alt))}</span><span class="lat">${esc(lat)}</span>`,
          `${lat.toUpperCase()} → ${n === "‌" ? "ZWNJ" : n} · Shift+${lat.toUpperCase()} → ${s}`, () => { kbInsert(main); if (KB.shift) { KB.shift = false; renderKb(); } });
        b.dataset.code = code; r.appendChild(b);
      });
      if (i === 0) r.appendChild(kbButton("key wide", "⌫", "Backspace", () => kbInsert(null)));
      rows.appendChild(r);
    });
    KS_MARKS.forEach(([ch, n]) => marks.appendChild(kbButton("mark", `<span class="g">${esc(showCh(ch))}</span><span class="n">${esc(n)}</span>`, `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`, () => kbInsert(ch))));
  } else {
    ROMAN_ROWS.forEach((row, i) => {
      const r = document.createElement("div"); r.className = "krow";
      row.forEach(k => r.appendChild(kbButton("key", `<span class="main">${k}</span>`, "", () => kbInsert(k))));
      if (i === 0) r.appendChild(kbButton("key wide", "⌫", "Backspace", () => kbInsert(null)));
      rows.appendChild(r);
    });
    ROMAN_EXTRA.forEach(([k, n]) => marks.appendChild(kbButton("mark" + (k.startsWith("\\") ? " esc" : ""), `<span class="g" style="font-family:inherit;font-size:17px">${esc(k)}</span><span class="n">${esc(n)}</span>`, "", () => kbInsert(k))));
  }
  const last = document.createElement("div"); last.className = "krow";
  last.appendChild(kbButton("key wide", "Clear", "", () => { const t = kbTarget(); t.value = ""; t.dispatchEvent(new Event("input", { bubbles: true })); }));
  last.appendChild(kbButton("key space", "space", "", () => kbInsert(" ")));
  last.appendChild(kbButton("key wide", "Close", "", () => kbShow(false)));
  rows.appendChild(last);
  sizeKb();
}
const kbTarget = () => KB.target && document.body.contains(KB.target) ? KB.target : $("q");
function kbInsert(str) {
  const el = kbTarget(); let s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? s;
  if (str === null) { if (s === e && s > 0) s -= Array.from(el.value.slice(0, s)).pop().length; el.value = el.value.slice(0, s) + el.value.slice(e); el.setSelectionRange(s, s); }
  else { el.value = el.value.slice(0, s) + str + el.value.slice(e); el.setSelectionRange(s + str.length, s + str.length); }
  if (!isTouch) el.focus();
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
function sizeKb() { document.documentElement.style.setProperty("--kb-h", KB.open ? $("kb").offsetHeight + "px" : "0px"); }
function kbShow(open, target) {
  KB.open = open; store.set("ksd-kb-open", open); if (target) { KB.target = target; KB.mode = target.dataset.kb === "roman" ? "roman" : "ks"; }
  $("kb").hidden = !open; $("kbdBtn").setAttribute("aria-pressed", open); $("kbdBtnW").setAttribute("aria-pressed", open);
  if (isTouch) document.querySelectorAll("[data-kb]").forEach(el => el.setAttribute("inputmode", open ? "none" : (el.tagName === "INPUT" && el.type === "search" ? "search" : "text")));
  if (open) renderKb(); else sizeKb();
}

/* ============================================================== theme, routing, wiring */
const root = document.documentElement;
function setTheme(t) { if (t) root.setAttribute("data-theme", t); else root.removeAttribute("data-theme"); store.set("ksd-theme", t || ""); }
function setFont(f) { root.setAttribute("data-font", f); $("fontBtn").textContent = f === "nastaliq" ? "Nastaʿlīq" : "Naskh"; store.set("ksd-font", f); }
const route = () => (location.hash.slice(1).split("?")[0] || "dict");
const TITLES = { dict: "Dictionary", write: "Write and translate", about: "Sources and your words" };
function setSidebar(open) { $("sidebar").classList.toggle("open", open); $("scrim").hidden = !open; }
function go(view, push = true) {
  if (!TITLES[view]) view = "dict";
  ["dict", "write", "about"].forEach(v => { $("view-" + v).hidden = v !== view; });
  document.querySelectorAll(".tab").forEach(t => t.dataset.view === view ? t.setAttribute("aria-current", "page") : t.removeAttribute("aria-current"));
  $("pageTitle").textContent = TITLES[view]; document.title = `${TITLES[view]} · Kashmiri Dictionary`;
  setSidebar(false);
  if (view === "dict" && !$("welcome").hidden && DB.ready) startDemo(); else stopDemo();
  if (push && route() !== view) history.replaceState(null, "", "#" + view);
  if (view === "write" && !W.ready && DB.ready) { W.ready = true; updateWriter(); }
}
function exportMine() {
  const rows = store.get("ksd-mine", []);
  const csv = "﻿kashmiri_unicode,romanized_kashmiri,meaning\n" + rows.map(r => [r.ks, r.rom, r.mean].map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = "my_kashmiri_words.csv"; a.click();
}

function wire() {
  setTheme(store.get("ksd-theme", "")); setFont(store.get("ksd-font", "naskh"));
  $("themeBtn").onclick = () => { const dark = root.getAttribute("data-theme") ? root.getAttribute("data-theme") === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; setTheme(dark ? "light" : "dark"); };
  $("fontBtn").onclick = () => setFont(root.getAttribute("data-font") === "nastaliq" ? "naskh" : "nastaliq");
  document.querySelectorAll(".tab").forEach(t => t.onclick = () => go(t.dataset.view));
  addEventListener("hashchange", () => go(route(), false));

  // dictionary
  $("q").addEventListener("input", onSearchInput);
  $("clearQ").onclick = () => { $("q").value = ""; onSearchInput(true); $("q").focus(); };
  document.querySelectorAll("#modeSeg button").forEach(b => b.onclick = () => { setMode(b.dataset.v); runSearch(); });
  $("fieldSel").onchange = e => { S.field = e.target.value; runSearch(); };
  $("srcSel").onchange = e => { S.src = e.target.value; runSearch(); };
  $("posSel").onchange = e => { S.pos = e.target.value; runSearch(); };
  $("audioChk").onchange = e => { S.audio = e.target.checked; runSearch(); };
  $("diaChk").onchange = e => { S.dia = e.target.checked; runSearch(); };
  $("resetBtn").onclick = resetFilters;
  $("filterBtn").onclick = () => { const p = $("filters"); p.hidden = !p.hidden; $("filterBtn").setAttribute("aria-expanded", !p.hidden); };
  $("browseBtn").onclick = () => { const p = $("alphaPanel"); p.hidden = !p.hidden; $("browseBtn").setAttribute("aria-expanded", !p.hidden); };
  $("alpha").innerHTML = ALPHABET.map(c => `<button data-letter="${c}" title="Words starting with ${c}">${c}</button>`).join("");
  $("more").onclick = () => renderResults(false);
  $("detailBack").onclick = () => $("detailPane").classList.remove("open");
  $("menuBtn").onclick = () => setSidebar(true);
  $("scrim").onclick = () => setSidebar(false);
  renderRecent();
  // sidebar sections fold open and closed (remembered)
  const folds = store.get("ksd-folds", {});
  document.querySelectorAll("[data-fold]").forEach(sec => {
    const btn = sec.querySelector(".fold"), key = sec.dataset.fold;
    if (folds[key] === false) btn.setAttribute("aria-expanded", "false");
    btn.onclick = () => { const open = btn.getAttribute("aria-expanded") !== "true"; btn.setAttribute("aria-expanded", open); folds[key] = open; store.set("ksd-folds", folds); };
  });
  // whole sidebar collapses on desktop (remembered)
  const setCollapsed = c => { document.body.classList.toggle("side-collapsed", c); store.set("ksd-side-collapsed", c); sizeKb(); };
  setCollapsed(store.get("ksd-side-collapsed", false));
  $("collapseBtn").onclick = () => setCollapsed(true);
  $("expandBtn").onclick = () => setCollapsed(false);
  // search options roll open and closed (remembered)
  const setOpts = open => { $("options").hidden = !open; $("optBtn").setAttribute("aria-expanded", open); store.set("ksd-opts", open); };
  setOpts(store.get("ksd-opts", false));
  $("optBtn").onclick = () => setOpts($("options").hidden);
  $("results").addEventListener("keydown", e => {
    if (!["ArrowDown", "ArrowUp"].includes(e.key) || S.sel < 0) return;
    e.preventDefault(); const i = Math.max(0, Math.min(S.hits.length - 1, S.sel + (e.key === "ArrowDown" ? 1 : -1)));
    if (i >= S.page * PAGE) renderResults(false);
    selectHit(i, false); document.querySelector(`[data-row="${i}"]`)?.scrollIntoView({ block: "nearest" });
  });
  $("results").tabIndex = 0;
  $("q").addEventListener("keydown", e => { if (e.key === "ArrowDown" && S.hits.length && !$("panes").hidden) { e.preventDefault(); $("results").focus(); selectHit(Math.max(0, S.sel), false); } });
  $("kbdBtn").onclick = () => { const q = $("q"); kbShow(!KB.open || KB.target !== q, q); if (KB.open && !isTouch) q.focus(); };
  document.addEventListener("click", e => {
    const t = e.target;
    const q = t.closest("[data-q]"); if (q) { searchFor(q.dataset.q); return; }
    const l = t.closest("[data-letter]"); if (l) { searchFor(l.dataset.letter, "start"); return; }
    if (t.closest("[data-browseall]")) { S.browseAll = true; runSearch(); return; }
    if (t.closest("[data-reset]")) { resetFilters(); return; }
    const md = t.closest("[data-mode]"); if (md) { setMode(md.dataset.mode); runSearch(); return; }
    const a = t.closest("[data-audio]"); if (a) { playAudio(a); return; }
    const c = t.closest("[data-copy]");
    if (c) { const el = $(c.dataset.copy); const v = el ? el.value ?? el.textContent : c.dataset.copy; navigator.clipboard?.writeText(v).then(() => toast("Copied")); return; }
    const w = t.closest("[data-write]"); if (w) { go("write"); $("w1").value = toClean26(w.dataset.write) || w.dataset.write; updateWriter(); scrollTo({ top: 0, behavior: "smooth" }); return; }
    const tw = t.closest("[data-towrite]"); if (tw) { e.preventDefault(); go("write"); $("w1").value = tw.dataset.towrite; updateWriter(); return; }
    const m = t.closest("[data-more]"); if (m) { const d = m.previousElementSibling; const open = d.classList.toggle("clamp"); m.textContent = open ? "Read the full entry" : "Show less"; return; }
    const row = t.closest("[data-row]"); if (row) { selectHit(+row.dataset.row); return; }
    const rl = t.closest("[data-rel]"); if (rl) { const x = S.rel && S.rel[+rl.dataset.rel]; if (x) showDetail({ r: x, why: "" }, ""); if (isNarrow()) $("detailPane").classList.add("open"); return; }
    const hw = t.closest(".entry .hw .ks"); if (hw && !t.closest("#wotd")) { searchFor(hw.textContent); return; }
    const tok = t.closest("[data-tok]"); if (tok) { showCands(+tok.dataset.tok); return; }
    const fl = t.closest("[data-flip]");
    if (fl) { const [to, w] = fl.dataset.flip.split(":"); if (to === "ks") { OVR.toKs.add(w); OVR.toEn.delete(w); } else { OVR.toEn.add(w); OVR.toKs.delete(w); } saveOvr(); updateWriter(); toast(to === "ks" ? `“${w}” will be written in Kashmiri` : `“${w}” will stay in English`); return; }
    const pk = t.closest("[data-pick]"); if (pk) { const [i, j] = pk.dataset.pick.split(":").map(Number); pickCandidate(i, j); return; }
  });

  // writer
  let wt = null;
  $("w1").addEventListener("input", () => { clearTimeout(wt); wt = setTimeout(updateWriter, 120); });
  ["w4", "w2"].forEach(id => $(id).addEventListener("input", e => { $("w3").value = romanize(e.target.value); }));
  $("w1Clear").onclick = () => { $("w1").value = ""; updateWriter(); };
  document.querySelectorAll("[data-sentence]").forEach(c => c.onclick = () => { $("w1").value = c.dataset.sentence; updateWriter(); });
  const TRANSLATION_ENABLED = false;   // flip to true to switch Meaning and translation back on
  if (TRANSLATION_ENABLED) $("translateBtn").onclick = translateWriter;
  $("keepEn").checked = store.get("ksd-keepEn", true);
  $("keepEn").onchange = e => { store.set("ksd-keepEn", e.target.checked); updateWriter(); };
  $("aiApplyKs").onclick = () => { $("w4").value = $("aiKs").textContent; toast("Box 2 updated"); };
  $("aiApplyRom").onclick = () => { $("w3").value = $("aiRom").textContent; toast("Box 3 updated"); };
  if (TRANSLATION_ENABLED) { $("enBtn").onclick = translateEnglish; $("enInput").addEventListener("keydown", e => { if (e.key === "Enter") translateEnglish(); }); }

  // add words
  $("addBtn").onclick = () => {
    const ks = $("addKs").value.trim(), rom = $("addRom").value.trim(), mean = $("addMean").value.trim();
    if (!ks && !rom && !mean) { $("addMsg").textContent = "Fill at least one field."; return; }
    const mine = store.get("ksd-mine", []); mine.unshift({ ks: normKs(ks), rom, mean }); store.set("ksd-mine", mine);
    const e = addRow({ ks, rom, gloss: mean, grp: "mine", src: "My words", q: "user" });
    ["addKs", "addRom", "addMean"].forEach(id => $(id).value = "");
    $("addMsg").textContent = `Added: ${e.ks || e.rom}${e.romAuto ? ` (Roman: ${e.rom})` : ""}`; if (W.ready) updateWriter();
  };
  $("exportMine").onclick = exportMine;
  $("clearMine").onclick = () => { store.set("ksd-mine", []); $("addMsg").textContent = "Your words were removed (reload to clear them from this page)."; };

  // keyboard
  document.querySelectorAll("[data-kb]").forEach(el => el.addEventListener("focus", () => { if (KB.open) kbShow(true, el); else KB.target = el; }));
  $("kbRoman").onclick = () => { KB.mode = "roman"; renderKb(); };
  $("kbKs").onclick = () => { KB.mode = "ks"; renderKb(); };
  $("kbClose").onclick = () => kbShow(false);
  $("kbdBtnW").onclick = () => {
    const t = KB.target && KB.target.closest && KB.target.closest("#view-write") ? KB.target : $("w1");
    kbShow(!KB.open, t); if (KB.open && !isTouch) t.focus();
  };
  addEventListener("resize", sizeKb);
  document.addEventListener("keydown", e => {
    const a = document.activeElement;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); const t = a?.dataset?.kb ? a : (route() === "write" ? $("w1") : $("q")); kbShow(!KB.open, t); if (!isTouch) t.focus(); return; }
    if (e.key === "Escape" && KB.open) { kbShow(false); return; }
    if (e.key === "/" && !(a && /INPUT|TEXTAREA/.test(a.tagName))) { e.preventDefault(); go("dict"); $("q").focus(); return; }
    if (!KB.open || KB.mode !== "ks" || !$("physChk").checked || a !== kbTarget() || e.ctrlKey || e.metaKey || e.altKey) return;
    const m = KEYMAP[e.code]; if (!m) return;
    e.preventDefault();
    kbInsert(e.shiftKey || (e.key.length === 1 && e.key !== e.key.toLowerCase()) ? m[1] : m[0]);
    const k = document.querySelector(`.key[data-code="${e.code}"]`); if (k) { k.classList.add("hit"); setTimeout(() => k.classList.remove("hit"), 120); }
  });
  const toTop = $("toTop"); addEventListener("scroll", () => { toTop.hidden = scrollY < 900; }, { passive: true }); toTop.onclick = () => scrollTo({ top: 0, behavior: "smooth" });
}
let player = null, playingBtn = null;
function playAudio(btn) {
  if (player) { player.pause(); playingBtn?.classList.remove("playing"); }
  player = new Audio(btn.dataset.audio); playingBtn = btn; btn.classList.add("playing");
  player.onended = player.onerror = () => btn.classList.remove("playing");
  player.play().catch(() => { btn.classList.remove("playing"); toast("Audio unavailable"); });
}

/* ============================================================== start */
wire();
const startRoute = route();
const qParam = new URLSearchParams(location.hash.split("?")[1] || "").get("q");
go(startRoute, false);
$("w1").value = store.get("ksd-draft", "") || "yih makaan chhu dah waryo peth trovmut";
loadData().then(() => {
  const sel = $("posSel");
  Object.entries(DB.posCount).sort((a, b) => b[1] - a[1]).forEach(([p, n]) => { const o = document.createElement("option"); o.value = p; o.textContent = `${p} (${n.toLocaleString()})`; sel.appendChild(o); });
  $("writeStatus").textContent = `${fmt(DB.rows.length)} entries`;
  if (qParam) { $("q").value = qParam; onSearchInput(true); } else runSearch();
  if (route() === "write") { W.ready = true; updateWriter(); }
  // Meaning and translation is "coming soon": no translation service is contacted
  if (store.get("ksd-kb-open", false)) kbShow(true, route() === "write" ? $("w1") : $("q"));
}).catch(err => {
  $("welcome").hidden = false; $("welcome").innerHTML = `<div class="empty">Could not load the dictionary (${esc(err.message)}).<br>Open the site through a web server (e.g. <code>python3 -m http.server -d site</code>) or the deployed address.</div>`;
});
