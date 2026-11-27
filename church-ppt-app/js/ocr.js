// 무료 악보 가사 읽기 (휴대폰 안에서 Tesseract.js 한국어 OCR).
// 1) 오선 지우고 글자 사이 넓은 빈칸을 좁힘  2) OCR  3) 단어 위치로 줄 재구성 -> 1절/2절/후렴
// 줄 재구성 규칙은 윈도우 프로그램(church-ppt-maker/churchppt/ocr.py) 과 같다.

const HANGUL = /[가-힣]/g;
const CHORD = /^[A-G][#b♯♭]?(m|maj|min|dim|aug|sus|add)?\d*(sus\d*|add\d*)?(\/[A-G][#b♯♭]?)?$/;
const JUNK = /(https?:\/\/|www\.|©|copyright|all rights reserved|가사\s*출처|^출처|^작사|^작곡|^편곡)/i;
const EXTRA_JUNK = /(작사|작곡|편곡|words|music|arr\.|ccli|capo|tempo|♩|bpm|ⓒ|저작권|성가대|=\s*\d+)/i;
const VERSE_MARK = /^(\d)\s*[.)]$|^(\d)\s*[.)]?\s*절$/;

const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const hangulCount = (t) => (t.match(HANGUL) || []).length;
const lineText = (ws) => ws.map((w) => w.text).join(" ");

