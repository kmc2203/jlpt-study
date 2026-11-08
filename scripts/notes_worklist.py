#!/usr/bin/env python3
"""풀이를 쓸 때 보는 작업 목록. 사용: python3 scripts/notes_worklist.py grade-1.json [시작 [개수]]
한자 | 훈음 | 뜻 | 구성 요소(획 범위) 를 한 줄씩 보여 준다. 이미 풀이가 있는 한자는 건너뛴다."""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
f = sys.argv[1]
start = int(sys.argv[2]) if len(sys.argv) > 2 else 0
n = int(sys.argv[3]) if len(sys.argv) > 3 else 60
cards = json.loads((ROOT / 'data/kanji' / f).read_text('utf-8'))['kanji']
nf = ROOT / 'data/notes' / f
notes = json.loads(nf.read_text('utf-8'))['notes'] if nf.exists() else {}
todo = [c for c in cards if c['k'] not in notes]
print(f'{f}: 전체 {len(cards)}, 풀이 있음 {len(cards)-len(todo)}, 남음 {len(todo)}')
for c in todo[start:start + n]:
    sp = ROOT / 'data/strokes' / f'{ord(c["k"]):05x}.json'
    d = json.loads(sp.read_text('utf-8'))
    seen, parts = set(), []
    for p in d['parts']:
        key = (p['el'], p['from'], p['to'])
        if key in seen: continue
        seen.add(key)
        parts.append(f"{p['el']}[{p['from']}-{p['to']}]" if p['from'] != p['to'] else f"{p['el']}[{p['from']}]")
    print(f"{c['k']} | {c['hunum']} | {'/'.join(c['meaning'])} | {c['strokes']}획 | {' '.join(parts) or '-'}")
