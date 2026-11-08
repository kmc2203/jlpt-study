#!/usr/bin/env python3
"""풀이를 파일에 합친다. 사용: python3 scripts/add_notes.py grade-1.json < 줄단위입력
입력 한 줄 = '한자|풀이'. 이미 있는 한자는 덮어쓴다. 풀이 속 {요소} 가 획 데이터로 풀리는지 검사하고, 안 풀리면 저장하지 않고 알려 준다."""
import json, re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
f = sys.argv[1]
cards = {c['k'] for c in json.loads((ROOT / 'data/kanji' / f).read_text('utf-8'))['kanji']}
nf = ROOT / 'data/notes' / f
doc = json.loads(nf.read_text('utf-8')) if nf.exists() else {"source": "구성 풀이는 모양을 외우기 위한 암기용 연상 풀이이며 학문적 어원이 아닙니다. 직접 작성", "notes": {}}
bad = []
add = {}
for line in sys.stdin.read().splitlines():
    if not line.strip(): continue
    k, _, text = line.partition('|')
    k, text = k.strip(), text.strip()
    if k not in cards: bad.append(f'{k}: 이 학년 파일에 없는 한자'); continue
    d = json.loads((ROOT / 'data/strokes' / f'{ord(k):05x}.json').read_text('utf-8'))
    els = {p['el'] for p in d['parts']}
    def fix(m):
        # 획 데이터에 없는 요소는 눌러볼 수 없으니 중괄호만 빼고 글자로 남긴다 (경고만 출력)
        label, spec = m.group(1), m.group(2) or m.group(1)
        r = re.fullmatch(r'(\d+)-(\d+)', spec)
        if r:
            if not (int(r[1]) <= int(r[2]) < len(d['strokes'])): bad.append(f'{k}: 획 범위 {spec}')
            return m.group(0)
        if spec in els: return m.group(0)
        print(f'경고 {k}: 요소 {spec} 없음 → 글자로만 표시 (있는 요소: {" ".join(sorted(els)) or "-"})')
        return label
    text = re.sub(r'\{([^}:]+)(?::([^}]+))?\}', fix, text)
    if text.count('{') != text.count('}'): bad.append(f'{k}: 중괄호 짝')
    add[k] = text
if bad:
    print('저장 안 함. 고칠 것:'); print('\n'.join(bad)); sys.exit(1)
doc['notes'].update(add)
order = [c['k'] for c in json.loads((ROOT / 'data/kanji' / f).read_text('utf-8'))['kanji']]
doc['notes'] = {k: doc['notes'][k] for k in order if k in doc['notes']}
nf.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n', 'utf-8')
print(f'저장 {len(add)}개, 이 파일 합계 {len(doc["notes"])}/{len(cards)}')
