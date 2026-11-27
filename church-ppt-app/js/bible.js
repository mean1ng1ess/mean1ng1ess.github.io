// 성경 구절 읽기 ("행 6:1-7", "사도행전 6장 1-7절", "시 23편") + 대한성서공회 페이지 주소
// + 성서공회 페이지에서 복사한 본문 정리 (AI 없이)

// [정식 이름, 성서공회 코드, 줄임말...]
const BOOKS = [
  ["창세기", "gen", "창"], ["출애굽기", "exo", "출"], ["레위기", "lev", "레"], ["민수기", "num", "민"], ["신명기", "deu", "신"],
  ["여호수아", "jos", "수"], ["사사기", "jdg", "삿"], ["룻기", "rut", "룻"], ["사무엘상", "1sa", "삼상"], ["사무엘하", "2sa", "삼하"],
  ["열왕기상", "1ki", "왕상"], ["열왕기하", "2ki", "왕하"], ["역대상", "1ch", "대상"], ["역대하", "2ch", "대하"], ["에스라", "ezr", "스"],
  ["느헤미야", "neh", "느"], ["에스더", "est", "에"], ["욥기", "job", "욥"], ["시편", "psa", "시"], ["잠언", "pro", "잠"],
  ["전도서", "ecc", "전"], ["아가", "sng", "아"], ["이사야", "isa", "사"], ["예레미야", "jer", "렘"], ["예레미야애가", "lam", "애"],
  ["에스겔", "ezk", "겔"], ["다니엘", "dan", "단"], ["호세아", "hos", "호"], ["요엘", "jol", "욜"], ["아모스", "amo", "암"],
  ["오바댜", "oba", "옵"], ["요나", "jon", "욘"], ["미가", "mic", "미"], ["나훔", "nam", "나"], ["하박국", "hab", "합"],
  ["스바냐", "zep", "습"], ["학개", "hag", "학"], ["스가랴", "zec", "슥"], ["말라기", "mal", "말"],
  ["마태복음", "mat", "마", "마태"], ["마가복음", "mrk", "막", "마가"], ["누가복음", "luk", "눅", "누가"], ["요한복음", "jhn", "요", "요한"],
  ["사도행전", "act", "행"], ["로마서", "rom", "롬"], ["고린도전서", "1co", "고전"], ["고린도후서", "2co", "고후"],
  ["갈라디아서", "gal", "갈"], ["에베소서", "eph", "엡"], ["빌립보서", "php", "빌"], ["골로새서", "col", "골"],
  ["데살로니가전서", "1th", "살전"], ["데살로니가후서", "2th", "살후"], ["디모데전서", "1ti", "딤전"], ["디모데후서", "2ti", "딤후"],
  ["디도서", "tit", "딛"], ["빌레몬서", "phm", "몬"], ["히브리서", "heb", "히"], ["야고보서", "jas", "약"],
  ["베드로전서", "1pe", "벧전"], ["베드로후서", "2pe", "벧후"], ["요한일서", "1jn", "요일"], ["요한이서", "2jn", "요이"],
  ["요한삼서", "3jn", "요삼"], ["유다서", "jud", "유"], ["요한계시록", "rev", "계"],
];

// 성서공회 홈페이지에서 볼 수 있는 번역본 코드
export const BSK_VERSIONS = { "개역개정": "GAE", "개역한글": "GAE1", "새번역": "NIR", "공동번역 개정판": "KOR" };

function findBook(name) {
  const n = name.replace(/\s+/g, "");
  for (const b of BOOKS) if (b[0] === n || b.slice(2).includes(n)) return b;
  // 앞부분만 맞아도 (예: "사도행" "고린도전")
  const hit = BOOKS.filter((b) => b[0].startsWith(n));
  return hit.length === 1 ? hit[0] : null;
}

// -> { book, code, c1, v1, c2, v2 }  (v1/v2 가 없으면 장 전체)
export function parseRef(text) {
  const t = (text || "").trim().replace(/[~〜～–—]/g, "-").replace(/\s+/g, " ");
  const m = /^(\d?\s*[가-힣]+?)\s*(\d+)\s*(?:[:：장편]\s*)?(?:(\d+)\s*절?)?\s*(?:-\s*(?:(\d+)\s*[:：장]\s*)?(\d+)\s*절?)?\s*$/.exec(t);
  if (!m) return null;
  const b = findBook(m[1]);
  if (!b) return null;
  const c1 = +m[2];
  const v1 = m[3] ? +m[3] : null;
  const c2 = m[4] ? +m[4] : c1;
  const v2 = m[5] ? +m[5] : v1;
  return { book: b[0], code: b[1], c1, v1, c2, v2 };
}

