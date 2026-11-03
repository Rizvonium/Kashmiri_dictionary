// Scan to text: printed Kashmiri + English pages (PDF or images) -> editable typed text, laid out
// in the page's own rows and columns. Everything runs in the browser; nothing is uploaded.
//
//   English (and Hindi, only so it can be set aside)   Tesseract.js, eng+hin
//   Kashmiri                                            our word model (CNN + BiLSTM + CTC, 7.7 MB),
//                                                       github.com/Rizvonium/kashmiri_ocr
//
// Kashmiri layout: shadows removed (divide by a blurred background) -> ink shapes -> lines separated
// by curves that never cut ink (least-ink path) -> words by gaps measured in letter heights -> each
// word read only from shapes that lie inside its box (shapes touching the box come from outside)
// -> dictionary check (ks-lexicon.js).

import { KashmiriLexicon, correctLine, normalizeKs } from "./ks-lexicon.js";

const CDN = {
  tesseract: "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js",
  pdfjs: "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.min.mjs",
  pdfWorker: "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.worker.min.mjs",
  ort: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/ort.wasm.min.mjs",
  ortWasm: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/",
  langs: "https://tessdata.projectnaptha.com/4.0.0",
};
const MODEL = "models/kashmiri_word_ocr_int8.onnx", MODEL_META = "models/kashmiri_word_ocr.json", LEXICON = "models/ks-lexicon.json";
const MAX_SIDE = 2400;

// ------------------------------------------------------------------ loading (once)
let tessWorker = null, model = null, lexicon = null;
async function getTesseract(progress) {
  if (!tessWorker) {
    const T = await import(CDN.tesseract);
    const createWorker = T.createWorker || T.default?.createWorker;
    // English, Hindi and Urdu from one folder (Tesseract's own data host, CORS-enabled). Hindi and
    // Urdu are only used to vote on each column's script; Kashmiri itself is read by our model.
    tessWorker = await createWorker(["eng", "hin", "urd"], 1, {
      langPath: CDN.langs,
      logger: (m) => m.status && progress?.(m.status, m.progress),
    });
  }
  return tessWorker;
}
async function getModel() {
  if (!model) {
    const ort = await import(CDN.ort);
    ort.env.wasm.wasmPaths = CDN.ortWasm;
    ort.env.wasm.numThreads = 1;
    const [meta, bytes] = await Promise.all([
      fetch(MODEL_META).then((r) => r.json()),
      fetch(MODEL).then((r) => { if (!r.ok) throw new Error("model download failed"); return r.arrayBuffer(); }),
    ]);
    model = { session: await ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ["wasm"] }), units: meta.units, Tensor: ort.Tensor };
  }
  return model;
}
async function getLexicon() {
  if (!lexicon) lexicon = new KashmiriLexicon((await (await fetch(LEXICON)).json()).forms);
  return lexicon;
}

// ------------------------------------------------------------------ pages
export async function pagesFromFile(file) {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import(CDN.pdfjs);
    pdfjs.GlobalWorkerOptions.workerSrc = CDN.pdfWorker;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    return {
      count: pdf.numPages,
      render: async (n) => {
        const page = await pdf.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(300 / 72, MAX_SIDE / Math.max(base.width, base.height));
        const vp = page.getViewport({ scale });
        const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas: c }).promise;
        return c;
      },
    };
  }
  const url = URL.createObjectURL(file);
  const img = new Image(); img.src = url; await img.decode(); URL.revokeObjectURL(url);
  const long = Math.max(img.naturalWidth, img.naturalHeight);
  const k = Math.min(MAX_SIDE / long, Math.max(1, 1600 / long)); // small scans are enlarged, big ones capped
  const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { count: 1, render: async () => c };
}

