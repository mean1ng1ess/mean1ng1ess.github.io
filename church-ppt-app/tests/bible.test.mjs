import test from "node:test";
import assert from "node:assert/strict";
import { parseRef, bskUrl, versesFromCopied } from "../js/bible.js";

test("구절 읽기", () => {
  assert.deepEqual(parseRef("행 6:1-7"), { book: "사도행전", code: "act", c1: 6, v1: 1, c2: 6, v2: 7 });
  assert.deepEqual(parseRef("사도행전 6장 1-7절"), { book: "사도행전", code: "act", c1: 6, v1: 1, c2: 6, v2: 7 });
  assert.deepEqual(parseRef("요 3:16"), { book: "요한복음", code: "jhn", c1: 3, v1: 16, c2: 3, v2: 16 });
  assert.deepEqual(parseRef("시 23편"), { book: "시편", code: "psa", c1: 23, v1: null, c2: 23, v2: null });
  assert.deepEqual(parseRef("롬 8:38-9:2"), { book: "로마서", code: "rom", c1: 8, v1: 38, c2: 9, v2: 2 });
  assert.deepEqual(parseRef("고전 13장 4~7절"), { book: "고린도전서", code: "1co", c1: 13, v1: 4, c2: 13, v2: 7 });
  assert.equal(parseRef("아무말"), null);
  assert.equal(bskUrl(parseRef("행 6:1-7")), "https://www.bskorea.or.kr/bible/korbibReadpage.php?version=GAE&book=act&chap=6");
});

test("복사한 장 본문에서 필요한 절만", () => {
  const copied = `사도행전 6장
일곱 집사를 택하다
1 그 때에 제자가 더 많아졌는데 헬라파 유대인들이 1)구제에 빠지므로
2 열두 사도가 모든 제자를 불러
3 형제들아 너희 가운데서
4 우리는 오로지 기도하는 일과
1) 또는 섬김`;
  const r = versesFromCopied(copied, parseRef("행 6:2-3"));
  assert.deepEqual(r.map((x) => [x.c, x.v]), [[6, 2], [6, 3]]);
  const all = versesFromCopied(copied, parseRef("행 6:1-4"));
  assert.equal(all.length, 4);
  assert.equal(all[0].text, "그 때에 제자가 더 많아졌는데 헬라파 유대인들이 구제에 빠지므로");
});

test("한 줄에 붙은 절 나누기 + 표시", async () => {
  const { refLabel } = await import("../js/bible.js");
  const r = versesFromCopied("1 그 때에 제자가 2)많아졌는데 2 열두 사도가 불러 3 형제들아 너희 가운데서 7 세븐", parseRef("행 6:1-3"));
  assert.deepEqual(r.map((x) => x.v), [1, 2, 3]);
  assert.equal(r[1].text, "열두 사도가 불러");
  assert.equal(r[2].text, "형제들아 너희 가운데서 7 세븐");
  assert.equal(refLabel("사도행전", r), "사도행전 6장 1-3절");
  assert.equal(refLabel("로마서", [{ c: 8, v: 38 }, { c: 9, v: 1 }]), "로마서 8장 38절 - 9장 1절");
});

test("줄마다 절이면 본문 속 숫자로 자르지 않음", () => {
  const r = versesFromCopied("5 무리가 다 기뻐하여 6 사람을 세우니\n6 사도들 앞에 세우니", parseRef("행 6:5-6"));
  assert.deepEqual(r.map((x) => x.text), ["무리가 다 기뻐하여 6 사람을 세우니", "사도들 앞에 세우니"]);
});
