// Vercel serverless function: Kashmiri <-> English translation and Kashmiri correction with Claude.
//
// Enable it by adding ANTHROPIC_API_KEY in Vercel -> Project -> Settings -> Environment Variables.
// Without the key, GET reports {ready:false} and the website falls back to its free options.
//
// Optional env vars:
//   ALLOWED_ORIGINS  comma-separated list of sites allowed to call this (default: same site only)
//   TRANSLATE_MODEL  model id (default claude-opus-5-5)
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.TRANSLATE_MODEL || "claude-opus-5-5";
const MAX_INPUT = 1200;            // characters per request
const RATE = { windowMs: 60_000, max: 20 };   // per-IP, per warm instance (best effort)
const hits = new Map();

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["english_translation", "kashmiri", "roman", "notes"],
  properties: {
    english_translation: { type: "string", description: "Natural English translation of the whole text" },
    kashmiri: { type: "string", description: "The text in correct Kashmiri Perso-Arabic script (Unicode, Kashmiri vowel signs)" },
    roman: { type: "string", description: "The text in readable Romanized Kashmiri" },
    notes: { type: "string", description: "Short notes: corrections made, uncertain words, alternatives. Empty if none." },
  },
};

const SYSTEM = `You are an expert translator and editor of the Kashmiri language (Koshur, کٲشُر), fluent in its Perso-Arabic orthography and in common Roman spellings.
Kashmiri script conventions: use Kashmiri letters and vowel signs (ٲ ؠ ۄ ۍ ێ ژ ٹ ڈ ڑ ھ ہ, signs َ ِ ُ ٔ ٕ ٟ ٖ ٗ ٚ ٛ); never Arabic ك ي ه.
Words marked KEEP in the hints (typed as \\word or \\{phrase\\} — names, English or any other language — or English words in the sentence) must stay exactly as typed, in Latin letters, in every field — including "kashmiri" and "roman". Do not translate or transliterate them.
You receive dictionary hints for each word (candidate spellings and meanings from Grierson's 1932 dictionary, Hassan's pronouncing dictionary and modern word lists). Treat them as evidence, not as a fixed answer: choose the sense that fits the sentence, fix spelling and grammar, and say in "notes" what you changed or are unsure about. Never invent meanings for words you do not know — say so in notes.`;

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "?";
}
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < RATE.windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE.max;
}
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;                                  // same-origin fetches may omit it
  const allowed = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (allowed.length) return allowed.includes(origin);
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

function buildPrompt(body) {
  const mode = body.mode === "en2ks" ? "en2ks" : "ks2en";
  const clip = s => String(s || "").slice(0, MAX_INPUT);
  const hints = Array.isArray(body.hints) ? body.hints.slice(0, 60).map(h => `- ${clip(h).slice(0, 300)}`).join("\n") : "";
  if (mode === "en2ks") {
    return `Translate this English text into Kashmiri.
English: ${clip(body.english)}
Dictionary hints (English word -> Kashmiri candidates):
${hints || "(none)"}
Return the Kashmiri translation in "kashmiri" (Perso-Arabic) and "roman", and put the English text (lightly corrected if needed) in "english_translation".`;
  }
  return `Correct and translate this Kashmiri text.
Roman Kashmiri as typed: ${clip(body.roman) || "(none)"}
Kashmiri script (from the dictionary, may contain errors): ${clip(body.kashmiri) || "(none)"}
Dictionary hints (typed word -> candidate spelling (meaning)):
${hints || "(none)"}
Return the corrected Kashmiri in "kashmiri" and "roman", and a natural English translation in "english_translation".`;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const ready = Boolean(process.env.ANTHROPIC_API_KEY);
  if (req.method === "GET") return res.status(200).json({ ready, model: ready ? MODEL : null });
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  if (!ready) return res.status(501).json({ error: "translation service not configured" });
  if (!originAllowed(req)) return res.status(403).json({ error: "origin not allowed" });
  if (rateLimited(clientIp(req))) return res.status(429).json({ error: "too many requests, try again in a minute" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  if (!(body.roman || body.kashmiri || body.english)) return res.status(400).json({ error: "empty input" });

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: buildPrompt(body) }],
    });
    if (response.stop_reason === "refusal") {
      return res.status(422).json({ error: "the model declined this request", category: response.stop_details?.category ?? null });
    }
    const text = response.content.filter(b => b.type === "text").map(b => b.text).join("");
    const data = JSON.parse(text);
    return res.status(200).json({ ...data, provider: response.model || MODEL });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "rate limited by the API, try again shortly" });
    if (error instanceof Anthropic.AuthenticationError) return res.status(500).json({ error: "server API key is invalid" });
    if (error instanceof Anthropic.BadRequestError) return res.status(400).json({ error: error.message });
    if (error instanceof Anthropic.APIError) return res.status(502).json({ error: `API error ${error.status}` });
    if (error instanceof SyntaxError) return res.status(502).json({ error: "could not read the model's reply" });
    return res.status(500).json({ error: "translation failed" });
  }
}
