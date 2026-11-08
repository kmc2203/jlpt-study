#!/bin/sh
# 테스트 → 커밋 → 푸시. 사용: scripts/ship.sh "커밋 메시지"
set -e
npm test 2>&1 | grep -E "^# (pass|fail)|FAIL|Error|^OK" | tr '\n' ' '; echo
git add -A
git commit -q -m "$1

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UCtq59amf9ucPTY4MFBaqD"
git fetch -q origin main && git rebase FETCH_HEAD >/dev/null 2>&1
git push -q origin HEAD:main
[ "$(git ls-remote origin refs/heads/main | cut -f1)" = "$(git rev-parse HEAD)" ] && echo pushed
