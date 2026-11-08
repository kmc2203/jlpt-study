#!/bin/sh
# 테스트 → 커밋 → 푸시. 사용: scripts/ship.sh "커밋 메시지"
set -e
OUT=$(npm test 2>&1) && OK=1 || OK=0
echo "$OUT" | grep -E "^# (pass|fail)|FAIL|Error|^OK" | tr '\n' ' '; echo
[ "$OK" = 1 ] || { echo "테스트 실패 — 푸시하지 않음"; exit 1; }
git add -A
git commit -q -m "$1

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UCtq59amf9ucPTY4MFBaqD"
git fetch -q origin main && git rebase FETCH_HEAD >/dev/null 2>&1
git push -q origin HEAD:main
[ "$(git ls-remote origin refs/heads/main | cut -f1)" = "$(git rev-parse HEAD)" ] && echo pushed
