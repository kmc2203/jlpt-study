#!/usr/bin/env python3
"""정답 번호가 한쪽(특히 1번)으로 쏠리지 않도록 선택지 순서를 섞는다.

    python scripts/balance_answers.py --stats                    # 현재 정답 번호 분포
    python scripts/balance_answers.py pool/batch-019.json        # 이 batch 의 정답 위치를 전체 분포가 고르게 되도록 재배치
    python scripts/balance_answers.py --all                      # 풀 전체를 재배치 (한 번만. 이미 공개된 문제의 선택지 순서가 바뀐다)

규칙
- 선택지와 같은 순서로 맞물린 필드(choice_meanings, explanation.choices, explanation.choices_ko)를 함께 옮기고 answer 를 고친다.
- 건드리지 않는 것: sentence_order(조각 배열 order 가 인덱스에 묶임), info_search,
  선택지가 숫자·시각·금액뿐이거나 A/B/C 로 시작하는 문제(순서 자체에 의미가 있음).
- 대상 문항마다 지금까지 가장 적게 나온 정답 번호를 목표로 잡고, 정답을 거기에 놓은 뒤 나머지 선택지를 섞는다(결과는 문항 ID 로 고정, 매번 같다).
- 이미 한 번 섞은 batch 에 다시 돌리면 또 섞인다(멱등 아님). 새 batch 를 만든 직후 한 번만 실행한다.
"""
import json
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POOL = ROOT / "data" / "pool"
SKIP_TYPES = {"sentence_order", "info_search"}
NUMERIC = re.compile(r"[0-9０-９,，.．円時分秒%％年月日:：~〜、\s冊枚個回人台歳]+")
LETTERED = re.compile(r"^[A-DＡ-Ｄ]")


def movable(item, q):
    if item.get("type") in SKIP_TYPES or len(q["choices"]) != 4:
        return False
    ch = [re.sub(r"\{([^{}|]+)\|[^{}]+\}", r"\1", c) for c in q["choices"]]
    if all(NUMERIC.fullmatch(c) for c in ch):
        return False
    if any(LETTERED.match(c) for c in ch):
        return False
    return True


def permute(q, perm):
    """perm[i] = 새 자리 i 에 오는 원래 선택지 번호."""
    q["choices"] = [q["choices"][j] for j in perm]
    ex = q.get("explanation", {})
    for key in ("choice_meanings", "choices", "choices_ko"):
        if isinstance(ex.get(key), list) and len(ex[key]) == len(perm):
            ex[key] = [ex[key][j] for j in perm]
    q["answer"] = perm.index(q["answer"])


def balance(files, all_files):
    data = {f: json.loads(f.read_text(encoding="utf-8")) for f in all_files}
    tally = [0, 0, 0, 0]
    todo = []
    for f, d in data.items():
        for item in d["items"]:
            for qi, q in enumerate(item["questions"]):
                if f in files and movable(item, q):
                    todo.append((item, qi, q))
                else:
                    tally[q["answer"]] += 1
    for item, qi, q in todo:
        rnd = random.Random(f"{item['id']}:{qi}")
        low = min(tally)
        target = rnd.choice([i for i, n in enumerate(tally) if n == low])
        tally[target] += 1
        others = [j for j in range(4) if j != q["answer"]]
        rnd.shuffle(others)
        perm = others[:target] + [q["answer"]] + others[target:]
        permute(q, perm)
    for f in files:
        f.write_text(json.dumps(data[f], ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return len(todo)


def stats():
    c = [0, 0, 0, 0]
    for f in sorted(POOL.glob("*.json")):
        for item in json.loads(f.read_text(encoding="utf-8"))["items"]:
            for q in item["questions"]:
                c[q["answer"]] += 1
    n = sum(c)
    print("정답 번호 분포 (전체 %d문항): " % n + "  ".join(f"{i + 1}번 {c[i]}({round(c[i] / n * 100)}%)" for i in range(4)))


def main(argv):
    if "--stats" in argv:
        stats(); return 0
    allf = sorted(POOL.glob("*.json"))
    if "--all" in argv:
        files = allf
    else:
        names = [a for a in argv if not a.startswith("--")]
        if not names:
            print(__doc__); return 1
        files = [ROOT / "data" / n for n in names]
        for f in files:
            if f not in allf:
                print("없는 파일:", f); return 1
    n = balance(files, allf)
    print(f"{n}개 문항의 선택지 순서를 섞었어요.")
    stats()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
