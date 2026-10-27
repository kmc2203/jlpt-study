# JLPT N2 공부방

휴대전화(PWA)에서 짧게 풀 수 있는 JLPT N2 대비 웹앱입니다. 서버·빌드·API 비용이 없는 **정적 사이트 + GitHub Actions** 구조예요.

## 기능

| 기능 | 설명 |
|---|---|
| 문제 풀이 | 문자·어휘 / 문법 / 문장 완성(★) / 글의 문법 / 독해 / 정보 검색(메뉴판·안내문). 청해 제외 |
| 해설 | 정답·오답과 관계없이 항상 표시: 일본어 포인트, 선택지별 해설, 주요 단어(＋ 로 오답노트에 저장), 🔊 읽어주기. 한국어(번역·포인트·선택지 4개의 뜻·선택지 해설)는 기본 숨김 → 「한국어 해석 보기」로 펼침 |
| 중복 없음 | 푼 문제는 다시 나오지 않음 (기기에 기록) |
| 오늘의 문제 | 매일 아침 공개된 문제. 밀리면 쌓임 |
| 더 풀기 | 시간이 많을 때 아직 공개 안 된 문제를 미리 소진 (유형·개수 선택) |
| 틀린 문제 복습 | 틀린 문제만 다시. 다 맞히면 목록에서 빠짐 |
| 단어 오답노트 | 10개 사이클, 알아요/몰라요, 몰랐던 단어 다시 풀기, 새 사이클, 단어 추가·일괄 추가·수정·삭제. 단어(한자)만 저장해도 되며 읽기·뜻이 비면 「미완성」 배지 + 목록 필터 |
| 글자 선택 → 추가 | 문제 화면에서 글자를 길게 눌러 선택하면 아래에 「＋ 오답노트에 추가」 바가 뜸. 한자 한 글자이고 카드가 있으면 「한자 카드」 버튼도 뜸 |
| 한자 카드 | 오답노트에 한자 한 글자만 저장하면(카드가 있는 한자) 읽기·뜻을 카드로 채우고 「카드 연결」로 표시(직접 입력이 우선, 저장값은 비워 두고 화면에서만 채움). 한자 칩이나 「한자 카드」 목록(학년별)에서 한자를 누르면 카드가 열림: 한국어 훈음·뜻, 음독·훈독, 부수·획수·학년, 대표 단어 3개. 지금은 1학년 80자, 이후 학년별로 추가 |
| 한자 → nihongokanji | 단어의 한자는 한 글자씩 칩으로 표시. 누르면 nihongokanji.com 구글 사이트 검색으로 연결되고, 찾은 페이지 주소를 저장하면 다음부터 바로 연결 (사이트 내용은 복사하지 않음, 주소만 저장) |
| 통계 | 연속 학습일, 유형별 정답률 |
| 백업 | 설정에서 JSON 내보내기/가져오기 |

## 폴더 구조

```
index.html, css/, js/        앱 (빌드 없이 그대로 동작하는 ES 모듈)
sw.js, manifest.webmanifest  PWA (홈 화면 설치, 오프라인)
data/pool/batch-*.json       문제 풀 (여기에 파일을 추가해서 문제를 늘림)
data/manifest.json           공개 현황 (매일 Actions가 자동 갱신 — 직접 수정하지 않기)
scripts/validate.py          문제 풀 검증
scripts/release.py           매일 N개 공개
.github/workflows/deploy.yml 매일 06:00(KST) 검증 → 공개 → 배포
docs/GENERATE_PROMPT.md      Claude 채팅으로 문제 풀을 만드는 프롬프트
tests/                       사이클 로직·검증기 테스트 (npm test)
```

## 내 컴퓨터에서 실행

```bash
python3 -m http.server 8000    # 그리고 http://localhost:8000 접속
python3 scripts/validate.py    # 문제 풀 검증
```

테스트(선택): `npm install && npm test` — 사이클 로직, 화면 흐름(jsdom), 문제 검증기를 확인합니다. 앱 자체는 Node 없이 동작해요.

## GitHub 배포 (한 번만 설정)

1. GitHub에 **공개(Public)** 저장소를 만들고 이 폴더를 푸시합니다.
   ```bash
   git init && git add . && git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/<아이디>/<저장소>.git
   git push -u origin main
   ```
2. 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 바꿉니다.
3. **Actions** 탭에서 「문제 공개 & 배포」 워크플로를 한 번 **Run workflow** 하면 첫 배포가 됩니다.
4. 주소는 `https://<아이디>.github.io/<저장소>/` 입니다. 안드로이드 Chrome에서 열고 메뉴 → **홈 화면에 추가** 하세요.
   (설치하면 브라우저가 저장 데이터를 함부로 지우지 않아 더 안전해요.)

