# 기존 FE와 Spring 연동 현황

제공된 `index-erd.html`과 기존 CSS·화면 스크립트를 사용한다. 원본 Python 서버와 읽기 전용 SQLite를 유지하고, 로컬 프록시에서 `/api/v1/`만 Spring으로 전달한다. 두 DB는 별개이므로 화면별 데이터와 건수가 다를 수 있다.

## 연결 범위

| 기능 | 현재 데이터 경로 | 상태 |
|---|---|---|
| 가격 추이·이력 | Spring `GET /api/v1/catalog`, `GET /api/v1/market/price-histories` → PostgreSQL | 연결. 기본 최근 2년, 저장된 실효 USD 단가만 차트에 표시 |
| 이력의 상세·출처 | Spring `GET /api/v1/market/observations/{id}` → PostgreSQL | 연결. 이력의 환산 ID를 명시 |
| 직접 입력 환율 재계산 | Spring `POST /api/v1/exchange-rate-simulations` | 연결. Spring 가격 이력의 상세·근거에서 실효 단가를 일회성 계산 |
| 수집·가격 이상 경고 | Spring `GET /api/v1/operations/alerts` | 연결. 데이터 품질 화면의 별도 PostgreSQL 경고 목록, 50건씩 추가 조회 |
| 자동 환율 표시 | Spring `GET /api/v1/exchange-rates/latest` → PostgreSQL | 연결. 수동 수집 후 저장된 한국수출입은행 환율을 표시 |
| 기존 대시보드·시장별 상품·계약 할인·카탈로그·수집 대상 상태 | 기존 Python API → 첨부 SQLite | 화면 기능 유지. Spring의 동일 기능 API는 미구현 또는 미연결 |
| 원가·사업성 시뮬레이션 | 기존 FE 계산과 Python 서버 | Spring 계산 API 미연결. 기존 구현 범위에서 동작 |
| Agent | 기존 화면의 미연결 안내 | Spring/FastAPI Agent 미연결 |
| 수출입은행 금리 | 기존 Python API·기존 SQLite | Spring 금리 수집·조회 API 미구현 |

이력 API는 현재 모델 ID와 기간만 지원한다. 사업자·계약·지역은 조회 후 화면에서 필터링하며, 오퍼 100개 초과 요청, 커서, 서버 측 필터, 원화 변환, 상품명과 구성 버전 제공은 미구현이다. Spring 카탈로그와 FE 모델명이 정확히 일치하지 않으면 NVL72 전체 랙으로 임의 매핑하지 않고 조회 불가로 표시한다. 환산 불가 관측은 차트와 표에서 제외한다.

## 한국수출입은행 키

`gpu-backend/scripts/collect_exchange_rate.py`가 서버 환경 또는 로컬 `.env`의 환율 키로 한국수출입은행 API를 호출해 PostgreSQL에 저장한다. `exchange-rates/latest`는 DB에 저장된 환율을 조회한다. 수집은 수동 1회 실행이며 자동 스케줄은 미연결이다. 브라우저의 API 키 설정은 별도 Python 설정이며 Spring .env와 연동되지 않는다. 금리 키 연동은 아직 구현되지 않았다.

## 로컬 실행

1. PostgreSQL과 Spring을 `local` 프로필, 포트 18082로 실행한다. Spring의 DB 환경변수 설정은 `../gpu-backend/README.md`를 참고한다.
2. `docker_erd_20261117/app`에서 `python3 serve_erd.py --port 8022`를 실행한다.
3. 이 폴더에서 `python3 serve.py`를 실행하고 `http://127.0.0.1:18083/`에 접속한다.

세 서비스는 로컬에서 확인한 구성이다. 테스트: `node --test tests/*.test.mjs`.
