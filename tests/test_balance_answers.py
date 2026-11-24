"""정답 번호 균형(scripts/balance_answers.py) 테스트."""
import copy
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("balance_answers", ROOT / "scripts" / "balance_answers.py")
BA = importlib.util.module_from_spec(spec)
spec.loader.exec_module(BA)


def sample():
    return {
        "choices": ["あ", "い", "う", "え"], "answer": 0,
        "explanation": {"choice_meanings": ["1", "2", "3", "4"], "choices": ["a", "b", "c", "d"], "choices_ko": ["가", "나", "다", "라"]},
    }


class BalanceTest(unittest.TestCase):
    def test_permute_keeps_everything_aligned(self):
        q = sample()
        BA.permute(q, [2, 0, 3, 1])  # 새 자리 i 에 원래 perm[i]
        self.assertEqual(q["choices"], ["う", "あ", "え", "い"])
        self.assertEqual(q["answer"], 1)
        self.assertEqual(q["choices"][q["answer"]], "あ")
        ex = q["explanation"]
        self.assertEqual(ex["choice_meanings"][q["answer"]], "1")
        self.assertEqual(ex["choices"][q["answer"]], "a")
        self.assertEqual(ex["choices_ko"][q["answer"]], "가")

    def test_movable_rules(self):
        q = sample()
        self.assertTrue(BA.movable({"type": "grammar"}, q))
        self.assertFalse(BA.movable({"type": "sentence_order"}, q))
        self.assertFalse(BA.movable({"type": "info_search"}, q))
        price = dict(q, choices=["2,250円", "2,400円", "2,500円", "2,650円"])
        self.assertFalse(BA.movable({"type": "reading_short"}, price))
        lettered = dict(q, choices=["Aパスタ", "Bカレー", "Cそば", "どれも選べない"])
        self.assertFalse(BA.movable({"type": "reading_short"}, lettered))

    def test_real_pool_is_not_skewed(self):
        c = [0, 0, 0, 0]
        for f in (ROOT / "data" / "pool").glob("*.json"):
            for item in json.loads(f.read_text(encoding="utf-8"))["items"]:
                for q in item["questions"]:
                    c[q["answer"]] += 1
        n = sum(c)
        for i, v in enumerate(c):
            self.assertGreater(v / n, 0.15, f"{i + 1}번이 너무 적음: {c}")
            self.assertLess(v / n, 0.40, f"{i + 1}번이 너무 많음: {c}")


if __name__ == "__main__":
    unittest.main()