// words: [{text,x,y,w,h}] -> 같은 높이끼리 줄로
export function regroupRows(words) {
  const ws = [...words].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
  const rows = [];
  for (const w of ws) {
    const cy = w.y + w.h / 2;
    const row = rows[rows.length - 1];
    if (row) {
      const rcy = median(row.map((x) => x.y + x.h / 2));
      const rh = median(row.map((x) => x.h));
      if (Math.abs(cy - rcy) < Math.max(rh, w.h) * 0.5) { row.push(w); continue; }
    }
    rows.push([w]);
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

function isNoise(t) {
  const s = t.trim();
  if (!s) return true;
  if (CHORD.test(s.replace(/^[([]+|[)\]]+$/g, ""))) return true;
  return !/[\p{L}]/u.test(s);
}

function cleanRow(row) {
  let ws = [...row];
  let verse = null;
  if (ws.length) {
    let m = VERSE_MARK.exec(ws[0].text.trim());
    if (m) { verse = +(m[1] || m[2]); ws = ws.slice(1); }
    else if ((m = /^(\d)[.)](.+)$/.exec(ws[0].text.trim()))) { verse = +m[1]; ws = [{ ...ws[0], text: m[2] }, ...ws.slice(1)]; }
  }
  return { words: ws.filter((w) => !isNoise(w.text)), verse };
}

function isLyric(ws, korean) {
  const text = ws.map((w) => w.text).join("");
  const letters = [...text].filter((c) => /\p{L}/u.test(c)).length;
  if (letters < 2) return false;
  if (JUNK.test(lineText(ws)) || EXTRA_JUNK.test(text)) return false;
  return korean ? hangulCount(text) / letters >= 0.6 : true;
}

export function joinSyllables(ws) {
  if (!ws.length) return "";
  const single = ws.filter((w) => w.text.length === 1 && /[가-힣]/.test(w.text)).length;
  if (single < Math.max(2, ws.length * 0.6)) return ws.map((w) => w.text).join(" ");
  const gaps = ws.slice(1).map((w, i) => w.x - (ws[i].x + ws[i].w));
  const charW = median(ws.map((w) => w.w / Math.max(1, w.text.length)));
  const th = Math.max(charW * 1.6, median(gaps) * 2.2);
  let out = ws[0].text;
  ws.slice(1).forEach((w, i) => { out += (gaps[i] > th ? " " : "") + w.text; });
  return out;
}

function findTitle(rows, pageH) {
  const cands = rows.filter((r) => {
    const cy = median(r.map((w) => w.y + w.h / 2));
    const t = lineText(r);
    return cy < pageH * 0.22 && t.trim().length >= 2 && !EXTRA_JUNK.test(t) && !JUNK.test(t);
  });
  if (!cands.length) return null;
  const sure = (r) => r.every((w) => w.conf == null || w.conf >= 75);
  const hOf = (r) => median(r.map((w) => w.h));
  const best = cands.reduce((a, b) => (hOf(b) > hOf(a) ? b : a));
  const others = rows.filter((r) => r !== best).map(hOf);
  return hOf(best) >= median(others.length ? others : [hOf(best)]) * 1.3 && sure(best) ? best : null;
}

// pages: [{words:[...], height, titleWords?}] -> song {title, sections, order}
// titleWords: 제목을 찾을 단어들 (글자 간격을 좁히지 않은 원본 이미지 결과)
export function wordsToSong(pages, titleHint = "") {
  const all = pages.flatMap((p) => p.words.map((w) => w.text)).join("");
  const letters = [...all].filter((c) => /\p{L}/u.test(c)).length || 1;
  const korean = hangulCount(all) / letters > 0.3;
  let title = titleHint;
  const lyric = [];
  pages.forEach((p, pi) => {
    const rows = regroupRows(p.words);
    const rowH = median(rows.map((r) => median(r.map((w) => w.h))));
    // 원본 이미지에서 큰 글자(제목 등)가 있던 높이는 가사에서 뺀다
    const zones = [];
    if (p.titleWords && p.titleWords.length) {
      const tr = regroupRows(p.titleWords);
      const th = median(tr.map((r) => median(r.map((w) => w.h))));
      for (const r of tr) if (Math.max(...r.map((w) => w.h)) > th * 1.6) zones.push([Math.min(...r.map((w) => w.y)), Math.max(...r.map((w) => w.y + w.h))]);
    }
    const inZone = (r) => { const cy = median(r.map((w) => w.y + w.h / 2)); return zones.some(([a, b]) => cy >= a && cy <= b); };
    let t = pi === 0 ? findTitle(rows, p.height) : null;
    if (pi === 0 && p.titleWords && !title) {
      const tt = findTitle(regroupRows(p.titleWords), p.height);
      if (tt) title = joinSyllables(tt);
    }
    if (t && !title) title = joinSyllables(t);
    for (const r of rows) {
      if (r === t) continue;
      if (median(r.map((w) => w.h)) > rowH * 1.6 || inZone(r)) continue;   // 제목처럼 큰 글자는 가사가 아님
      const { words, verse } = cleanRow(r);
      if (!words.length || !isLyric(words, korean)) continue;
      lyric.push({
        text: korean ? joinSyllables(words) : lineText(words),
        top: Math.min(...words.map((w) => w.y)), bottom: Math.max(...words.map((w) => w.y + w.h)),
        height: median(words.map((w) => w.h)), verse, page: pi,
      });
    }
  });
  if (!lyric.length) throw new Error("악보에서 가사를 찾지 못했습니다.\n더 밝고 선명하게, 정면에서 찍은 사진으로 다시 시도해 보세요.");
  const groups = [[lyric[0]]];
  for (let i = 1; i < lyric.length; i++) {
    const prev = lyric[i - 1], cur = lyric[i];
    if (cur.page === prev.page && cur.top - prev.bottom < Math.max(prev.height, cur.height) * 1.2) groups[groups.length - 1].push(cur);
    else groups.push([cur]);
  }
  const sizes = groups.map((g) => g.length);
  const stacked = sizes.filter((s) => s >= 2);
  let k = 1;
  if (stacked.length) {
    const cnt = {};
    for (const s of stacked) cnt[s] = (cnt[s] || 0) + 1;
    k = +Object.entries(cnt).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  }
  const song = { title, artist: "", key: "", order: [], sections: [] };
  if (k >= 2 && sizes.filter((s) => s === k).length >= Math.max(1, sizes.length * 0.4)) {
    const verses = Array.from({ length: k }, () => []);
    const chorus = [];
    for (const g of groups) {
      if (g.length === k) {
        const idx = [...Array(k).keys()];
        const order = g.some((x) => x.verse) ? idx.sort((a, b) => ((g[a].verse || a + 1) - (g[b].verse || b + 1)) || a - b) : idx;
        order.forEach((li, vi) => verses[vi].push(g[li].text));
      } else chorus.push(...g.map((x) => x.text));
    }
    song.sections = verses.map((v, i) => ({ label: `Verse ${i + 1}`, lines: v })).filter((s) => s.lines.length);
    if (chorus.length) {
      song.sections.splice(1, 0, { label: "Chorus", lines: chorus });
      for (let i = 0; i < k; i++) song.order.push(`Verse ${i + 1}`, "Chorus");
    }
  } else {
    song.sections = [{ label: "", lines: groups.flat().map((x) => x.text) }];
  }
  return song;
}

// ---------------------------------------------------------------- 이미지 전처리 (브라우저)
function toCanvas(img, maxW = 2400, minW = 1600) {
  let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const s = w > maxW ? maxW / w : (w < minW ? minW / w : 1);
  w = Math.round(w * s); h = Math.round(h * s);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

// 오선 지우고 글줄마다 글자 사이 빈칸을 좁힌 캔버스 (세로 위치는 그대로)
export function squeezeLyrics(src) {
  const W = src.width, H = src.height;
  const data = src.getContext("2d").getImageData(0, 0, W, H).data;
  const ink = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) ink[i] = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) < 140 ? 1 : 0;
  const rowOn = new Uint8Array(H);
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) n += ink[y * W + x];
    if (n > W * 0.35) ink.fill(0, y * W, (y + 1) * W); // 오선
    else rowOn[y] = n > 0 ? 1 : 0;
  }
  const bands = [];
  let st = -1;
  for (let y = 0; y <= H; y++) {
    const on = y < H && rowOn[y];
    if (on && st < 0) st = y;
    else if (!on && st >= 0) {
      if (bands.length && st - bands[bands.length - 1][1] <= 3) bands[bands.length - 1][1] = y;
      else bands.push([st, y]);
      st = -1;
    }
  }
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const octx = out.getContext("2d");
  octx.fillStyle = "#fff"; octx.fillRect(0, 0, W, H);
  octx.fillStyle = "#000";
  for (const [y0, y1] of bands) {
    const bh = y1 - y0;
    if (bh < 8 || bh > H * 0.15) continue;
    const cols = new Uint8Array(W);
    for (let x = 0; x < W; x++) for (let y = y0; y < y1; y++) if (ink[y * W + x]) { cols[x] = 1; break; }
    const segs = [];
    let s = -1;
    for (let x = 0; x <= W; x++) {
      const on = x < W && cols[x];
      if (on && s < 0) s = x;
      else if (!on && s >= 0) {
        if (segs.length && s - segs[segs.length - 1][1] < bh * 0.45) segs[segs.length - 1][1] = x;
        else segs.push([s, x]);
        s = -1;
      }
    }
    const gap = Math.max(2, Math.round(bh * 0.3));
    let dx = Math.round(bh);
    segs.forEach(([x0, x1], i) => {
      if (i && x0 - segs[i - 1][1] > bh * 3) dx += gap * 2;
      if (dx + (x1 - x0) >= W) return;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (ink[y * W + x]) octx.fillRect(dx + x - x0, y, 1, 1);
      dx += (x1 - x0) + gap;
    });
  }
  return out;
}

