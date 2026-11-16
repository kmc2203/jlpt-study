#!/usr/bin/env python3
"""우선 어휘 목록(docs/exam_words.json)에서 오늘 문제에 쓸 단어를 고른다.

    python scripts/exam_words.py --pick     # 오늘 쓸 단어 추천 (자동 생성이 읽는 출력)
    python scripts/exam_words.py --stats    # 목록 소진 현황
    python scripts/exam_words.py --check    # 목록 형식 검사

규칙
- tier: top(최빈출) · predict(출제 예상) · freq(빈출). 최빈출·출제 예상을 적극적으로, 빈출은 적당히 쓰도록
  고를 때 top → predict → top → predict → freq 순서로 돌려 뽑는다 (비율 약 2 : 2 : 1).
- 이미 문제(data/pool)에 나온 단어는 뒤로 미루고, 안 나온 단어부터 고른다. 목록을 다 돌면 다시 처음부터.
- 한자 읽기(kanji_reading)에는 한자가 든 단어, 표기(orthography)에는 한자로 쓰는 단어(kind=hyoki 우선)를 쓴다.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIST = ROOT / "docs" / "exam_words.json"
POOL = sorted((ROOT / "data" / "pool").glob("*.json"))
KANJI = re.compile(r"[㐀-䶿一-鿿]")
RUBY = re.compile(r"\{([^{}|]+)\|[^{}]+\}")
TIERS = ("top", "predict", "freq")
TIER_JA = {"top": "최빈출", "predict": "출제예상", "freq": "빈출"}
PATTERN = ["top", "predict", "top", "predict", "freq"]


def load_words():
    data = json.loads(LIST.read_text(encoding="utf-8"))
    return data["words"]


def check(words):
    errs = []
    seen = set()
    for i, w in enumerate(words):
        if not (w.get("w") and w.get("r")):
            errs.append(f"#{i}: w/r 비어 있음")
        if w.get("kind") not in ("hyoki", "yomi"):
            errs.append(f"#{i} {w.get('w')}: kind 가 hyoki/yomi 가 아님")
        if w.get("tier") not in TIERS:
            errs.append(f"#{i} {w.get('w')}: tier 가 top/predict/freq 가 아님")
        k = (w.get("kind"), w.get("w"), w.get("r"))
        if k in seen:
            errs.append(f"#{i} {w.get('w')}: 중복")
        seen.add(k)
        if not re.fullmatch(r"[぀-ゟー]+", w.get("r", "")):
            errs.append(f"#{i} {w.get('w')}: 읽기는 히라가나여야 함 ({w.get('r')})")
    return errs


def key_of(w):
    """문제 본문에서 찾을 때 쓰는 글자 (활용 어미는 뗀다)."""
    s = w["w"]
    if s.endswith("だ"):
        s = s[:-1]
    elif len(s) >= 3 and s[-1] in "るいうくすぶむぐつぬ":
        s = s[:-1]
    return s


def pool_text():
    out = []
    for p in POOL:
        for it in json.loads(p.read_text(encoding="utf-8")).get("items", []):
            t = json.dumps(it, ensure_ascii=False)
            out.append(RUBY.sub(r"\1", t).replace("[[", "").replace("]]", ""))
    return "\n".join(out)


def usage(words):
    text = pool_text()
    return {id(w): text.count(key_of(w)) for w in words}


def pick(words, n, kinds=None, need_kanji=False, used=None, taken=None, offset=0, predict_any=False):
    """PATTERN 순서로 tier 를 돌며, 그 tier 에서 덜 쓴 단어를 하나씩 뽑는다."""
    taken = taken if taken is not None else set()
    out = []
    pool = [w for w in words if (not kinds or w["kind"] in kinds) and (not need_kanji or KANJI.search(w["w"]))]
    guard = 0
    i = offset
    while len(out) < n and guard < 200:
        guard += 1
        tier = PATTERN[i % len(PATTERN)]
        i += 1
        src = [w for w in words if (not need_kanji or KANJI.search(w["w"]))] if (predict_any and tier == "predict") else pool
        cands = [w for w in src if w["tier"] == tier and w["w"] not in taken]
        if not cands:
            cands = [w for w in pool if w["w"] not in taken]
        if not cands:
            break
        cands.sort(key=lambda w: used[id(w)])  # 안정 정렬: 같은 횟수면 목록 순서 유지
        w = cands[0]
        taken.add(w["w"])
        out.append(w)
    return out


def fmt(w, used):
    return f"{w['w']}（{w['r']}） [{TIER_JA[w['tier']]}·{'표기' if w['kind'] == 'hyoki' else '읽기'}·기존 {used[id(w)]}회]"


def cmd_pick(words):
    used = usage(words)
    taken = set()
    from datetime import date
    off = date.today().toordinal() % len(PATTERN)  # 날마다 시작 tier 를 돌려서 한쪽으로 쏠리지 않게
    sections = [
        ("kanji_reading (한자 읽기) 정답 단어 — 1개 + 예비 2개", dict(n=3, need_kanji=True, kinds=("yomi",), predict_any=True)),
        ("orthography (한자 표기) 정답 단어 — 1개 + 예비 2개", dict(n=3, need_kanji=True, kinds=("hyoki",))),
        ("context / synonym / usage 의 핵심 단어 — 각 1개 + 예비 3개", dict(n=6)),
        ("grammar·sentence_order·독해 문장 속에 자연스럽게 넣을 단어 — 3~4개", dict(n=4)),
    ]
    print("[오늘의 우선 어휘] 최빈출·출제예상을 많이, 빈출은 적당히 섞었어요. 억지로 어색하게 넣지 않고, 안 맞으면 예비 단어로 바꿔요.")
    for title, kw in sections:
        got = pick(words, used=used, taken=taken, offset=off, **kw)
        print(f"\n■ {title}")
        for w in got:
            print("  - " + fmt(w, used))
    print("\n참고: 읽기 문제의 선택지는 실제 시험처럼 헷갈리기 쉬운 읽기(탁음·장음·촉음·비슷한 한자)로 만든다. "
          "표기 문제의 오답은 모양이 비슷한 한자로 만든다.")


def cmd_stats(words):
    used = usage(words)
    print(f"전체 {len(words)}개")
    for t in TIERS:
        ws = [w for w in words if w["tier"] == t]
        done = sum(1 for w in ws if used[id(w)] > 0)
        print(f"  {TIER_JA[t]}: {done}/{len(ws)} 개 이미 출제")


def main(argv):
    words = load_words()
    if "--check" in argv:
        errs = check(words)
        for e in errs:
            print("✗ " + e)
        print("OK" if not errs else f"오류 {len(errs)}건")
        return 1 if errs else 0
    if "--stats" in argv:
        cmd_stats(words); return 0
    cmd_pick(words)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
