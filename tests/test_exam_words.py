"""우선 어휘 목록(docs/exam_words.json)과 오늘의 단어 고르기(scripts/exam_words.py) 테스트."""
import importlib.util
import subprocess
import sys
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("exam_words", ROOT / "scripts" / "exam_words.py")
EW = importlib.util.module_from_spec(spec)
spec.loader.exec_module(EW)


class ExamWordsTest(unittest.TestCase):
    def test_list_is_valid(self):
        words = EW.load_words()
        self.assertEqual(EW.check(words), [])
        self.assertGreater(len(words), 300)
        self.assertEqual({w["tier"] for w in words}, {"top", "predict", "freq", "mock"})

    def test_pick_mixes_tiers_and_skips_used(self):
        words = EW.load_words()
        used = {id(w): 0 for w in words}
        got = EW.pick(words, 10, used=used)
        self.assertEqual(len({w["w"] for w in got}), 10, "같은 단어를 두 번 고르지 않음")
        c = Counter(w["tier"] for w in got)
        self.assertEqual((c["top"], c["predict"], c["mock"], c["freq"]), (4, 4, 1, 1), "최빈출:출제예상:모의고사:빈출 = 2:2:0.5:0.5")
        # 이미 나온 단어는 뒤로 밀린다
        first = got[0]
        used[id(first)] = 5
        again = EW.pick(words, 10, used=used)
        self.assertNotIn(first["w"], [w["w"] for w in again[:1]])

    def test_pick_respects_kinds(self):
        words = EW.load_words()
        used = {id(w): 0 for w in words}
        for w in EW.pick(words, 6, kinds=("hyoki",), need_kanji=True, used=used):
            self.assertEqual(w["kind"], "hyoki")
            self.assertRegex(w["w"], EW.KANJI)

    def test_cli(self):
        r = subprocess.run([sys.executable, "-I", str(ROOT / "scripts" / "exam_words.py"), "--pick"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("kanji_reading", r.stdout)
        self.assertIn("orthography", r.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=1)
