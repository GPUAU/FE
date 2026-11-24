#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
python3 preview_local.py
status_code=$?
if [ "$status_code" -ne 0 ]; then
  echo "실행 오류를 확인한 뒤 Enter를 누르세요."
  read -r
fi
exit "$status_code"
