#!/usr/bin/env python3
"""한자 카드의 뜻(meaning 태그)에 뜻을 덧붙인다. 사용: python3 scripts/add_meanings.py < 줄단위입력
입력 한 줄 = '한자|뜻1/뜻2/…'. 이미 있는 뜻은 건너뛰고, 순서대로 뒤에 붙인다(앞의 대표 뜻은 그대로)."""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
files = {}
where = {}
for f in json.loads((ROOT / 'data/kanji/index.json').read_text('utf-8'))['files']:
    d = json.loads((ROOT / 'data/kanji' / f).read_text('utf-8'))
    files[f] = d
    for c in d['kanji']: where[c['k']] = c
added = skipped = 0
for line in sys.stdin.read().splitlines():
    if not line.strip(): continue
    k, _, rest = line.partition('|')
    k = k.strip()
    if k not in where: print('없는 한자', k); continue
    m = where[k]['meaning']
    for x in [t.strip() for t in rest.split('/') if t.strip()]:
        if x in m: skipped += 1; continue
        m.append(x); added += 1
for f, d in files.items():
    # 파일 형식(한자 한 줄씩)을 그대로 유지한다
    rows = [f'    {json.dumps(c, ensure_ascii=False)}' for c in d['kanji']]
    head = [f'  "{k}": {json.dumps(v, ensure_ascii=False)},' for k, v in d.items() if k != 'kanji']
    (ROOT / 'data/kanji' / f).write_text('{\n' + '\n'.join(head) + '\n  "kanji": [\n' + ',\n'.join(rows) + '\n  ]\n}\n', 'utf-8')
print(f'추가 {added}, 중복 건너뜀 {skipped}')
