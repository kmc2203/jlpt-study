# 문제 풀 만드는 법 (Claude 채팅 사용)

한 달에 한두 번, 아래 순서로 문제 풀을 채우면 됩니다. API 비용은 들지 않아요.

1. 터미널에서 `python scripts/validate.py` 를 실행해 마지막 줄의 **「다음에 쓸 ID」** 를 확인합니다.
2. Claude 채팅에 아래 **프롬프트**를 붙여넣고 `{...}` 부분만 채워서 보냅니다.
   (중복을 줄이려면 `data/pool/` 의 기존 batch 파일을 함께 첨부하세요.)
3. 받은 JSON을 `data/pool/batch-004.json` 처럼 **새 파일**로 저장합니다. (기존 파일은 수정하지 않기)
4. `python scripts/validate.py` 로 검사 → 오류가 나면 메시지를 Claude에게 그대로 붙여넣어 고치게 합니다.
5. 커밋 & 푸시. 다음 배포 때 자동으로 풀에 합류하고, 매일 아침 일부씩 공개됩니다.

> `validate.py` 는 스키마, 정답 번호, 빈칸에 정답을 넣은 문장(`full`)과의 일치, ★ 배열 정합성, 문제 중복을 자동으로 확인합니다.
> 다만 **일본어 표현이 자연스러운지, 정답이 정말 하나뿐인지**는 사람이 훑어보는 것이 가장 정확해요. 의심스러운 문제는 지워도 됩니다(ID는 비워 두면 돼요).

---

## 프롬프트 (복사해서 사용)

```
JLPT N2 대비용 오리지널 문제를 JSON으로 만들어 줘.

[조건]
- 실제 기출 문장을 그대로 쓰지 말고, 기출과 같은 '형식·스타일'의 새 문장을 만든다.
- 난이도는 N3~N2. 일상·직장·뉴스·안내문 등 실제 시험에 나올 만한 소재.
- 이번 batch 파일 이름: batch-{번호}, 문제 수: {예: 24}개
- 유형 분배(예): kanji_reading 3, orthography 3, context 3, synonym 2, usage 2, grammar 5, sentence_order 3, text_grammar 1(문항 3개), reading_short 1, reading_mid 1(문항 2개), info_search 1(문항 2개)
- ID는 다음 번호부터 이어서 쓴다: {validate.py 가 알려준 '다음에 쓸 ID'}
- 정답은 반드시 하나뿐이어야 한다. 다 만든 뒤 모든 문제를 처음부터 직접 다시 풀어 보고, 정답이 둘 이상이거나 어색하면 고쳐서 출력한다.
- 선택지는 4개. 오답 선택지는 실제 시험처럼 그럴듯하게(비슷한 읽기·표기·접속 표현 등).
- 해설은 한국어. 모든 문항에 번역(translation) / 핵심 포인트(point) / 주요 단어(words)를 넣는다. 가능하면 선택지별 해설(choices)도 넣는다.
- 출력은 JSON 코드블록 하나만. 설명 문장은 붙이지 않는다. 문제가 많으면 20~25개씩 나눠서 여러 번에 출력한다.

[스키마]
{ "batch": "batch-004", "items": [ <item>, ... ] }

item = {
  "id": "gr-011",                       // 영문소문자 2~4자-숫자3자리. 중복 금지
  "type": "kanji_reading | orthography | context | synonym | usage | grammar | sentence_order | text_grammar | reading_short | reading_mid | reading_long | reading_integrated | reading_claim | info_search",
  "level": "N3 | N2",
  "instruction": "시험 지시문 (예: 次の文の（　）に入れるのに最も適切なものを、1・2・3・4から一つ選びなさい。)",
  "passage": "지문 텍스트 (독해/글의 문법용, 줄바꿈은 \n)",      // passage_html 과 둘 중 하나만
  "passage_html": "<table>…</table>",   // 메뉴판·안내문 등 표 형태 (허용: h3 p br table tr th td ul li b span)
  "passage_translation": "지문 전체의 한국어 번역",
  "questions": [ <question>, ... ]
}

question = {
  "stem": "문제 문장",
  "choices": ["선택지1", "선택지2", "선택지3", "선택지4"],
  "answer": 0,                           // 정답 인덱스 (0~3)
  "full": "정답을 넣은 완성 문장",        // 빈칸(grammar/context)과 sentence_order 는 필수. 음성 읽기에도 쓰임
  "order": [3, 1, 0, 2],                 // sentence_order 전용: 빈칸 4칸에 들어갈 선택지 인덱스를 앞에서부터 순서대로
  "explanation": {
    "translation": "문장의 한국어 번역 (passage_translation 이 있으면 생략 가능)",
    "point": "핵심 문법/어휘 포인트 1~2문장",
    "choices": ["선택지1 해설", "선택지2 해설", "선택지3 해설", "선택지4 해설"],
    "words": [ { "w": "単語", "r": "よみ", "m": "한국어 뜻" } ]   // r 은 생략 가능
  }
}

[표기 규칙]
- 밑줄: [[賛成]]    후리가나: {漢字|かんじ}    줄바꿈: \n
- 빈칸: 반드시 전각 괄호와 전각 공백 「（　）」 (글의 문법은 「（ 1 ）」)
- sentence_order: stem 에 「＿＿＿」 3개와 「★」 1개가 있어야 한다. 배열이 한 가지로만 가능하도록 문장을 설계한다.
  answer 는 ★ 자리에 들어가는 선택지의 인덱스, order[★ 위치] == answer 여야 한다.
- text_grammar: passage 에 「（ 1 ）」「（ 2 ）」… 를 넣고, 문항마다 stem 을 「（ 1 ）」 등으로 한다.
- 문자열 안에 큰따옴표(")는 쓰지 않는다. (「」를 사용)
```

---

## 자주 쓰는 변형 프롬프트

- **약한 유형만 집중**: 위 프롬프트의 유형 분배를 `grammar 12, sentence_order 8` 처럼 바꿔서 요청
- **N2 문법 항목 순환**: `다음 문법 항목으로 문제를 만들어 줘: ～にわたって / ～をめぐって / ～ざるを得ない …`
- **오답노트 연동**: 앱의 「단어 오답노트」 목록을 복사해 붙여넣고 `이 단어들이 자연스럽게 들어가는 문제를 만들어 줘`