export function bskUrl(ref, translation = "개역개정", chapter = ref.c1) {
  const v = BSK_VERSIONS[translation] || "GAE";
  return `https://www.bskorea.or.kr/bible/korbibReadpage.php?version=${v}&book=${ref.code}&chap=${chapter}`;
}

// 한 줄에 여러 절이 붙어 복사된 경우 ("1 그 때에 ... 2 열두 사도가 ...") -> 절마다 한 줄
function splitRun(line) {
  const m = /^(\d{1,3})\s*\D/.exec(line);
  if (!m) return [line];
  const out = [];
  let n = +m[1], rest = line;
  for (;;) {
    const re = new RegExp(`\\s${n + 1}\\s*(?=[^\\d)\\]])`);
    const k = re.exec(rest.slice(1));
    if (!k) break;
    out.push(rest.slice(0, k.index + 1).trim());
    rest = rest.slice(k.index + 1).trim();
    n += 1;
  }
  out.push(rest);
  return out;
}

// "사도행전 6장 1-7절" / "로마서 8장 38절 - 9장 1절"
export function refLabel(book, verses) {
  if (!verses.length) return book;
  const a = verses[0], b = verses[verses.length - 1];
  if (a.c === b.c) return a.v === b.v ? `${book} ${a.c}장 ${a.v}절` : `${book} ${a.c}장 ${a.v}-${b.v}절`;
  return `${book} ${a.c}장 ${a.v}절 - ${b.c}장 ${b.v}절`;
}

// 성서공회(또는 다른 곳) 에서 복사한 장 본문 -> 원하는 구절만 [{c, v, text}]
// 복사한 글은 "1 그 때에 ..." 처럼 절 번호로 시작하는 줄들. 각주(1)), 소제목, 설명 줄은 버림.
export function versesFromCopied(text, ref) {
  const raw = text.replace(/\r/g, "").replace(/ /g, " ").split("\n").map((l) => l.trim()).filter(Boolean);
  // 절마다 줄이 나뉘어 복사됐으면 그대로, 한 줄로 붙어 왔을 때만 절 번호로 나눔
  const numbered = raw.filter((l) => /^\d{1,3}\s*[^\d)\].]/.test(l)).length;
  const lines = numbered >= 2 ? raw : raw.flatMap((l) => splitRun(l));
  const out = [];
  let chapter = ref.c1;
  let last = 0;
  for (const l of lines) {
    // "6:1 본문" (장:절) 또는 "1 본문" / "1본문"
    let m = /^(\d+)\s*[:：]\s*(\d+)\s*(.+)$/.exec(l);
    let c, v, body;
    if (m) { c = +m[1]; v = +m[2]; body = m[3]; }
    else {
      m = /^(\d{1,3})\s*(?![)\]\.]\s)(\D.*)$/.exec(l);
      if (!m) continue;
      v = +m[1]; body = m[2];
      if (v < last && ref.c2 > ref.c1) chapter += 1;   // 다음 장으로 넘어감
      c = chapter;
    }
    body = body.replace(/\d+\)(?=\S)/g, "").replace(/\s+/g, " ").trim();
    if (!body || /^(장|절|편)\b/.test(body)) continue;
    last = v;
    out.push({ c, v, text: body });
  }
  // 같은 절이 여러 번 나오면 처음 것만, 범위 안의 절만
  const seen = new Set();
  const inRange = (x) => {
    const a = [ref.c1, ref.v1 ?? 1], b = [ref.c2, ref.v2 ?? 999];
    const k = [x.c, x.v];
    const ge = k[0] > a[0] || (k[0] === a[0] && k[1] >= a[1]);
    const le = k[0] < b[0] || (k[0] === b[0] && k[1] <= b[1]);
    return ge && le;
  };
  return out.filter((x) => { const k = `${x.c}:${x.v}`; if (seen.has(k)) return false; seen.add(k); return inRange(x); });
}

// ------------------------------------------------------------------ 앱 안의 성경 (인터넷 없이)
// 개역한글은 저작권이 끝나 앱에 들어 있음. 다른 번역본은 가진 파일을 한 번 넣으면 폰 안에만 저장됨.
export const BUNDLED = { "개역한글": "bible/krv.json" };
const mem = {};

