# GPUAU FE — 2026-11-19 작업본

HTML·JavaScript·Chart.js 프론트와 PM 몬테카를로 프로토타입 연동 코드입니다.
작업 브랜치: `feat/frontend-integration-20261119`. main 병합 전 작업본입니다.

## 실행

Python 3.10 이상에서 저장소 루트를 기준으로 실행합니다.

```sh
python3 serve.py
```

별도 터미널에서 계산 서버를 실행합니다.

```sh
python3 montecarlo/service.py
```

화면: http://127.0.0.1:18091/ · 시뮬레이션: http://127.0.0.1:18091/#forecast
시뮬레이션은 Python 표준 라이브러리와 포함된 샘플만 사용합니다.
시장 데이터 화면은 별도 Spring 서버(18092)와 기존 호환 API(18093)가 필요합니다.
이 FE 저장소에는 Spring 소스·DB 덤프·API 키를 포함하지 않습니다.

## 반영한 작업

- 환율 표시 및 조회 상태, 비교 가능 가격과 참고 가격 구분, 48시간 초과 자료 집계 제외 안내.
- 다운로드한 BE 기준 시장 데이터·수집 상태 표시와 가격 이력 조회 연동 보완.
- PM 원본 계산 엔진으로 12개월 가격 분위수 차트, 시장가 시나리오 및 이후 추세 선택.
- 목표 IRR 달성 확률별 필요 판매가, 후보가격 IRR, 민감도, 결과 JSON 저장 UI.
- 입력 변경 시 결과 무효화, 계산 중 상태, 입력 검증, 모바일 화면 보완.

## 검증

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s montecarlo/engine -p tests.py
python3 -m unittest discover -s montecarlo -p 'test*.py'
```

FE 45개, PM 엔진 18개, 연동 6개 테스트. 전체 요구사항 충족을 의미하지 않습니다.

## 남은 작업

몬테카를로는 가상 가격 18개월을 사용하는 시연입니다. 실제 데이터 적용·백테스트,
기존 원가/IRR 화면과 연결, 최종 추천 상한 및 의사결정 기록, Agent 기능은 완료되지 않았습니다.
백엔드 연결 후에도 응답 매핑과 로딩·실패·빈 결과 처리에 대한 통합 검증이 필요합니다.
상세 모델 가정은 `montecarlo/README.md`, 기존 검토 기록은 `docs/`를 참고하세요.
기존 감사 문서는 작성 당시 기록이며 현재 완료 여부는 코드와 별도 대조해야 합니다.
