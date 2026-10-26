#!/usr/bin/env python3
"""문제 풀 검증기.

사용법:
    python scripts/validate.py                 # data/pool/*.json 전체 검사
    python scripts/validate.py data/pool/batch-005.json

검사 항목: 스키마, 정답 인덱스, 선택지 중복, 해설/번역/단어 존재,
빈칸 채운 완성 문장(full) 일치, 문장 배열(★) 정합성, 문제 ID·문장 중복, 위험한 HTML.
오류가 하나라도 있으면 종료 코드 1.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POOL_DIR = ROOT / "data" / "pool"

TYPES = {
    "kanji_reading", "orthography", "context", "synonym", "usage",
    "grammar", "sentence_order", "text_grammar",
    "reading_short", "reading_mid", "reading_long", "reading_integrated", "reading_claim",
    "info_search",
}
LEVELS = {"N3", "N2"}
ID_RE = re.compile(r"^[a-z]{2,4}-\d{3,}$")
BLANK_RE = re.compile(r"（[\s　]*）")
SLOT_RE = re.compile(r"＿{2,}|★")
BAD_HTML_RE = re.compile(r"<\s*(script|iframe|object|embed|link|meta|style|form)\b|\son\w+\s*=|javascript:", re.I)


def plain(s: str) -> str:
    """util.js 의 plain() 과 같은 규칙: [[밑줄]], {漢字|かんじ} 마크업 제거."""
    s = re.sub(r"\[\[(.+?)\]\]", r"\1", s)
    return re.sub(r"\{([^{}|]+)\|([^{}]+)\}", r"\1", s)


def squash(s: str) -> str:
    return re.sub(r"[\s　、。，,．.・「」『』]", "", plain(s))


def html_text(s: str) -> str:
    return re.sub(r"<[^>]+>", " ", s)


class Report:
    def __init__(self):
        self.errors, self.warnings = [], []

    def err(self, where, msg):
        self.errors.append(f"{where}: {msg}")

    def warn(self, where, msg):
        self.warnings.append(f"{where}: {msg}")


def check_question(rep, where, item, qi, q):
    w = f"{where}.q{qi + 1}"
    if not isinstance(q, dict):
        return rep.err(w, "문항이 객체가 아님")
    stem = q.get("stem")
    if not isinstance(stem, str) or not stem.strip():
        rep.err(w, "stem 이 비어 있음")
        stem = ""
    ch = q.get("choices")
    if not (isinstance(ch, list) and len(ch) == 4 and all(isinstance(c, str) and c.strip() for c in ch)):
        return rep.err(w, "choices 는 비어있지 않은 문자열 4개여야 함")
    if len({squash(c) for c in ch}) != 4:
        rep.err(w, "선택지가 서로 중복됨")
    ans = q.get("answer")
    if not (isinstance(ans, int) and not isinstance(ans, bool) and 0 <= ans < 4):
        return rep.err(w, "answer 는 0~3 정수여야 함")

    # 해설
    e = q.get("explanation")
    if not isinstance(e, dict):
        rep.err(w, "explanation 없음")
        e = {}
    if not (e.get("translation") or item.get("passage_translation")):
        rep.err(w, "한국어 번역(explanation.translation 또는 passage_translation) 없음")
    if not e.get("point"):
        rep.err(w, "explanation.point 없음")
    words = e.get("words")
    if not (isinstance(words, list) and words):
        rep.err(w, "explanation.words 가 비어 있음")
    else:
        for k, x in enumerate(words):
            if not (isinstance(x, dict) and x.get("w") and x.get("m")):
                rep.err(w, f"words[{k}] 에 w/m 필요")
    if "choices" in e:
        if not (isinstance(e["choices"], list) and len(e["choices"]) == 4):
            rep.err(w, "explanation.choices 는 4개여야 함")

    # 빈칸 → 완성 문장 일치 검사
    full = q.get("full")
    t = item["type"]
    if t == "sentence_order":
        check_order(rep, w, q, stem, ch, ans, full)
    elif full is not None:
        if not isinstance(full, str):
            rep.err(w, "full 은 문자열")
        elif BLANK_RE.search(stem) and len(BLANK_RE.findall(stem)) == 1:
            filled = BLANK_RE.sub(plain(ch[ans]), plain(stem))
            if squash(filled) != squash(full):
                rep.err(w, f"stem 의 빈칸에 정답을 넣은 문장과 full 이 다름\n    넣은 결과: {filled}\n    full     : {full}")
    elif t in {"grammar", "context"} and BLANK_RE.search(stem):
        rep.warn(w, "full(완성 문장)이 없으면 정답 검증과 음성 읽기를 못 함")


def check_order(rep, w, q, stem, ch, ans, full):
    slots = SLOT_RE.findall(stem)
    if len(slots) != 4 or stem.count("★") != 1:
        return rep.err(w, "sentence_order 의 stem 에는 빈칸(＿＿＿) 3개 + ★ 1개가 있어야 함")
    star = [i for i, s in enumerate(slots) if s == "★"][0]
    order = q.get("order")
    if not (isinstance(order, list) and sorted(order) == [0, 1, 2, 3]):
        return rep.err(w, "order 는 [0,1,2,3] 의 순열이어야 함")
    if order[star] != ans:
        rep.err(w, f"★ 자리({star + 1}번째)에 들어갈 선택지는 {order[star] + 1}번인데 answer 는 {ans + 1}번")
    if not isinstance(full, str):
        return rep.err(w, "sentence_order 는 full(완성 문장)이 필요함")
    it = iter(order)
    filled = SLOT_RE.sub(lambda _m: plain(ch[next(it)]), plain(stem))
    if squash(filled) != squash(full):
        rep.err(w, f"order 대로 조립한 문장과 full 이 다름\n    조립 결과: {filled}\n    full     : {full}")


def check_item(rep, where, item):
    if not isinstance(item, dict):
        return rep.err(where, "아이템이 객체가 아님")
    iid = item.get("id", "?")
    where = f"{where}[{iid}]"
    if not (isinstance(iid, str) and ID_RE.match(iid)):
        rep.err(where, "id 형식은 'gr-001' 처럼 영문소문자 2~4자-숫자 3자리 이상")
    if item.get("type") not in TYPES:
        return rep.err(where, f"type 이 올바르지 않음: {item.get('type')}")
    if item.get("level", "N2") not in LEVELS:
        rep.err(where, "level 은 N3 또는 N2")
    if "passage" in item and "passage_html" in item:
        rep.err(where, "passage 와 passage_html 은 동시에 쓸 수 없음")
    html = item.get("passage_html")
    if html is not None:
        if not isinstance(html, str) or not html.strip():
            rep.err(where, "passage_html 이 비어 있음")
        elif BAD_HTML_RE.search(html):
            rep.err(where, "passage_html 에 허용되지 않는 태그/속성이 있음")
    t = item["type"]
    needs_passage = t.startswith("reading_") or t in {"text_grammar", "info_search"}
    if needs_passage and not (item.get("passage") or item.get("passage_html")):
        rep.err(where, f"{t} 유형에는 passage(또는 passage_html) 가 필요함")
    if needs_passage and not item.get("passage_translation"):
        rep.warn(where, "지문 번역(passage_translation) 이 없음")
    qs = item.get("questions")
    if not (isinstance(qs, list) and qs):
        return rep.err(where, "questions 가 비어 있음")
    for qi, q in enumerate(qs):
        check_question(rep, where, item, qi, q)


def item_keys(item):
    """중복 판정용 키들. 하나라도 겹치면 같은 문제로 본다."""
    keys = []
    base = squash(item.get("passage") or html_text(item.get("passage_html", "")))
    for q in item.get("questions", []):
        if not isinstance(q, dict):
            continue
        if isinstance(q.get("full"), str):
            keys.append("full:" + squash(q["full"]))
        keys.append("stem:" + item.get("type", "") + ":" + squash(base[:120] + q.get("stem", "")))
    return keys


def load_file(rep, path):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as ex:  # noqa: BLE001
        rep.err(path.name, f"JSON 파싱 실패: {ex}")
        return []
    items = data.get("items") if isinstance(data, dict) else None
    if not isinstance(items, list):
        rep.err(path.name, "최상위에 {\"items\": [...]} 형태가 필요함")
        return []
    return items


def main(argv):
    paths = [Path(a) for a in argv] or sorted(POOL_DIR.glob("*.json"))
    if not paths:
        print("검사할 파일이 없습니다.", file=sys.stderr)
        return 1
    # 단일 파일만 검사해도 기존 풀과의 중복은 잡아야 하므로 전체 풀을 함께 읽는다.
    all_paths = sorted(set(sorted(POOL_DIR.glob("*.json")) + paths))
    rep = Report()
    seen_ids, seen_keys = {}, {}
    type_count = Counter()
    for p in all_paths:
        for item in load_file(rep, p):
            target = p in paths
            sub = Report() if not target else rep
            check_item(sub, p.name, item)
            iid = item.get("id") if isinstance(item, dict) else None
            if iid:
                if iid in seen_ids:
                    rep.err(f"{p.name}[{iid}]", f"id 중복 (이미 {seen_ids[iid]} 에 있음)")
                seen_ids[iid] = p.name
            if isinstance(item, dict):
                for k in item_keys(item):
                    if k in seen_keys and seen_keys[k] != iid:
                        rep.err(f"{p.name}[{iid}]", f"문제 중복: {seen_keys[k]} 와 같은 문장/문항 ({k[:40]}…)")
                    seen_keys[k] = iid
                if target:
                    type_count[item.get("type")] += 1

    for w in rep.warnings:
        print("경고 ", w)
    for e in rep.errors:
        print("오류 ", e)
    total = sum(type_count.values())
    print(f"\n검사한 문제 {total}개 / 오류 {len(rep.errors)} / 경고 {len(rep.warnings)}")
    if type_count:
        print("유형별: " + ", ".join(f"{k} {v}" for k, v in sorted(type_count.items())))
    print(f"풀 전체 문제 {len(seen_ids)}개")
    nxt = {}
    for i in seen_ids:
        m = re.match(r"^([a-z]+)-(\d+)$", i)
        if m:
            nxt[m.group(1)] = max(nxt.get(m.group(1), 0), int(m.group(2)))
    if nxt:
        print("다음에 쓸 ID: " + ", ".join(f"{p}-{n + 1:03d}" for p, n in sorted(nxt.items())))
    return 1 if rep.errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
