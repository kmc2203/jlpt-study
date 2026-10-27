#!/usr/bin/env python3
"""한자 카드 데이터 생성기 (개발자용, 앱 배포와는 무관)

사용법:
  python3 -I scripts/build_kanji.py <jamdict.db> scripts/kanji_src/grade-1.ko.json data/kanji/grade-1.json

공개 데이터(KANJIDIC2 를 담은 jamdict.db)에서 음독·한국 한자음·획수·부수를 채우고,
직접 작성한 한국어 훈음·뜻·대표 단어(.ko.json)와 합친다. 합치기 전에 아래를 대조해서 어긋나면 실패한다.
  - 학년의 한자 집합이 정확히 같은가
  - 훈음의 한자음이 사전의 한국 한자음과 일치하는가 (두음법칙 표기는 괄호로 허용)
  - 훈독이 사전 훈독의 부분집합인가
  - 대표 단어가 그 한자를 포함하는가, JMdict 에 같은 표기·읽기로 있는가(없으면 경고)

데이터 출처: KANJIDIC2 / JMdict — (c) Electronic Dictionary Research and Development Group, CC BY-SA 4.0
"""
import json, re, sqlite3, sys, unicodedata


def main(db, src, out):
    ko = json.load(open(src, encoding="utf-8"))
    grade = ko["grade"]
    c = sqlite3.connect(db)
    errs, warns, cards = [], [], []

    rows = c.execute("select ID, literal, stroke_count from character where grade=? order by ID", (str(grade),)).fetchall()
    want = [r[1] for r in rows]
    if ko.get("part"):  # 학년 일부만 담은 분할 파일: 작성본이 학년 집합의 부분집합이면 된다(전체 합계는 테스트가 확인)
        extra = sorted(set(ko["kanji"]) - set(want))
        if extra:
            errs.append(f"사전의 {grade}학년에 없는 한자: {extra}")
        want = [k for k in ko["kanji"] if k in set(want)]
        rows = sorted(rows, key=lambda r: want.index(r[1]) if r[1] in want else 10**9)
        rows = [r for r in rows if r[1] in want]
    elif set(want) != set(ko["kanji"]):
        errs.append(f"한자 집합 불일치: 사전에만 {sorted(set(want) - set(ko['kanji']))} / 작성본에만 {sorted(set(ko['kanji']) - set(want))}")

    def readings(cid, kind):
        return [v for (v,) in c.execute(
            "select r.value from reading r join rm_group g on r.gid=g.ID where g.cid=? and r.r_type=? order by r.rowid", (cid, kind))]

    for cid, lit, strokes in rows:
        a = ko["kanji"].get(lit)
        if not a:
            continue
        on, kun_all, hangul = readings(cid, "ja_on"), readings(cid, "ja_kun"), readings(cid, "korean_h")
        rad = int(c.execute("select value from radical where cid=? and rad_type='classical'", (cid,)).fetchone()[0])
        rad_ch = unicodedata.normalize("NFKC", chr(0x2F00 + rad - 1))

        # 훈음: "쉴 휴", "계집 녀(여)" → 한자음 = 마지막 어절에서 괄호 앞부분
        m = re.fullmatch(r"(\S+(?: \S+)*) ([가-힣])(?:\(([가-힣])\))?", a["hunum"])
        if not m:
            errs.append(f"{lit}: 훈음 형식 오류 {a['hunum']!r}")
            continue
        sound = m.group(2)
        if not hangul:
            warns.append(f"{lit}: 사전에 한국 한자음이 없어 훈음의 한자음 {sound!r} 은 대조하지 못함")
        elif sound not in hangul and a.get("sound_override"):
            warns.append(f"{lit}: 한자음 {sound!r} 은 사전({hangul})과 다르지만 예외 허용 — {a['sound_override']}")
        elif sound not in hangul:
            errs.append(f"{lit}: 훈음의 한자음 {sound!r} 가 사전({hangul})에 없음")
        bad = [k for k in a["kun"] if k not in kun_all]
        if bad:
            errs.append(f"{lit}: 훈독 {bad} 가 사전({kun_all})에 없음")

        words = []
        for w, r, meaning in a["words"]:
            if lit not in w:
                errs.append(f"{lit}: 단어 {w} 에 한자가 없음")
            hit = c.execute(
                "select e.idseq from Kanji k join Kana a on a.idseq=k.idseq join Entry e on e.idseq=k.idseq where k.text=? and a.text=?",
                (w, r)).fetchone()
            if not hit:
                warns.append(f"{lit}: {w}({r}) 가 JMdict 에 같은 표기·읽기로 없음")
            words.append({"w": w, "r": r, "m": meaning})
        if len(words) < 3:
            errs.append(f"{lit}: 대표 단어 3개 미만")

        cards.append({
            "k": lit, "hunum": a["hunum"], "meaning": a["meaning"], "on": on, "kun": a["kun"],
            "radical": rad, "radical_ch": rad_ch, "strokes": strokes, "grade": grade, "words": words,
        })

    for e in errs: print("오류:", e)
    for w in warns: print("경고:", w)
    if errs:
        sys.exit(1)

    order = {ch: i for i, ch in enumerate(want)}
    cards.sort(key=lambda x: order[x["k"]])
    with open(out, "w", encoding="utf-8") as f:
        f.write('{\n  "grade": %d,\n  "source": "KANJIDIC2/JMdict (c) EDRDG, CC BY-SA 4.0; 한국어 훈음·뜻·단어는 직접 작성",\n  "kanji": [\n' % grade)
        f.write(",\n".join("    " + json.dumps(x, ensure_ascii=False, separators=(", ", ": ")) for x in cards))
        f.write("\n  ]\n}\n")
    print(f"완료: {len(cards)}자, 경고 {len(warns)}건 → {out}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