// ------------------------------------------------------------------ image helpers
function grayOf(canvas) {
  const { width: w, height: h } = canvas;
  const d = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
  return g;
}
/** Shadow / paper-tone / show-through removal: gray / heavily blurred gray. */
function normalizeLight(canvas) {
  const { width: w, height: h } = canvas;
  const b = document.createElement("canvas"); b.width = w; b.height = h;
  const bctx = b.getContext("2d", { willReadFrequently: true });
  bctx.filter = `blur(${Math.max(12, Math.round(Math.max(w, h) / 60))}px)`; bctx.drawImage(canvas, 0, 0);
  const g = grayOf(canvas), bg = grayOf(b), out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) out[i] = Math.min(255, (g[i] / (bg[i] + 1)) * 255);
  return out;
}
function otsu(v) {
  const hist = new Array(256).fill(0); for (const x of v) hist[x | 0]++;
  let sumAll = 0; for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let wB = 0, sumB = 0, best = -1, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB || wB === v.length) continue; sumB += t * hist[t];
    const mB = sumB / wB, mF = (sumAll - sumB) / (v.length - wB), between = wB * (v.length - wB) * (mB - mF) ** 2;
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}
/** 8-connected ink shapes: list of {pts (flat indices), x0,y0,x1,y1,n}. */
function shapes(ink, w, h, minPx) {
  const seen = new Uint8Array(w * h), out = [], stack = [];
  for (let s = 0; s < w * h; s++) {
    if (!ink[s] || seen[s]) continue;
    const pts = []; let x0 = w, y0 = h, x1 = 0, y1 = 0; stack.push(s); seen[s] = 1;
    while (stack.length) {
      const i = stack.pop(); pts.push(i); const x = i % w, y = (i - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx; if (ink[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    if (pts.length >= minPx) out.push({ pts, x0, y0, x1, y1, n: pts.length, cy: (y0 + y1) / 2, cx: (x0 + x1) / 2 });
  }
  return out;
}
const median = (a) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : 0; };

// ------------------------------------------------------------------ Kashmiri lines and words
/** Least-ink path from left to right between rows lo..hi (never through ink if any ink-free path exists). */
function seam(ink, w, x0, x1, lo, hi) {
  const H = hi - lo + 1, W = x1 - x0 + 1; if (H < 2 || W < 2) return null;
  let acc = new Float64Array(H); const back = new Int8Array(H * W);
  for (let r = 0; r < H; r++) acc[r] = ink[(lo + r) * w + x0] ? 1e5 : 1;
  for (let c = 1; c < W; c++) {
    const next = new Float64Array(H);
    for (let r = 0; r < H; r++) {
      let best = acc[r], d = 0;
      if (r > 0 && acc[r - 1] < best) { best = acc[r - 1]; d = -1; }
      if (r < H - 1 && acc[r + 1] < best) { best = acc[r + 1]; d = 1; }
      next[r] = best + (ink[(lo + r) * w + x0 + c] ? 1e5 : 1); back[r * W + c] = d;
    }
    acc = next;
  }
  let r = 0; for (let k = 1; k < H; k++) if (acc[k] < acc[r]) r = k;
  const path = new Float32Array(W);
  for (let c = W - 1; c >= 0; c--) { path[c] = lo + r; r += back[r * W + c]; }
  return path; // y per column x0..x1
}

/** Kashmiri text from the ink not claimed by English/Hindi words. */
async function readKashmiri(norm, w, h, blocked, progress, region) {
  const thr = otsu(norm), ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = norm[i] <= thr && !blocked[i] ? 1 : 0;
  let all = shapes(ink, w, h, 6).filter((s) => s.x0 > 0 && s.y0 > 0 && s.x1 < w - 1 && s.y1 < h - 1)
    .filter((s) => !region || (s.cx >= region.x0 && s.cx <= region.x1 && s.cy >= region.y0 && s.cy <= region.y1));
  if (!all.length) return [];
  const medH = Math.max(6, median(all.filter((s) => s.y1 - s.y0 > 4).map((s) => s.y1 - s.y0 + 1)));
  all = all.filter((s) => !(s.y1 - s.y0 > 3.5 * medH && s.x1 - s.x0 < 0.5 * (s.y1 - s.y0))); // rules, borders
  const clean = new Uint8Array(w * h); for (const s of all) for (const i of s.pts) clean[i] = 1;

  // text blocks: column ranges separated by wide empty vertical gaps
  const colInk = new Int32Array(w); for (const s of all) for (let x = s.x0; x <= s.x1; x++) colInk[x]++;
  const blocks = []; let st = -1, gap = 0;
  for (let x = 0; x <= w; x++) {
    if (x < w && colInk[x]) { if (st < 0) st = x; gap = 0; }
    else if (st >= 0 && (++gap > 3 * medH || x === w)) { blocks.push([st, x - gap]); st = -1; gap = 0; }
  }
  const lines = [];
  for (const [bx0, bx1] of blocks) {
    const inBlock = all.filter((s) => s.cx >= bx0 && s.cx <= bx1);
    if (!inBlock.length) continue;
    // line centres: peaks of the smoothed ink profile
    const prof = new Float32Array(h); for (const s of inBlock) for (const i of s.pts) prof[(i / w) | 0]++;
    const sig = Math.max(2, medH / 3), K = Math.ceil(3 * sig), sm = new Float32Array(h);
    for (let y = 0; y < h; y++) { let a = 0, n = 0; for (let k = -K; k <= K; k++) { const yy = y + k; if (yy < 0 || yy >= h) continue; const g = Math.exp(-0.5 * (k / sig) ** 2); a += g * prof[yy]; n += g; } sm[y] = a / n; }
    const maxv = Math.max(...sm), order = [...sm.keys()].sort((p, q) => sm[q] - sm[p]), peaks = [];
    for (const y of order) { if (sm[y] < 0.12 * maxv) break; if (peaks.every((p) => Math.abs(p - y) >= 1.1 * medH)) peaks.push(y); }
    peaks.sort((p, q) => p - q);
    const seams = [];
    for (let k = 0; k + 1 < peaks.length; k++) seams.push(seam(clean, w, bx0, bx1, peaks[k] + 1, peaks[k + 1] - 1));
    const lineOf = (s) => { const x = Math.min(bx1, Math.max(bx0, Math.round(s.cx))) - bx0; let k = 0; for (const sp of seams) if (sp && s.cy > sp[x]) k++; return k; };
    const groups = peaks.map(() => []);
    for (const s of inBlock) { const k = lineOf(s); if (Math.abs(s.cy - peaks[k]) <= 2.2 * medH) groups[k].push(s); }
    for (const g of groups) if (g.length) lines.push(g);
  }
  const m = await getModel(), lex = await getLexicon().catch(() => null);
  const out = []; let done = 0;
  for (const g of lines) {
    // words: gaps wider than 0.6 letter heights between ink columns, right to left
    const xs = g.map((s) => [s.x0, s.x1]).sort((p, q) => q[1] - p[1]);
    const words = []; for (const [a, b] of xs) { const last = words[words.length - 1]; if (last && last[0] - b <= 0.6 * medH) last[0] = Math.min(last[0], a); else words.push([a, b]); }
    const texts = [], confs = [];
    for (const [a, b] of words) {
      const mine = g.filter((s) => s.x0 >= a && s.x1 <= b); // only shapes inside the word box
      const r = await readWord(m, norm, w, mine);
      if (r.text) { texts.push(r.text); confs.push(r.conf); }
    }
    progress?.("reading Kashmiri", ++done / lines.length);
    if (!texts.length) continue;
    let text = texts.join(" ");
    if (lex) text = correctLine(lex, normalizeKs(text), confs).text;
    out.push({ script: "ks", text, conf: confs.reduce((p, q) => p + q, 0) / confs.length,
      x0: Math.min(...g.map((s) => s.x0)), y0: Math.min(...g.map((s) => s.y0)), x1: Math.max(...g.map((s) => s.x1)), y1: Math.max(...g.map((s) => s.y1)) });
  }
  return out;
}

async function readWord(m, norm, w, mine) {
  if (!mine.length) return { text: "", conf: 0 };
  const x0 = Math.min(...mine.map((s) => s.x0)), y0 = Math.min(...mine.map((s) => s.y0)), x1 = Math.max(...mine.map((s) => s.x1)), y1 = Math.max(...mine.map((s) => s.y1));
  const pad = Math.max(2, Math.round(0.12 * (y1 - y0 + 1))), cw = x1 - x0 + 1 + 2 * pad, ch = y1 - y0 + 1 + 2 * pad;
  const src = document.createElement("canvas"); src.width = cw; src.height = ch;
  const sctx = src.getContext("2d"), im = sctx.createImageData(cw, ch); im.data.fill(255);
  for (const s of mine) for (const i of s.pts) { const x = i % w - x0 + pad, y = ((i / w) | 0) - y0 + pad, o = 4 * (y * cw + x); im.data[o] = im.data[o + 1] = im.data[o + 2] = norm[i]; }
  sctx.putImageData(im, 0, 0);
  const H = 48, W = Math.max(8, Math.min(512, Math.round((cw * H) / ch)));
  const dst = document.createElement("canvas"); dst.width = W; dst.height = H;
  const dctx = dst.getContext("2d", { willReadFrequently: true }); dctx.imageSmoothingQuality = "high"; dctx.drawImage(src, 0, 0, W, H);
  const px = dctx.getImageData(0, 0, W, H).data, data = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[y * W + (W - 1 - x)] = 1 - px[4 * (y * W + x)] / 255;
  const res = await m.session.run({ [m.session.inputNames[0]]: new m.Tensor("float32", data, [1, 1, H, W]) });
  const out = res[m.session.outputNames[0]], [, T, C] = out.dims, L = out.data;
  let text = "", prev = 0, minP = 1;
  for (let t = 0; t < T; t++) {
    let best = 0, max = -Infinity; for (let c = 0; c < C; c++) if (L[t * C + c] > max) { max = L[t * C + c]; best = c; }
    if (best && best !== prev) { let sum = 0; for (let c = 0; c < C; c++) sum += Math.exp(L[t * C + c] - max); minP = Math.min(minP, 1 / sum); text += m.units[best] || ""; }
    prev = best;
  }
  return { text: text.normalize("NFC"), conf: Math.round(minP * 100) };
}

// ------------------------------------------------------------------ one page
const scriptOf = (t) => (/[\u0900-\u097F]/.test(t) ? "hi" : /[\u0600-\u06FF]/.test(t) ? "ks" : /[A-Za-z]/.test(t) ? "en" : null);

/**
 * Bands (split at wide blank rows), then columns inside each band where the script changes:
 * Tesseract's words vote on the script of each narrow vertical strip (en / hi / ks), isolated
 * strips are smoothed away, and runs of the same script become columns.
 */
function regions(norm, w, h, words) {
  const thr = otsu(norm), ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = norm[i] <= thr ? 1 : 0;
  const sh = shapes(ink, w, h, 6).filter((s) => s.x0 > 0 && s.y0 > 0 && s.x1 < w - 1 && s.y1 < h - 1);
  const medH = Math.max(6, median(sh.filter((s) => s.y1 - s.y0 > 4).map((s) => s.y1 - s.y0 + 1)));
  const runs = (occ, minGap) => { const out = []; let st = -1, gap = 0; for (let i = 0; i <= occ.length; i++) { if (i < occ.length && occ[i]) { if (st < 0) st = i; gap = 0; } else if (st >= 0 && (++gap > minGap || i === occ.length)) { out.push([st, i - gap]); st = -1; gap = 0; } } return out; };
  const rowOcc = new Uint8Array(h); for (const s of sh) for (let y = s.y0; y <= s.y1; y++) rowOcc[y] = 1;
  const BIN = Math.max(8, Math.round(w / 32)), nb = Math.ceil(w / BIN), out = [];
  for (const [y0, y1] of runs(rowOcc, 2.5 * medH)) {
    const inBand = sh.filter((s) => s.cy >= y0 && s.cy <= y1);
    if (!inBand.length) continue;
    const bx0 = Math.min(...inBand.map((s) => s.x0)), bx1 = Math.max(...inBand.map((s) => s.x1));
    const votes = Array.from({ length: nb }, () => ({ en: 0, hi: 0, ks: 0 }));
    for (const wd of words) {
      const cy = (wd.bbox.y0 + wd.bbox.y1) / 2, sc = scriptOf(wd.text);
      if (!sc || cy < y0 || cy > y1 || wd.confidence < 20) continue;
      for (let b = Math.floor(wd.bbox.x0 / BIN); b <= Math.floor(wd.bbox.x1 / BIN) && b < nb; b++) votes[b][sc] += wd.confidence;
    }
    let lab = votes.map((v) => { const t = Object.entries(v).sort((a, b) => b[1] - a[1])[0]; return t[1] > 0 ? t[0] : null; });
    for (let b = 0; b < nb; b++) if (!lab[b]) { // empty strips take the nearest labelled neighbour
      let d = 1; while (d < nb && !lab[b - d] && !lab[b + d]) d++; lab[b] = lab[b - d] || lab[b + d] || "ks";
    }
    lab = lab.map((l, b) => (lab[b - 1] && lab[b - 1] === lab[b + 1] && lab[b - 1] !== l ? lab[b - 1] : l)); // isolated strips
    let start = Math.floor(bx0 / BIN);
    for (let b = start + 1; b <= Math.floor(bx1 / BIN) + 1; b++) {
      if (b > Math.floor(bx1 / BIN) || lab[b] !== lab[start]) {
        out.push({ x0: Math.max(bx0, start * BIN), x1: Math.min(bx1, b * BIN - 1), y0, y1, script: lab[start] });
        start = b;
      }
    }
  }
  return { regions: out, medH };
}

export async function scanPage(canvas, progress) {
  const w = canvas.width, h = canvas.height;
  progress?.("removing shadows", 0.05);
  const norm = normalizeLight(canvas);
  progress?.("finding English", 0.1);
  const T = await getTesseract(progress);
  const { data } = await T.recognize(canvas, {}, { blocks: true });
  const words = (data.blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l, li) => l.words.map((wd) => ({ ...wd, lineKey: `${p.bbox.y0}-${li}-${l.bbox.y0}` })))));
  const inside = (r, b) => { const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; return cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1; };
  const { regions: regs } = regions(norm, w, h, words);
  const items = [];
  // English: every Latin word joins the English column of its band that it overlaps most
  // (so words at a column's edge are not lost), grouped by Tesseract's own lines.
  const enRegs = regs.map((r, ri) => [r, ri]).filter(([r]) => r.script === "en");
  const byLine = new Map();
  for (const wd of words) {
    if (!/[A-Za-z0-9]/.test(wd.text) || /[\u0600-\u06FF\u0900-\u097F]/.test(wd.text) || wd.confidence < 15) continue;
    const cy = (wd.bbox.y0 + wd.bbox.y1) / 2;
    let best = null, bestOv = -Infinity;
    for (const [r, ri] of enRegs) {
      if (cy < r.y0 || cy > r.y1) continue;
      const ov = Math.min(r.x1, wd.bbox.x1) - Math.max(r.x0, wd.bbox.x0);
      if (ov > bestOv) { bestOv = ov; best = ri; }
    }
    if (best === null || bestOv < -0.5 * (wd.bbox.x1 - wd.bbox.x0)) continue;
    const key = `${best}|${wd.lineKey}`;
    (byLine.get(key) || byLine.set(key, []).get(key)).push({ ...wd, ri: best });
  }
  for (const ws of byLine.values()) {
    ws.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    items.push({ script: "en", region: ws[0].ri, text: ws.map((x) => x.text).join(" "), conf: ws.reduce((a, x) => a + x.confidence, 0) / ws.length,
      x0: Math.min(...ws.map((x) => x.bbox.x0)), y0: Math.min(...ws.map((x) => x.bbox.y0)), x1: Math.max(...ws.map((x) => x.bbox.x1)), y1: Math.max(...ws.map((x) => x.bbox.y1)) });
  }
  // Kashmiri: our model inside Kashmiri regions; Hindi regions are left out
  const blocked = new Uint8Array(w * h);
  const ksRegs = regs.map((r, ri) => [r, ri]).filter(([r]) => r.script === "ks");
  for (let k = 0; k < ksRegs.length; k++) {
    const [r, ri] = ksRegs[k];
    progress?.("reading Kashmiri", 0.4 + 0.6 * (k / ksRegs.length));
    for (const it of await readKashmiri(norm, w, h, blocked, null, r)) items.push({ ...it, region: ri });
  }
  return layout(items, regs);
}

