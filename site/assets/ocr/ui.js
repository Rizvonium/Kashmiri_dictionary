// UI for the "Scan to text" tab (loaded only when the tab is first opened).
import { pagesFromFile, scanPage } from "./scan.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let files = [], results = [], stop = false;

export function init() {
  $("ocrFile").onchange = async (e) => {
    files = [...e.target.files];
    if (!files.length) return;
    $("ocrFileName").textContent = files.length === 1 ? files[0].name : `${files.length} images`;
    let pages = files.length;
    if (files.length === 1 && /pdf$/i.test(files[0].type + files[0].name)) {
      status("Opening PDF…", 0.02);
      try { pages = (await pagesFromFile(files[0])).count; } catch (err) { return status("Could not open the PDF: " + err.message, 0); }
    }
    $("ocrFrom").value = 1; $("ocrFrom").max = pages; $("ocrTo").max = pages; $("ocrTo").value = Math.min(pages, 5);
    $("ocrRun").disabled = false;
    status(`${pages} page${pages > 1 ? "s" : ""} ready. Choose a range and press Convert.`, 0);
  };
  $("ocrRun").onclick = run;
  $("ocrStop").onclick = () => { stop = true; $("ocrStop").disabled = true; };
  $("ocrCsv").onclick = () => download("kashmiri_scan.csv", toCsv(), "text/csv;charset=utf-8");
  $("ocrTxt").onclick = () => download("kashmiri_scan.txt", toText(), "text/plain;charset=utf-8");
  $("ocrJson").onclick = () => download("kashmiri_scan.json", JSON.stringify(toJson(), null, 1), "application/json");
  $("ocrCopy").onclick = () => navigator.clipboard.writeText(toText()).then(() => status("Copied.", 1), () => status("Your browser blocked copying; use Download text.", 1));
}

function status(text, frac) {
  $("ocrProgress").hidden = false;
  $("ocrStatus").textContent = text;
  if (frac != null) $("ocrBar").style.width = `${Math.round(100 * frac)}%`;
}

const LABELS = {
  "loading tesseract core": "Loading the English reader", "initializing tesseract": "Starting the English reader",
  "loading language traineddata": "Downloading English/Hindi data (first time only)", "initializing api": "Preparing",
  "recognizing text": "Finding English", "reading Kashmiri": "Reading Kashmiri", "removing shadows": "Removing shadows",
  "finding English": "Finding English",
};

async function run() {
  const from = Math.max(1, +$("ocrFrom").value || 1), to = Math.max(from, +$("ocrTo").value || from);
  $("ocrRun").disabled = true; $("ocrStop").hidden = false; $("ocrStop").disabled = false; stop = false;
  results = []; $("ocrPages").innerHTML = ""; $("ocrOut").hidden = false;
  try {
    const sources = files.length === 1 ? [await pagesFromFile(files[0])] : await Promise.all(files.map(pagesFromFile));
    const jobs = [];
    if (sources.length === 1) for (let n = from; n <= Math.min(to, sources[0].count); n++) jobs.push([sources[0], n, n]);
    else sources.forEach((s, k) => { if (k + 1 >= from && k + 1 <= to) jobs.push([s, 1, k + 1]); });
    for (let j = 0; j < jobs.length && !stop; j++) {
      const [src, n, label] = jobs[j];
      const step = (txt, f) => status(`Page ${label} (${j + 1}/${jobs.length}): ${LABELS[txt] || txt}…`, (j + Math.min(1, f ?? 0)) / jobs.length);
      step("rendering", 0);
      const canvas = await src.render(n);
      const res = await scanPage(canvas, step);
      results.push({ page: label, ...res });
      showPage(label, canvas, res);
    }
    status(stop ? `Stopped after ${results.length} page(s).` : `Done: ${results.length} page(s). Tap any cell to correct it, then download.`, 1);
  } catch (err) {
    status("Something went wrong: " + err.message, 1);
    console.error(err);
  } finally {
    $("ocrRun").disabled = false; $("ocrStop").hidden = true;
  }
}

function showPage(label, canvas, res) {
  const wrap = document.createElement("div"); wrap.className = "card wide ocr-page";
  const view = document.createElement("canvas"); const k = Math.min(1, 900 / canvas.width);
  view.width = Math.round(canvas.width * k); view.height = Math.round(canvas.height * k);
  const ctx = view.getContext("2d"); ctx.drawImage(canvas, 0, 0, view.width, view.height);
  ctx.lineWidth = 2;
  for (const it of res.items) {
    ctx.strokeStyle = it.script === "ks" ? "rgba(22,163,74,.9)" : "rgba(37,99,235,.85)";
    ctx.strokeRect(it.x0 * k - 2, it.y0 * k - 2, (it.x1 - it.x0) * k + 4, (it.y1 - it.y0) * k + 4);
  }
  const head = res.columns.map((c, i) => `<th>${c === "ks" ? "Kashmiri" : "English"} ${i + 1}</th>`).join("");
  const body = res.rows.map((cells, r) => `<tr>${cells.map((cell, c) => {
    const ks = res.columns[c] === "ks";
    return `<td contenteditable="true" data-r="${r}" data-c="${c}"${ks ? ' class="ks" dir="rtl" lang="ks"' : ""}>${esc(cell.map((i) => i.text).join(" "))}</td>`;
  }).join("")}</tr>`).join("");
  wrap.innerHTML = `<h3>Page ${label} <span class="muted">· green = Kashmiri, blue = English · ${res.items.length} text pieces</span></h3>`;
  wrap.appendChild(view);
  const tbl = document.createElement("div");
  tbl.innerHTML = `<table class="ocr-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  tbl.addEventListener("input", (e) => { // keep edits for export
    const td = e.target.closest("td"); if (!td) return;
    const page = results.find((p) => p.page === label);
    page.edits = page.edits || {}; page.edits[`${td.dataset.r},${td.dataset.c}`] = td.textContent;
  });
  wrap.appendChild(tbl);
  $("ocrPages").appendChild(wrap);
}

function grid(p) {
  return p.rows.map((cells, r) => cells.map((cell, c) => p.edits?.[`${r},${c}`] ?? cell.map((i) => i.text).join(" ")));
}
function toText() {
  return results.map((p) => `--- page ${p.page} ---\n` + grid(p).map((row) => row.filter(Boolean).join("\t")).filter(Boolean).join("\n")).join("\n\n");
}
function toCsv() {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = ["page,row," + Array.from({ length: Math.max(0, ...results.map((p) => p.columns.length)) }, (_, i) => `column_${i + 1}`).join(",")];
  for (const p of results) grid(p).forEach((row, r) => lines.push([p.page, r + 1, ...row].map(q).join(",")));
  return "﻿" + lines.join("\n");
}
function toJson() {
  return { generator: "Kashmiri Dictionary · Scan to text", pages: results.map((p) => ({ page: p.page, columns: p.columns, rows: grid(p),
    items: p.items.map(({ script, text, conf, x0, y0, x1, y1 }) => ({ script, text, confidence: Math.round(conf), box: [x0, y0, x1, y1] })) })) };
}
function download(name, text, type) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
