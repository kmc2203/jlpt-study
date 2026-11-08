"""한자 풀이(data/notes/*.json) 검사: 풀이 속 {요소} 가 모두 획 데이터로 풀리고, 모든 한자에 획 데이터가 있어야 한다.
풀이가 아직 없는 한자는 허용한다(단계적으로 채우는 중). 다 채워지면 COMPLETE 를 True 로 바꿔 전부 있어야 통과하게 한다."""
import json, pathlib, re, unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
COMPLETE = True


def files():
    return json.loads((ROOT / "data/kanji/index.json").read_text(encoding="utf-8"))["files"]


class KanjiNotes(unittest.TestCase):
    def test_every_kanji_has_stroke_data(self):
        for f in files():
            for c in json.loads((ROOT / "data/kanji" / f).read_text(encoding="utf-8"))["kanji"]:
                p = ROOT / "data/strokes" / f"{ord(c['k']):05x}.json"
                self.assertTrue(p.exists(), f"{c['k']} 획 데이터 없음")
                d = json.loads(p.read_text(encoding="utf-8"))
                self.assertGreater(len(d["strokes"]), 0, c["k"])

    def test_notes_tokens_resolve(self):
        for f in files():
            cards = {c["k"] for c in json.loads((ROOT / "data/kanji" / f).read_text(encoding="utf-8"))["kanji"]}
            nf = ROOT / "data/notes" / f
            notes = json.loads(nf.read_text(encoding="utf-8"))["notes"] if nf.exists() else {}
            if COMPLETE:
                self.assertEqual(set(notes), cards, f"{f}: 풀이가 없는 한자")
            for k, text in notes.items():
                self.assertIn(k, cards, f"{f}: {k} 는 이 학년 파일의 한자가 아님")
                self.assertTrue(10 <= len(text) <= 200, f"{k}: 풀이 길이")
                self.assertEqual(text.count("{"), text.count("}"), f"{k}: 중괄호 짝")
                d = json.loads((ROOT / "data/strokes" / f"{ord(k):05x}.json").read_text(encoding="utf-8"))
                els = {p["el"] for p in d["parts"]}
                for m in re.finditer(r"\{([^}:]+)(?::([^}]+))?\}", text):
                    spec = m.group(2) or m.group(1)
                    r = re.fullmatch(r"(\d+)-(\d+)", spec)
                    if r:
                        self.assertTrue(int(r[1]) <= int(r[2]) < len(d["strokes"]), f"{k}: 획 범위 {spec}")
                    else:
                        self.assertIn(spec, els, f"{k}: 요소 {spec} 가 획 데이터에 없음")


if __name__ == "__main__":
    unittest.main()
