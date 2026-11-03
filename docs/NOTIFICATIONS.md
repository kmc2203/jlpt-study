# 학습 알림 설정 (한 번만)

알림은 GitHub Actions(`.github/workflows/notify.yml`)가 하루 3번(11:30 · 15:30 · 21:30 KST) 보냅니다. 서버가 따로 없어서, 보낼 곳(구독 정보)을 GitHub 에 알려줘야 해요.

1. 저장소 **Settings → Secrets and variables → Actions → New repository secret**
   - 이름 `VAPID_PRIVATE_KEY` : Claude 가 알려 준 비공개키 (공개키는 `js/config.js` 에 이미 들어 있음)
2. 폰의 앱(크롬)에서 **설정 → 학습 알림 → 「이 기기에서 알림 켜기」** → 권한 허용
3. 표시되는 **구독 정보**를 복사해서 같은 화면의 Secrets 에 이름 `PUSH_SUBSCRIPTIONS` 로 저장
   - 기기가 여러 대면 JSON 배열 `[ {...}, {...} ]` 로 합쳐서 저장
4. Actions 탭 → 「학습 알림」 → **Run workflow** 로 바로 시험 발송

- 알림이 안 오면: 실행 로그에서 `만료된 구독` 이 보이는지 확인 → 앱에서 알림을 껐다 켜고 `PUSH_SUBSCRIPTIONS` 를 다시 저장
- 브라우저 데이터를 지우거나 앱을 지웠다 다시 설치하면 구독이 바뀌어서 3번을 다시 해야 해요.
- GitHub 스케줄은 몇 분~수십 분 늦을 수 있어요.
- 알림 내용은 시간대별 고정 문구예요(진도를 모르는 서버라서).