function idb() {
  return new Promise((ok, no) => {
    const r = indexedDB.open("cppt-bible", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("b");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((ok, no) => {
    const t = db.transaction("b", mode);
    const req = fn(t.objectStore("b"));
    t.oncomplete = () => ok(req && req.result);
    t.onerror = () => no(t.error);
  });
}
export const savedBibles = async () => { try { return await idbDo("readonly", (s) => s.getAllKeys()); } catch { return []; } };
export const saveBible = (tr, data) => { mem[tr] = data; return idbDo("readwrite", (s) => s.put(data, tr)); };
export const deleteBible = (tr) => { delete mem[tr]; return idbDo("readwrite", (s) => s.delete(tr)); };

export async function hasBible(tr) {
  return !!(mem[tr] || BUNDLED[tr] || (await savedBibles()).includes(tr));
}

export async function loadBible(tr, fetchFn = fetch) {
  if (mem[tr]) return mem[tr];
  let data = null;
  try { data = await idbDo("readonly", (s) => s.get(tr)); } catch { /* 없음 */ }
  if (!data && BUNDLED[tr]) {
    const res = await fetchFn(BUNDLED[tr]);
    if (!res.ok) throw new Error("성경 파일을 불러오지 못했습니다. 인터넷에 한 번 연결한 뒤 다시 해 주세요.");
    data = await res.json();
  }
  if (data) mem[tr] = data;
  return data;
}

// 구절 -> [{c, v, text}]  (절이 없으면 장 전체)
// 조금씩 모은 성경(_partial)은 구절이 하나라도 빠졌으면 [] (-> 새로 가져오게)
export function versesFromBible(data, ref) {
  const book = data && data[ref.code];
  if (!book) return [];
  const partial = !!data._partial;
  const full = new Set(data._full || []);
  const out = [];
  for (let c = ref.c1; c <= ref.c2; c++) {
    const ch = book[c - 1] || [];
    const from = c === ref.c1 && ref.v1 != null ? ref.v1 : 1;
    const whole = !(c === ref.c2 && ref.v2 != null);
    if (partial && whole && !full.has(`${ref.code}:${c}`)) return [];
    const to = whole ? ch.length : ref.v2;
    for (let v = from; v <= to; v++) {
      if (ch[v - 1]) out.push({ c, v, text: ch[v - 1] });
      else if (partial) return [];
      else if (v > ch.length) break;
    }
  }
  return out;
}

// 가져온 본문을 이 폰의 성경에 더해 둔다 (다음부터는 인터넷 없이)
// fullChapters: 장 전체를 가져온 장 번호들
export async function saveVerses(tr, code, verses, fullChapters = []) {
  if (!verses.length) return;
  let data = null;
  try { data = mem[tr] || (await idbDo("readonly", (s) => s.get(tr))); } catch { /* 없음 */ }
  if (!data) data = { _partial: true };
  if (!data._partial) return;   // 통째로 넣은 성경은 그대로
  const book = (data[code] = data[code] || []);
  for (const x of verses) {
    const ch = (book[x.c - 1] = book[x.c - 1] || []);
    ch[x.v - 1] = x.text;
  }
  for (let i = 0; i < book.length; i++) if (!book[i]) book[i] = [];
  for (const ch of book) for (let i = 0; i < ch.length; i++) if (ch[i] == null) ch[i] = "";
  data._full = [...new Set([...(data._full || []), ...fullChapters.map((c) => `${code}:${c}`)])];
  await saveBible(tr, data);
}

// 복사한 글에서 1절부터 빠짐없이 이어진 장 = 장 전체를 복사한 것
export function wholeChapters(verses) {
  const by = {};
  for (const x of verses) (by[x.c] = by[x.c] || []).push(x.v);
  return Object.entries(by).filter(([, vs]) => vs.sort((a, b) => a - b).every((v, i) => v === i + 1) && vs.length > 1).map(([c]) => +c);
}

// 가진 성경 txt 파일 읽기:  "창1:1 태초에 ..." / "창세기 1:1 ..." / "창 1장 1절 ..."  (소제목 <...> 은 지움)
export function parseBibleTxt(text) {
  const out = {};
  let n = 0;
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const m = /^\s*(\d?\s*[가-힣]+)\s*(\d+)\s*[:：장]\s*(\d+)\s*절?\s+(.+)$/.exec(raw);
    if (!m) continue;
    const b = findBook(m[1]);
    if (!b) continue;
    const body = m[4].replace(/<[^>]*>\s*/g, "").replace(/\d+\)(?=\S)/g, "").replace(/\s+/g, " ").trim();
    if (!body) continue;
    const book = (out[b[1]] = out[b[1]] || []);
    const ch = (book[+m[2] - 1] = book[+m[2] - 1] || []);
    ch[+m[3] - 1] = body;
    n++;
  }
  for (const k of Object.keys(out)) out[k] = Array.from(out[k], (c) => Array.from(c || [], (v) => v || ""));
  return { data: out, verses: n, books: Object.keys(out).length };
}
