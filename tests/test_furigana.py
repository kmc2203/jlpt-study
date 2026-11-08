"""후리가나 자동 달기 (scripts/furigana.py) 규칙 테스트."""
import copy
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("furigana", ROOT / "scripts" / "furigana.py")
F = importlib.util.module_from_spec(spec)
spec.loader.exec_module(F)


class FuriganaTest(unittest.TestCase):
    def test_only_beyond_n2(self):
        # 景気・回復는 N2 범위라 그대로, 促(N1급)만 달린다. 送り仮名 す 는 밖으로
        self.assertEqual(F.annotate("景気の回復を促す。"), "景気の回復を{促|うなが}す。")
        self.assertEqual(F.annotate("毎日学校へ行く"), "毎日学校へ行く")

    def test_okurigana_and_compound(self):
        self.assertEqual(F.annotate("条件を勘違いする"), "条件を{勘違|かんちが}いする")
        self.assertEqual(F.annotate("気持ちを抑える"), "気持ちを{抑|おさ}える")

    def test_manual_ruby_is_kept(self):
        t = "{促|そく}す"
        self.assertEqual(F.annotate(t), t)

    def test_idempotent(self):
        once = F.annotate("彼は態度を改めた。")
        self.assertEqual(F.annotate(once), once)

    def test_underline_in_reading_question_is_skipped(self):
        t = "彼の[[態度]]は良かった。"
        self.assertEqual(F.annotate(t, skip_underline=True), t)
        self.assertIn("{態度|たいど}", F.annotate(t))

    def test_underline_marks_stay_outside(self):
        self.assertEqual(F.annotate("[[態度]]を見せる"), "[[{態度|たいど}]]を見せる")

    def test_uncovered(self):
        self.assertEqual(F.uncovered("注意を促す"), ["促"])
        self.assertEqual(F.uncovered("注意を{促|うなが}す"), [])

    def test_item_rules(self):
        q = lambda t: {"id": "x-001", "type": t, "instruction": "x", "questions": [{
            "stem": "[[態度]]を見せる", "choices": ["態度", "対度", "体度", "代度"], "answer": 0,
            "explanation": {"point": "態度の意味", "choices": ["○ 態度", "× 対度", "× 体度", "× 代度"]}}]}
        orth = q("orthography"); F.apply_item(orth)
        self.assertEqual(orth["questions"][0]["choices"], ["態度", "対度", "体度", "代度"])  # 정답이 보이는 선택지는 그대로
        self.assertEqual(orth["questions"][0]["explanation"]["point"], "態度の意味")
        read = q("kanji_reading"); F.apply_item(read)
        self.assertEqual(read["questions"][0]["stem"], "[[態度]]を見せる")                # 읽기 문제의 밑줄
        ctx = q("context"); F.apply_item(ctx)
        self.assertEqual(ctx["questions"][0]["choices"][0], "{態度|たいど}")              # 그 밖의 선택지는 단다
        self.assertEqual(F.missing_in_item(ctx), [])

    def test_html_passage(self):
        out = F.annotate_html("<p>契約書を提出する</p>")
        self.assertIn("<ruby>契約<rt>けいやく</rt></ruby>", out)
        self.assertEqual(F.annotate_html(out), out)

    def test_real_pool_has_no_missing(self):
        r = subprocess.run([sys.executable, "-I", str(ROOT / "scripts" / "furigana.py"), "--check", "--grammar"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=1)
