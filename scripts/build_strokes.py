#!/usr/bin/env python3
"""KanjiVG(CC BY-SA 3.0, (c) Ulrich Apel) 에서 한자별 획 데이터를 뽑아 data/strokes/<16진수>.json 으로 저장한다.
사용: python3 scripts/build_strokes.py 愛 秋 ...   (인자 없으면 data/kanji/*.json 전체)
저장 형식: {"k","strokes":[path d...],"parts":[{"el","from","to","depth"}]}  (from/to 는 0부터, to 는 포함)
"""
import json, sys, re, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'strokes'
NS = {'s': 'http://www.w3.org/2000/svg'}

def kv(el, name):
    # kvg 네임스페이스 주소가 파일마다 http/https, 끝의 / 유무가 달라서 속성의 이름 끝으로 찾는다
    for a, v in el.attrib.items():
        if a.endswith('}' + name):
            return v
    return None

def fetch(k):
    url = f'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/{ord(k):05x}.svg'
    with urllib.request.urlopen(url, timeout=30) as r:
        return r.read()

def parse(k, raw):
    root = ET.fromstring(raw)
    top = next(g for g in root.iter('{http://www.w3.org/2000/svg}g') if kv(g, 'element'))
    strokes, parts = [], []
    def walk(g, depth):
        for c in g:
            tag = c.tag.split('}')[1]
            if tag == 'path':
                strokes.append(c.get('d'))
            elif tag == 'g':
                start = len(strokes)
                walk(c, depth + 1)
                el = kv(c, 'element')
                if el and len(strokes) > start:
                    parts.append({'el': el, 'from': start, 'to': len(strokes) - 1, 'depth': depth})
    walk(top, 1)
    return {'k': k, 'strokes': strokes, 'parts': parts}

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    chars = sys.argv[1:]
    if not chars:
        for f in sorted((ROOT / 'data' / 'kanji').glob('grade-*.json')):
            chars += [c['k'] for c in json.loads(f.read_text('utf-8'))['kanji']]
    for k in chars:
        p = OUT / f'{ord(k):05x}.json'
        if p.exists():
            continue
        try:
            d = parse(k, fetch(k))
        except Exception as e:
            print('실패', k, e); continue
        p.write_text(json.dumps(d, ensure_ascii=False, separators=(',', ':')), 'utf-8')
        print(k, len(d['strokes']), '획', [x['el'] for x in d['parts']])

if __name__ == '__main__':
    main()
