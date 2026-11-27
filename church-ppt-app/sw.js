// 오프라인용: 앱 파일을 저장해 두고, 인터넷이 없어도 열리게 한다.
const VERSION = "cppt-v17";
const BIBLE = "cppt-bible-1";   // 성경 본문은 앱이 바뀌어도 다시 받지 않도록 따로 보관
const APP = ["./", "index.html", "app.css", "manifest.webmanifest", "js/app.js", "js/lyrics.js", "js/slides.js",
  "js/pptx.js", "js/preview.js", "js/ocr.js", "js/pptimport.js", "js/template.js", "js/gemini.js", "js/bible.js", "vendor/jszip.min.js", "fonts/NanumSquareNeoTTF-bRg.woff2", "fonts/NanumSquareNeoTTF-cBd.woff2", "vendor/pptxgen.bundle.js", "vendor/tesseract.min.js",
  "vendor/tesseract-worker.min.js", "icons/icon-192.png", "icons/icon-512.png", "assets/connection-cross.jpg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== BIBLE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const ocrCdn = /cdn\.jsdelivr\.net|tessdata/.test(url.host + url.pathname);
  if (!sameOrigin && !ocrCdn) return;
  if (url.pathname.endsWith(".pptx")) return;   // 큰 교회 PPT 틀은 앱 안(IndexedDB)에 따로 저장
  if (sameOrigin && url.pathname.includes("/bible/")) {
    e.respondWith((async () => {
      const cache = await caches.open(BIBLE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }
  // 앱 파일: 인터넷 되면 새 버전, 안 되면 저장본.  글자 인식 데이터: 저장본 우선.
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (ocrCdn) {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }
    try {
      const res = await fetch(req, { cache: "no-cache" });   // 새 버전을 바로 (휴대폰 임시 저장본 말고)
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return (await cache.match(req, { ignoreSearch: true })) || (await cache.match("index.html"));
    }
  })());
});
