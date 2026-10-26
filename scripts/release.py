#!/usr/bin/env python3
"""매일 아침 실행: 문제 풀에서 새 문제를 '공개'로 표시하고 data/manifest.json 을 갱신한다.

    python scripts/release.py                # 오늘 분량(기본 5개) 공개
    python scripts/release.py --count 10     # 10개 공개
    python scripts/release.py --count 0      # 공개는 하지 않고 batches 목록만 동기화
    python scripts/release.py --force        # 오늘 이미 공개했어도 한 번 더 공개

- 같은 날 두 번 실행해도 중복 공개되지 않는다(--force 제외).
- 유형(문법/어휘/독해…)이 한쪽으로 몰리지 않도록 유형별로 번갈아 고른다.
- 날짜는 한국 시간(KST) 기준.
"""
import argparse
import json
import os
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
POOL = DATA / "pool"
MANIFEST = DATA / "manifest.json"
KST = timezone(timedelta(hours=9))


def load_pool():
    """[(배치 상대경로, 아이템)] 을 파일명 순서대로."""
    out = []
    for p in sorted(POOL.glob("*.json")):
        data = json.loads(p.read_text(encoding="utf-8"))
        for item in data.get("items", []):
            out.append((f"pool/{p.name}", item))
    return out


def pick(unreleased, n, released_by_type):
    """유형별로 번갈아 n개 고른다. 오늘 이미 고른 수가 적은 유형, 지금까지 공개가 적은 유형을 우선."""
    chosen, today_count = [], Counter()
    remaining = list(unreleased)
    while len(chosen) < n and remaining:
        types = sorted({it["type"] for it in remaining},
                       key=lambda t: (today_count[t], released_by_type[t], t))
        t = types[0]
        idx = next(i for i, it in enumerate(remaining) if it["type"] == t)
        item = remaining.pop(idx)
        chosen.append(item)
        today_count[t] += 1
    return chosen


def set_output(key, value):
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"{key}={value}\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=int(os.environ.get("DAILY_COUNT", "5") or 5))
    ap.add_argument("--date", default=datetime.now(KST).strftime("%Y-%m-%d"))
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    pool = load_pool()
    ids = {it["id"] for _, it in pool}
    batches = sorted({b for b, _ in pool})

    old = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    released = {k: v for k, v in old.get("released", {}).items() if k in ids}  # 삭제된 문제 정리
    updated = old.get("updated", "")

    by_type = {it["id"]: it["type"] for _, it in pool}
    released_by_type = Counter(by_type[i] for i in released)

    new_ids = []
    if args.count > 0:
        if not args.force and args.date in released.values():
            print(f"{args.date} 분량은 이미 공개되어 있어 건너뜁니다. (--force 로 강제 가능)")
        else:
            unreleased = [it for _, it in pool if it["id"] not in released]
            for it in pick(unreleased, args.count, released_by_type):
                released[it["id"]] = args.date
                new_ids.append(it["id"])
            updated = args.date

    remaining = sum(1 for _, it in pool if it["id"] not in released)
    manifest = {
        "updated": updated,
        "batches": batches,
        "released": dict(sorted(released.items(), key=lambda kv: (kv[1], kv[0]))),
    }
    text = json.dumps(manifest, ensure_ascii=False, indent=1) + "\n"
    if not MANIFEST.exists() or MANIFEST.read_text(encoding="utf-8") != text:
        MANIFEST.write_text(text, encoding="utf-8")

    daily = args.count if args.count > 0 else int(os.environ.get("DAILY_COUNT", "5") or 5)
    days_left = remaining // max(daily, 1)
    print(f"공개 {len(new_ids)}개 {new_ids} / 풀 전체 {len(pool)}개 / 미공개 {remaining}개 (약 {days_left}일치)")
    if remaining == 0:
        print("::warning::문제 풀이 모두 소진되었습니다. 새 batch 파일을 추가해 주세요.")
    set_output("released_today", len(new_ids))
    set_output("remaining", remaining)
    set_output("days_left", days_left)
    return 0


if __name__ == "__main__":
    sys.exit(main())