이후에는 매일 06:00(KST) 무렵 자동으로 `검증 → 오늘 문제 공개 → 배포` 가 실행됩니다.
- 하루 공개 개수: `.github/workflows/deploy.yml` 의 `DAILY_COUNT`
- 수동 실행: Actions → Run workflow (개수 입력 가능)
- 스케줄은 GitHub 사정으로 몇 분~수십 분 늦어질 수 있어요. 저장소에 60일간 활동이 없으면 GitHub가 스케줄을 멈추니, 가끔 문제 풀을 추가하면(커밋) 계속 유지됩니다.
- 미공개 분량이 약 7일 이하로 남으면 저장소에 **「문제 풀 보충 필요」 이슈**가 자동으로 생겨요(GitHub 알림 메일로 받아볼 수 있음).

## 문제 풀 늘리기

`docs/GENERATE_PROMPT.md` 를 보세요. 요약: Claude 채팅에서 batch JSON 생성 → `data/pool/batch-004.json` 저장 → `python scripts/validate.py` → 푸시.

검증에 실패하면 배포가 멈추기 때문에, 잘못된 형식의 문제가 사이트에 올라가지 않습니다.

## 데이터와 저장소

- 풀이 기록·오답노트·설정은 **이 기기 브라우저(localStorage)** 에 저장됩니다. 설정 → 백업에서 주기적으로 내보내기 하세요.
- 나중에 웹(Firebase 등)에 저장하고 싶다면 `js/storage.js` 의 `backend`(`get`/`set`, 둘 다 async)만 교체하면 됩니다. 화면 코드는 건드리지 않아도 돼요.

## 문제 데이터 형식 요약

자세한 스키마와 표기 규칙은 `docs/GENERATE_PROMPT.md` 에 있습니다. 한 문제 예:

```json
{
  "id": "gr-011", "type": "grammar", "level": "N2",
  "instruction": "次の文の（　）に入れるのに最も適切なものを、1・2・3・4から一つ選びなさい。",
  "questions": [{
    "stem": "疲れている（　）、彼は最後まで走り続けた。",
    "choices": ["にもかかわらず", "おかげで", "せいで", "つもりで"], "answer": 0,
    "full": "疲れているにもかかわらず、彼は最後まで走り続けた。",
    "explanation": {
      "translation": "피곤했음에도 불구하고 그는 끝까지 계속 달렸다.",
      "point": "「～にもかかわらず」は逆接。",
      "point_ko": "「～にもかかわらず」는 역접(~에도 불구하고).",
      "choice_meanings": ["~에도 불구하고", "~덕분에", "~탓에", "~할 작정으로"],
      "words": [{"w": "にもかかわらず", "m": "~에도 불구하고"}]
    }
  }]
}
```

`point_ko`, `choice_meanings`(4개), 그리고 `choices` 가 있으면 `choices_ko`(4개)는 필수이며 `scripts/validate.py` 가 검사합니다.

## 한자 카드 데이터

- `data/kanji/index.json` 에 적힌 파일을 앱이 읽습니다. 학년을 늘릴 때는 `scripts/kanji_src/grade-N.ko.json`(직접 작성한 한국어 훈음·뜻·대표 단어)을 만들고 아래 명령으로 생성한 뒤 `index.json` 에 추가합니다.
- `python3 -I scripts/build_kanji.py <jamdict.db> scripts/kanji_src/grade-1.ko.json data/kanji/grade-1.json`
  생성 중 학년 한자 집합·한국 한자음·훈독·대표 단어(JMdict)를 공개 데이터와 대조해서 어긋나면 실패합니다. `jamdict.db` 는 PyPI 의 `jamdict-data` 패키지에 들어 있습니다(저장소에는 넣지 않음).
- 출처: KANJIDIC2 / JMdict © EDRDG, CC BY-SA 4.0 (앱의 설정 → 출처·라이선스에 표기).

## 알려진 한계 / 다음에 할 만한 것

- 샘플 문제 38개는 N3~N2 수준으로 직접 만든 오리지널 문제입니다. 실제 시험 문장은 사용하지 않았어요. 직접 풀어 보다가 어색한 문제를 발견하면 알려 주세요.
- 문장 완성(★)은 시험처럼 「★에 들어갈 선택지 고르기」 형식입니다. 조각을 탭해서 배열하는 연습 모드는 아직 없어요.
- 학습 기록은 단일 기기용입니다. 기기 간 동기화가 필요하면 위의 `storage.js` 교체 방식으로 확장하세요.
