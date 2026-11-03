// 학습 알림 발송 (GitHub Actions 에서 하루 3번 실행).
//   환경변수: VAPID_PRIVATE_KEY(필수), PUSH_SUBSCRIPTIONS(구독 JSON 한 개 또는 배열), PUSH_SLOT(선택: morning|afternoon|night)
// 구독이 없으면 아무것도 하지 않고 성공으로 끝난다.
import webpush from 'web-push';
import { VAPID_PUBLIC_KEY, REPO } from '../js/config.js';

export const MESSAGES = {
  morning: { title: '오늘의 새 문제가 올라왔어요 📝', body: '문제 10개가 준비됐어요. 출근길에 한 세트 어때요?' },
  afternoon: { title: '점심 먹고 한 세트? ☕', body: '오늘의 복습이 도착해 있어요. 틀린 문제만 풀어도 충분해요.' },
  night: { title: '오늘 학습 마무리 🌙', body: '복습 도착분만 풀어도 연속 학습일이 이어져요.' },
};

// 한국 시간(KST) 기준 시간대: 13시 전 오전, 19시 전 오후, 그 외 야간
export function slotAt(date = new Date()) {
  const h = (date.getUTCHours() + 9) % 24;
  return h < 13 ? 'morning' : h < 19 ? 'afternoon' : 'night';
}

export function parseSubscriptions(raw) {
  if (!raw || !raw.trim()) return [];
  const v = JSON.parse(raw);
  return (Array.isArray(v) ? v : [v]).filter(s => s && s.endpoint && s.keys?.p256dh && s.keys?.auth);
}

async function main() {
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subs = parseSubscriptions(process.env.PUSH_SUBSCRIPTIONS);
  const slot = process.env.PUSH_SLOT && MESSAGES[process.env.PUSH_SLOT] ? process.env.PUSH_SLOT : slotAt();
  if (!subs.length) { console.log('구독 정보가 없어 알림을 보내지 않아요 (설정 → 학습 알림에서 켜고 Secrets 에 등록)'); return; }
  if (!priv) throw new Error('VAPID_PRIVATE_KEY 가 없어요');
  webpush.setVapidDetails(`https://github.com/${REPO}`, VAPID_PUBLIC_KEY, priv);
  const payload = JSON.stringify({ ...MESSAGES[slot], tag: `jlpt-${slot}`, url: './#/quiz' });
  let failed = 0;
  for (const s of subs) {
    try { await webpush.sendNotification(s, payload, { TTL: 6 * 3600 }); console.log(`보냄(${slot})`); }
    catch (e) {
      failed++;
      console.log(`실패 ${e.statusCode || ''} ${String(e.body || e.message).slice(0, 120)}${[404, 410].includes(e.statusCode) ? ' — 만료된 구독이에요. 설정에서 알림을 다시 켜고 Secrets 를 갱신하세요' : ''}`);
    }
  }
  if (failed === subs.length) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
