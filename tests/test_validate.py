"""validate.py 가 잘못된 문제를 실제로 걸러내는지 확인한다. (python3 tests/test_validate.py)"""
import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VALIDATE = ROOT / "scripts" / "validate.py"


def good_grammar(i="gr-901"):
    return {
        "id": i, "type": "grammar", "level": "N2", "instruction": "x",
        "questions": [{
            "stem": "雨が降った（　）、試合は中止になった。",
            "choices": ["ために", "くせに", "ものの", "わりに"], "answer": 0,
            "full": "雨が降ったために、試合は中止になった。",
            "explanation": {"translation": "비가 와서 경기는 취소되었다.", "point": "原因を表す。", "words": [{"w": "中止", "m": "중지"}]},
        }],
    }


def good_order(i="so-901"):
    return {
        "id": i, "type": "sentence_order", "level": "N2", "instruction": "x",
        "questions": [{
            "stem": "私は ＿＿＿ ＿＿＿ ★ ＿＿＿ 行く。",
            "choices": ["毎日", "図書館へ", "勉強しに", "必ず"], "answer": 0,
            "order": [3, 1, 0, 2],
            "full": "私は必ず図書館へ毎日勉強しに行く。",
            "explanation": {"translation": "나는 반드시 도서관에 매일 공부하러 간다.", "point": "語順。", "words": [{"w": "図書館", "m": "도서관"}]},
        }],
    }


def run(items):
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "batch-test.json"
        p.write_text(json.dumps({"items": items}, ensure_ascii=False), encoding="utf-8")
        r = subprocess.run([sys.executable, "-I", str(VALIDATE), str(p)], capture_output=True, text=True)
        return r.returncode, r.stdout + r.stderr


class ValidateTest(unittest.TestCase):
    def test_real_pool_is_valid(self):
        r = subprocess.run([sys.executable, "-I", str(VALIDATE)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_good_items_pass(self):
        code, out = run([good_grammar(), good_order()])
        self.assertEqual(code, 0, out)

    def test_answer_out_of_range(self):
        g = good_grammar(); g["questions"][0]["answer"] = 4
        self.assertEqual(run([g])[0], 1)

    def test_full_mismatch_is_caught(self):
        g = good_grammar(); g["questions"][0]["answer"] = 1  # くせに 로 바꾸면 full 과 달라짐
        code, out = run([g])
        self.assertEqual(code, 1); self.assertIn("full", out)

    def test_star_answer_mismatch(self):
        o = good_order(); o["questions"][0]["answer"] = 1
        code, out = run([o])
        self.assertEqual(code, 1); self.assertIn("★", out)

    def test_order_does_not_build_full(self):
        o = good_order(); o["questions"][0]["order"] = [3, 0, 1, 2]
        o["questions"][0]["answer"] = 1  # ★ 위치(3번째)=choices[1]
        code, out = run([o])
        self.assertEqual(code, 1); self.assertIn("조립", out)

    def test_duplicate_choices(self):
        g = good_grammar(); g["questions"][0]["choices"][1] = "ために"
        self.assertEqual(run([g])[0], 1)

    def test_missing_explanation_parts(self):
        g = good_grammar(); del g["questions"][0]["explanation"]["words"]
        self.assertEqual(run([g])[0], 1)

    def test_duplicate_id_with_existing_pool(self):
        self.assertEqual(run([good_grammar("gr-001")])[0], 1)

    def test_duplicate_sentence_with_existing_pool(self):
        pool_item = json.loads((ROOT / "data/pool/batch-002.json").read_text(encoding="utf-8"))["items"][0]
        dup = copy.deepcopy(pool_item); dup["id"] = "gr-902"
        code, out = run([dup])
        self.assertEqual(code, 1); self.assertIn("중복", out)

    def test_dangerous_html(self):
        i = {"id": "is-901", "type": "info_search", "instruction": "x",
             "passage_html": "<p onclick='x()'>hi</p><script>1</script>", "passage_translation": "t",
             "questions": good_grammar()["questions"]}
        self.assertEqual(run([i])[0], 1)


if __name__ == "__main__":
    unittest.main(verbosity=1)