// ---------------------------------------------------------------- Tesseract
let workerPromise = null;
function getWorker(onProgress) {
  if (!workerPromise) {
    const base = new URL("./vendor/", document.baseURI).href;
    // 엔진·한국어 데이터를 앱 안에 같이 넣어 두어 외부 사이트 없이 동작 (처음 한 번 약 5MB)
    workerPromise = globalThis.Tesseract.createWorker("kor", 1, {
      workerPath: base + "tesseract-worker.min.js",
      corePath: base + "tesseract-core/",
      langPath: base + "lang",
      logger: (m) => onProgress && onProgress(m),
    });
  }
  return workerPromise;
}

function wordsFromResult(data) {
  const words = [];
  const push = (w) => {
    const b = w.bbox;
    // 자신 없는 글자(음표 머리를 글자로 착각 등)는 버린다
    if (w.text && w.text.trim() && (w.confidence == null || w.confidence >= 55)) words.push({ text: w.text.trim(), x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0, conf: w.confidence });
  };
  if (data.words && data.words.length) data.words.forEach(push);
  else for (const bl of data.blocks || []) for (const pa of bl.paragraphs || []) for (const li of pa.lines || []) for (const w of li.words || []) push(w);
  return words;
}

async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

export async function readSheetMusic(files, titleHint = "", onProgress = () => {}) {
  if (!globalThis.Tesseract) throw new Error("글자 인식 기능을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.");
  onProgress("한국어 글자 인식 준비 중... (처음 한 번은 몇 MB 를 내려받습니다)");
  const worker = await getWorker((m) => {
    if (m.status && m.progress != null) onProgress(`${m.status} ${Math.round(m.progress * 100)}%`);
  });
  const pages = [];
  for (let i = 0; i < files.length; i++) {
    onProgress(`악보 ${i + 1}/${files.length} 읽는 중...`);
    const canvas = toCanvas(await loadImage(files[i]));
    const plain = wordsFromResult((await worker.recognize(canvas)).data);
    let words = plain;
    try {
      const sq = wordsFromResult((await worker.recognize(squeezeLyrics(canvas))).data);
      if (hangulCount(sq.map((w) => w.text).join("")) > hangulCount(plain.map((w) => w.text).join(""))) words = sq;
    } catch { /* 원본 결과 사용 */ }
    pages.push({ words, height: canvas.height, titleWords: plain });
  }
  return wordsToSong(pages, titleHint);
}
