#!/usr/bin/env python3
"""문제 데이터에 후리가나를 자동으로 단다.

규칙: 실제 시험처럼 N2 범위(scripts/n2_kanji.txt) 밖의 한자(N1급·목록 밖)가 들어 있는 단어에만
      {漢字|かんじ} 를 붙인다. 앱은 이 표기를 <ruby> 로 그리고, 설정의 후리가나 스위치로 켜고 끈다.
      정답이 드러나는 곳(읽기 문제의 밑줄 말, 표기 문제의 선택지)에는 달지 않는다.

사용법:
    python scripts/furigana.py                 # data/pool/*.json 전체에 적용 (이미 단 것은 그대로)
    python scripts/furigana.py data/pool/batch-007.json
    python scripts/furigana.py --check         # 빠진 곳이 있으면 목록을 보이고 종료 코드 1 (분석기 불필요)
    python scripts/furigana.py --grammar       # data/grammar.json 예문(ex[].ja)에도 적용
    python scripts/furigana.py --report        # 적용 후 (단어, 읽기) 목록도 출력 (검토용)

분석기: pip install fugashi unidic-lite   (적용할 때만 필요, --check 는 불필요)
이미 손으로 단 {漢字|かんじ} 는 보존한다.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POOL_DIR = ROOT / "data" / "pool"
EASY = set((Path(__file__).resolve().parent / "n2_kanji.txt").read_text(encoding="utf-8").split()[0])
KANJI = r"㐀-䶿一-鿿豈-﫿々〆"
KANJI_CH = re.compile(f"[{KANJI}]")
RUBY_RE = re.compile(r"\{([^{}|]+)\|([^{}]+)\}")
TOKEN_RE = re.compile(r"\[\[|\]\]|\{[^{}|]+\|[^{}]+\}|.", re.S)
NO_ANSWER_LEAK = {"kanji_reading", "orthography"}  # 해설에도 달지 않는 유형 (읽기·표기 자체가 주제)


def is_hard(ch: str) -> bool:
    return bool(KANJI_CH.match(ch)) and ch not in EASY and ch not in "々〆"


def kata2hira(s: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


# ───────────── 마크업 해석: 본문(P) + 밑줄 표시 + 이미 단 후리가나 ─────────────
def parse(text: str):
    """text → (P, marks, rubies, under)
    P       마크업을 걷어낸 글(후리가나는 본문 글자만)
    marks   [(P 위치, '[[' 또는 ']]')]
    rubies  {시작: (끝, 읽기)}  이미 달린 후리가나
    under   P 의 각 글자가 밑줄 안이면 True
    """
    P, marks, rubies, under, depth = [], [], {}, [], 0
    n = 0
    for m in TOKEN_RE.finditer(text):
        t = m.group()
        if t == "[[":
            marks.append((n, t)); depth += 1
        elif t == "]]":
            marks.append((n, t)); depth = max(0, depth - 1)
        elif len(t) > 1 and t[0] == "{":
            rm = RUBY_RE.fullmatch(t)
            rubies[n] = (n + len(rm.group(1)), rm.group(2))
            P.append(rm.group(1)); under += [depth > 0] * len(rm.group(1)); n += len(rm.group(1))
        else:
            P.append(t); under.append(depth > 0); n += 1
    return "".join(P), marks, rubies, under


def uncovered(text: str, skip_underline: bool = False):
    """분석기 없이: 후리가나 없이 남은 N2 밖 한자 단어(글자 덩어리) 목록."""
    P, marks, rubies, under = parse(text)
    covered = set()
    for s, (e, _r) in rubies.items():
        covered.update(range(s, e))
    out, i = [], 0
    while i < len(P):
        if is_hard(P[i]) and i not in covered and not (skip_underline and under[i]):
            j = i
            while j < len(P) and KANJI_CH.match(P[j]) and j not in covered and not (skip_underline and under[j]):
                j += 1
            out.append(P[i:j]); i = j
        else:
            i += 1
    return out


# ───────────── 형태소 분석 ─────────────
_tagger = None


def tagger():
    global _tagger
    if _tagger is None:
        try:
            import fugashi
        except ImportError:
            sys.exit("fugashi 가 필요해요:  pip install fugashi unidic-lite")
        _tagger = fugashi.Tagger()
    return _tagger


def split_reading(surface: str, reading: str):
    """표면형 → [(한자 덩어리, 읽기) 또는 (가나, None)]. 맞추지 못하면 None."""
    segs = re.findall(f"[{KANJI}]+|[^{KANJI}]+", surface)
    if len(segs) == 1 and KANJI_CH.match(segs[0][0]):
        return [(surface, reading)]
    pat = "".join("(.+?)" if KANJI_CH.match(s[0]) else re.escape(kata2hira(s)) for s in segs)
    m = re.fullmatch(pat, reading)
    if not m:
        return None
    gs = iter(m.groups())
    return [(s, next(gs)) if KANJI_CH.match(s[0]) else (s, None) for s in segs]


def plan(P: str, skip=lambda i, j: False, stats=None):
    """P 안에서 후리가나를 달 자리 [(시작, 끝, 읽기)]."""
    ops = []
    pos = 0
    for w in tagger()(P):
        s = w.surface
        i = P.index(s, pos) if s else pos
        pos = i + len(s)
        if not any(is_hard(c) for c in s):
            continue
        reading = w.feature.kana if w.feature.kana not in (None, "*") else None
        if not reading:
            if stats is not None:
                stats.append(("읽기 없음", s))
            continue
        parts = split_reading(s, kata2hira(reading))
        if parts is None:
            if stats is not None:
                stats.append(("읽기 맞춤 실패", f"{s} / {reading}"))
            continue
        k = i
        for seg, r in parts:
            if r is not None and any(is_hard(c) for c in seg) and not skip(k, k + len(seg)):
                ops.append((k, k + len(seg), r))
            k += len(seg)
    return ops


def annotate(text: str, skip_underline: bool = False, stats=None, report=None) -> str:
    """마크업 문자열에 후리가나를 단다. 이미 있는 것은 보존."""
    if not text or not any(is_hard(c) for c in text):
        return text
    P, marks, rubies, under = parse(text)
    covered = set()
    for s, (e, _r) in rubies.items():
        covered.update(range(s, e))
    mark_pos = {p for p, _ in marks}

    def skip(i, j):
        if any(x in covered for x in range(i, j)):
            return True
        if skip_underline and any(under[x] for x in range(i, j)):
            return True
        if any(i < p < j for p in mark_pos):  # 밑줄 경계가 단어 한가운데
            if stats is not None:
                stats.append(("밑줄 경계가 단어 안", P[i:j]))
            return True
        return False

    ops = {i: (j, r) for i, j, r in plan(P, skip, stats)}
    ops.update(rubies)
    out, mi, i = [], 0, 0
    marks = list(marks)
    while i <= len(P):
        while mi < len(marks) and marks[mi][0] == i:
            out.append(marks[mi][1]); mi += 1
        if i == len(P):
            break
        if i in ops:
            j, r = ops[i]
            out.append("{%s|%s}" % (P[i:j], r))
            if report is not None and i not in rubies:
                report.append((P[i:j], r))
            # 후리가나 안쪽에 밑줄 경계가 있으면 순서 보존을 위해 (드문 경우) 경계를 바깥으로
            while mi < len(marks) and i < marks[mi][0] < j:
                out.append(marks[mi][1]); mi += 1
            i = j
        else:
            out.append(P[i]); i += 1
    return "".join(out)


HTML_TAG = re.compile(r"(<[^>]+>)")


def annotate_html(html: str, stats=None, report=None) -> str:
    """passage_html: 태그는 건드리지 않고 글 부분에만 <ruby> 를 단다. 이미 <ruby> 안은 건너뛴다."""
    parts, in_ruby, out = HTML_TAG.split(html), 0, []
    for p in parts:
        if p.startswith("<"):
            low = p.lower()
            if low.startswith("<ruby"):
                in_ruby += 1
            elif low.startswith("</ruby"):
                in_ruby = max(0, in_ruby - 1)
            out.append(p)
        elif in_ruby or not any(is_hard(c) for c in p):
            out.append(p)
        else:
            m = annotate(p, False, stats, report)
            out.append(RUBY_RE.sub(lambda r: f"<ruby>{r.group(1)}<rt>{r.group(2)}</rt></ruby>", m))
    return "".join(out)


def html_uncovered(html: str):
    out, in_ruby = [], 0
    for p in HTML_TAG.split(html):
        if p.startswith("<"):
            low = p.lower()
            if low.startswith("<ruby"):
                in_ruby += 1
            elif low.startswith("</ruby"):
                in_ruby = max(0, in_ruby - 1)
        elif not in_ruby:
            out += uncovered(p)
    return out


# ───────────── 문제 한 개에 적용 ─────────────
def fields(item):
    """(함수로 값을 읽고 쓰는) 대상 필드들: (설명, 현재값, 쓰기, 옵션)"""
    t = item.get("type")
    leak = t in NO_ANSWER_LEAK

    def slot(container, key, label, **opt):
        if isinstance(container.get(key), str):
            yield (label, container[key], lambda v, c=container, k=key: c.__setitem__(k, v), opt)

    def slot_list(container, key, label, **opt):
        for n, v in enumerate(container.get(key) or []):
            if isinstance(v, str):
                yield (f"{label}[{n}]", v, lambda x, c=container[key], i=n: c.__setitem__(i, x), opt)

    yield from slot(item, "instruction", "instruction")
    yield from slot(item, "passage", "passage")
    yield from slot(item, "passage_html", "passage_html", html=True)
    for qi, q in enumerate(item.get("questions") or []):
        w = f"q{qi + 1}"
        yield from slot(q, "stem", f"{w}.stem", skip_underline=(t == "kanji_reading"))
        if t != "orthography":  # 표기 문제의 선택지는 한자 자체가 정답이라 달지 않는다
            yield from slot_list(q, "choices", f"{w}.choices")
        if t != "orthography":
            yield from slot(q, "full", f"{w}.full", skip_underline=leak)
        e = q.get("explanation") or {}
        if not leak:
            yield from slot(e, "point", f"{w}.point")
            yield from slot_list(e, "choices", f"{w}.expl_choices")


def apply_item(item, stats=None, report=None):
    changed = 0
    for label, val, setter, opt in fields(item):
        if opt.get("html"):
            new = annotate_html(val, stats, report)
        else:
            new = annotate(val, opt.get("skip_underline", False), stats, report)
        if new != val:
            setter(new); changed += 1
    return changed


def missing_in_item(item):
    out = []
    for label, val, _s, opt in fields(item):
        miss = html_uncovered(val) if opt.get("html") else uncovered(val, opt.get("skip_underline", False))
        out += [(label, m) for m in miss]
    return out


# ───────────── 파일 입출력 ─────────────
def dump(path: Path, data):
    s0 = path.read_text(encoding="utf-8")
    lines = s0.split("\n")
    ind = len(lines[1]) - len(lines[1].lstrip()) if len(lines) > 1 else 1
    path.write_text(json.dumps(data, ensure_ascii=False, indent=ind or 1) + ("\n" if s0.endswith("\n") else ""), encoding="utf-8")


def main(argv):
    check = "--check" in argv
    want_grammar = "--grammar" in argv
    show = "--report" in argv
    paths = [Path(a) for a in argv if not a.startswith("--")] or sorted(POOL_DIR.glob("*.json"))
    if check:
        bad = 0
        for p in paths:
            for it in json.loads(p.read_text(encoding="utf-8")).get("items", []):
                for label, m in missing_in_item(it):
                    print(f"{p.name} {it.get('id')} {label}: 후리가나 없음 「{m}」"); bad += 1
        if want_grammar:
            for e in json.loads((ROOT / "data" / "grammar.json").read_text(encoding="utf-8")).get("entries", []):
                for n, x in enumerate(e.get("ex", [])):
                    for m in uncovered(x["ja"]):
                        print(f"grammar {e['id']} ex[{n}]: 후리가나 없음 「{m}」"); bad += 1
        print("OK 후리가나 누락 없음" if not bad else f"후리가나 누락 {bad}곳 — python scripts/furigana.py 로 달아 주세요")
        return 1 if bad else 0

    stats, report, total = [], [], 0
    for p in paths:
        data = json.loads(p.read_text(encoding="utf-8"))
        n = sum(apply_item(it, stats, report) for it in data.get("items", []))
        if n:
            dump(p, data)
        print(f"{p.name}: {n}곳")
        total += n
    if want_grammar:  # 파일 모양을 유지하려고 "ja": "..." 글자만 바꾼다
        gp = ROOT / "data" / "grammar.json"
        raw, cnt = gp.read_text(encoding="utf-8"), [0]

        def sub(m):
            old_v = json.loads(m.group(2))
            new_v = annotate(old_v, False, stats, report)
            if new_v != old_v:
                cnt[0] += 1
            return m.group(1) + json.dumps(new_v, ensure_ascii=False)
        gp.write_text(re.sub(r'("ja": )("(?:[^"\\]|\\.)*")', sub, raw), encoding="utf-8")
        print(f"grammar.json 예문: {cnt[0]}곳")
    for kind, s in stats:
        print(f"⚠ {kind}: {s}")
    if show:
        seen = {}
        for w, r in report:
            seen.setdefault((w, r), 0); seen[(w, r)] += 1
        for (w, r), c in sorted(seen.items()):
            print(f"  {w}\t{r}\t×{c}")
    print(f"총 {total}곳 수정, 경고 {len(stats)}건")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
