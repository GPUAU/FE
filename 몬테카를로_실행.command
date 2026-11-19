#!/bin/zsh
cd -- "${0:A:h}"
python3 montecarlo/launch.py
if [[ $? != 0 ]]; then
  echo "실행 실패. 위 내용을 확인하세요."
  read -k 1
fi
