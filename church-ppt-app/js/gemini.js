// 무료 AI(Google Gemini, 무료 사용량) 로 찬양 제목 + 찬양팀 -> 가사 찾기 / 파트 나누기.
// 키는 Google 계정으로 무료로 만들 수 있고, 이 휴대폰 안(localStorage)에만 저장된다.

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const KEY = "cppt.geminiKey";
const MODEL = "cppt.geminiModel";
export const KEY_URL = "https://aistudio.google.com/apikey";

export const getKey = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
export const setKey = (k) => { try { localStorage.setItem(KEY, k.trim()); localStorage.removeItem(MODEL); } catch { /* 무시 */ } };

export class AiError extends Error {
  constructor(msg, kind = "error") { super(msg); this.kind = kind; }
}

async function call(path, key, body, fetchFn) {
  let res;
  try {
    res = await fetchFn(`${BASE}/${path}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new AiError("인터넷 연결을 확인해 주세요.");
  }
  let data = null;
  try { data = await res.json(); } catch { /* 빈 응답 */ }
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || `HTTP ${res.status}`;
    if (res.status === 400 && /API key/i.test(msg)) throw new AiError("AI 키가 올바르지 않습니다. 키를 다시 붙여넣어 주세요.", "key");
    if (res.status === 403) throw new AiError("이 키로는 AI 를 쓸 수 없습니다. 새 키를 만들어 주세요.", "key");
    if (res.status === 429) throw new AiError("오늘 무료 사용량을 다 썼거나 너무 빨리 요청했습니다. 잠시 뒤 다시 해 주세요.", "limit");
    throw new AiError(`AI 오류: ${msg}`);
  }
  return data;
}

// 키로 쓸 수 있는 'Flash' 모델 중 가장 새 것 (Lite 는 정확도가 낮아 뒤로)
export async function pickModel(key, fetchFn = fetch) {
  try { const m = localStorage.getItem(MODEL); if (m) return m; } catch { /* 없음 */ }
  const data = await call("models?pageSize=200", key, null, fetchFn);
  const ok = (data.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => /^gemini-[\d.]+-flash/.test(n) && !/(image|tts|audio|live|embedding|exp|thinking)/.test(n));
  const ver = (n) => parseFloat(/^gemini-([\d.]+)/.exec(n)[1]);
  ok.sort((a, b) => (/lite/.test(a) - /lite/.test(b)) || (ver(b) - ver(a)) || (/preview/.test(a) - /preview/.test(b)));
  const model = ok[0] || "gemini-2.5-flash";
  try { localStorage.setItem(MODEL, model); } catch { /* 무시 */ }
  return model;
}

function textOf(data) {
  const c = (data.candidates || [])[0];
  if (!c) {
    const r = data.promptFeedback && data.promptFeedback.blockReason;
    throw new AiError(r ? "AI 가 이 요청을 거절했습니다." : "AI 응답이 비어 있습니다.", "blocked");
  }
  if (c.finishReason === "RECITATION") throw new AiError("AI 가 저작권 때문에 가사 전체를 보여주지 않았습니다.", "blocked");
  if (c.finishReason === "SAFETY" || c.finishReason === "PROHIBITED_CONTENT") throw new AiError("AI 가 이 요청을 거절했습니다.", "blocked");
  return ((c.content && c.content.parts) || []).map((p) => p.text || "").join("");
}

export const TRANSLATIONS = ["개역개정", "개역한글", "새번역", "쉬운성경", "현대인의성경", "공동번역 개정판", "우리말성경", "NIV", "ESV", "KJV"];

const BIBLE_PROMPT = (ref, tr) => `교회 예배 PPT 에 넣을 성경 본문을 Google 검색으로 찾아 주세요.

본문: ${ref}
번역본: ${tr}

규칙:
- 반드시 '${tr}' 번역의 본문을 글자 그대로 옮기세요. 다른 번역을 섞거나, 요약하거나, 지어내지 마세요.
- 각주 표시(예: '1)구제' 의 '1)'), 소제목, 설명은 빼세요.
- 한 줄에 한 절씩, 앞에 '장:절' 을 붙이세요.
- 책 이름은 줄이지 말고 정식 이름으로 (예: 행 -> 사도행전, 요 -> 요한복음).
- 확실한 본문을 찾지 못하면 <not_found>이유</not_found> 만 답하세요.
- 아래 형식의 <scripture> 블록 하나만 답하세요.

<scripture>
책: 사도행전
6:1 그 때에 제자가 더 많아졌는데 ...
6:2 열두 사도가 ...
</scripture>`;

// 성경 본문 찾기 -> { book, verses: [{ c, v, text }] }
export async function fetchScripture(ref, tr = "개역개정", { key = getKey(), fetchFn = fetch } = {}) {
  if (!key) throw new AiError("AI 키가 없습니다.", "key");
  const model = await pickModel(key, fetchFn);
  const data = await call(`models/${model}:generateContent`, key, {
    contents: [{ role: "user", parts: [{ text: BIBLE_PROMPT(ref, tr) }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0 },
  }, fetchFn);
  const text = textOf(data);
  const m = /<scripture>([\s\S]*?)<\/scripture>/.exec(text);
  if (!m) {
    const nf = /<not_found>([\s\S]*?)<\/not_found>/.exec(text);
    throw new AiError(nf ? nf[1].trim() || "본문을 찾지 못했습니다." : "본문을 찾지 못했습니다.", "notfound");
  }
  return parseScriptureText(m[1]);
}

// "책: 사도행전" + "6:1 본문" 줄들 -> { book, verses }
export function parseScriptureText(body) {
  let book = "";
  const verses = [];
  for (const raw of body.split("\n")) {
    const l = raw.trim();
    const b = /^책\s*[:：]\s*(.+)$/.exec(l);
    if (b) { book = b[1].trim(); continue; }
    const v = /^(\d+)\s*[:：장]\s*(\d+)\s*절?\s+(.+)$/.exec(l);
    if (v) verses.push({ c: +v[1], v: +v[2], text: v[3].replace(/\d+\)(?=\S)/g, "").trim() });
  }
  if (!verses.length) throw new AiError("본문을 찾지 못했습니다.", "notfound");
  return { book, verses };
}

// "사도행전 6장 1-7절",  장이 넘어가면 "사도행전 6장 1절 - 7장 2절"
export function scriptureLabel(book, verses) {
  if (!verses.length) return book;
  const a = verses[0], z = verses[verses.length - 1];
  if (a.c === z.c) return `${book} ${a.c}장 ${a.v === z.v ? a.v : `${a.v}-${z.v}`}절`;
  return `${book} ${a.c}장 ${a.v}절 - ${z.c}장 ${z.v}절`;
}

export async function testKey(key, fetchFn = fetch) {
  try { localStorage.removeItem(MODEL); } catch { /* 무시 */ }
  return pickModel(key, fetchFn);
}
