"""한자 카드 데이터(data/kanji/*.json)의 구조 검사. 사전 대조는 scripts/build_kanji.py 가 생성할 때 이미 한다."""
import json, pathlib, re, unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
KANJI = re.compile(r"[㐀-䶿一-鿿]")


def cards():
    index = json.loads((ROOT / "data/kanji/index.json").read_text(encoding="utf-8"))
    for f in index["files"]:
        yield from json.loads((ROOT / "data/kanji" / f).read_text(encoding="utf-8"))["kanji"]


class KanjiData(unittest.TestCase):
    def test_grade1_has_80_unique(self):
        g1 = [c["k"] for c in cards() if c["grade"] == 1]
        self.assertEqual(len(g1), 80)
        self.assertEqual(len(set(g1)), 80)

    def test_grade2_has_160(self):
        g2 = [c["k"] for c in cards() if c["grade"] == 2]
        self.assertEqual(len(g2), 160)
        self.assertEqual(len(set(g2)), 160)

    def test_grade3_has_200(self):
        g3 = [c["k"] for c in cards() if c["grade"] == 3]
        self.assertEqual(len(g3), 200)
        self.assertEqual(len(set(g3)), 200)

    def test_grade4_has_220(self):
        g4 = [c["k"] for c in cards() if c["grade"] == 4]
        self.assertEqual(len(g4), 220)
        self.assertEqual(len(set(g4)), 220)

    def test_every_card_is_complete(self):
        seen = set()
        for c in cards():
            k = c["k"]
            self.assertEqual(len(k), 1, k)
            self.assertNotIn(k, seen, f"중복 {k}"); seen.add(k)
            self.assertRegex(c["hunum"], r"^[가-힣 ]+ [가-힣](\([가-힣]\))?$", k)
            self.assertTrue(c["meaning"] and all(c["meaning"]), k)
            self.assertTrue(c["on"] or c["kun"], f"{k}: 음독·훈독이 모두 없음")
            self.assertIsInstance(c["kun"], list, k)
            self.assertTrue(1 <= c["radical"] <= 214 and c["radical_ch"], k)
            self.assertGreater(c["strokes"], 0, k)
            self.assertGreaterEqual(len(c["words"]), 3, k)
            for w in c["words"]:
                self.assertIn(k, w["w"], f"{k}: 단어 {w['w']} 에 한자 없음")
                self.assertTrue(w["r"] and w["m"], k)
                self.assertRegex(w["r"], r"^[ぁ-ゟー]+$", f"{k}: 읽기는 히라가나 {w['r']}")
                self.assertIsNone(re.search(r"[A-Za-z]", w["m"]), f"{k}: 뜻에 영어 {w['m']}")


if __name__ == "__main__":
    unittest.main()