/** Rows and columns in the page's own arrangement: one table column per page column. */
function layout(items, regs) {
  if (!items.length) return { columns: [], rows: [], items };
  // page columns come from the band with the most (non-Hindi) columns - normally the table itself
  const bands = new Map();
  for (const r of regs) if (r.script !== "hi") (bands.get(r.y0) || bands.set(r.y0, []).get(r.y0)).push(r);
  const itemsIn = (band) => items.filter((i) => band.includes(regs[i.region])).length;
  const main = [...bands.values()].sort((a, b) => itemsIn(b) - itemsIn(a) || b.length - a.length)[0] || []; // the table: most text
  const cols = main.map((r) => ({ x0: r.x0, x1: r.x1, regs: [r] })).sort((a, b) => a.x0 - b.x0);
  for (const r of regs) { // every other region joins the column it overlaps most (or the nearest)
    if (r.script === "hi" || cols.some((c) => c.regs.includes(r))) continue;
    const score = (c) => Math.min(c.x1, r.x1) - Math.max(c.x0, r.x0) - 0.001 * Math.abs((c.x0 + c.x1) - (r.x0 + r.x1));
    const best = [...cols].sort((a, b) => score(b) - score(a))[0];
    if (best) best.regs.push(r);
  }
  const colOf = (it) => cols.findIndex((c) => c.regs.includes(regs[it.region]));
  const hgt = median(items.map((i) => i.y1 - i.y0)) || 20;
  // Entry mode: text in blocks separated by blank space (sentence lists, glossaries with wrapped
  // entries) -> one row per block, each column's lines joined. Gaps are measured on the English and
  // Kashmiri text only (a Hindi column, which is left out, may fill the space between entries).
  const byTop = [...items].sort((a, b) => a.y0 - b.y0), blocks = [];
  for (const it of byTop) {
    const blk = blocks[blocks.length - 1];
    if (blk && it.y0 - blk.y1 <= 0.9 * hgt) { blk.items.push(it); blk.y1 = Math.max(blk.y1, it.y1); }
    else blocks.push({ y1: it.y1, items: [it] });
  }
  const linesPerBlock = blocks.length ? items.length / blocks.length : 0;
  if (blocks.length >= 3 && linesPerBlock >= 2.5) {
    const table = blocks.map((blk) => cols.map((_, c) => {
      const its = blk.items.filter((i) => colOf(i) === c).sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
      return its.length ? [{ ...its[0], text: its.map((i) => i.text).join(" ") }] : [];
    })).filter((row) => row.some((c) => c.length));
    const columns = cols.map((c, k) => { const its = items.filter((i) => colOf(i) === k); return its.filter((i) => i.script === "ks").length > its.length / 2 ? "ks" : "en"; });
    return { columns, rows: table, items };
  }
  const sorted = [...items].sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1)), rows = [];
  for (const it of sorted) {
    const yc = (it.y0 + it.y1) / 2, r = rows[rows.length - 1];
    if (r && Math.abs(yc - r.yc) <= 0.55 * hgt) { r.items.push(it); r.yc = (r.yc * (r.items.length - 1) + yc) / r.items.length; }
    else rows.push({ yc, items: [it] });
  }
  const table = rows.map((r) => { const cells = cols.map(() => []); r.items.forEach((it) => cells[colOf(it)]?.push(it)); return cells; });
  const columns = cols.map((c, k) => { const its = items.filter((i) => colOf(i) === k); return its.filter((i) => i.script === "ks").length > its.length / 2 ? "ks" : "en"; });
  return { columns, rows: table, items };
}
