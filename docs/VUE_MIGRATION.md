# Vue 점진 이전 계획 (초안 — FE 담당자와 합의 필요)

> 이 문서와 함께 들어간 것은 **기반(인프라)만**입니다. 기존 화면 코드는 바꾸지 않았습니다.
> 화면을 언제, 어떤 순서로, 어떤 구조로 옮길지는 FE 담당자와 합의한 뒤 진행합니다.

## 1. 왜 바꾸나

| 현재 | 문제 |
|---|---|
| 정적 HTML + JS 54개(약 710KB, 빌드 없음) + CSS 28개 | 화면 간 공유 상태(`MV`, `SG`, `CP` 등 전역 변수)와 스크립트 로딩 순서에 의존. 화면을 덮어쓰는 파일(`research-workspace.js`, `home-overview.js`)이 늘어남 |
| Python `serve.py`(표준 라이브러리)로 서빙 | gzip 없음, 모든 응답 `Cache-Control: no-store` → 방문마다 약 10MB 전송 |
| 아키텍처 그림은 "Vue.js / Nginx :80" | 실제와 다름 |

## 2. 이번에 들어간 기반

```
FE/
├─ docker_erd_20261117/app/web/static/   # 기존 사이트 (그대로)
├─ serve.py                              # 로컬 미리보기용 (그대로)
├─ web/                                  # ★ 새 Vue 3 + Vite 앱
│  ├─ package.json, package-lock.json, vite.config.js, index.html
│  ├─ src/main.js, App.vue, router.js
│  ├─ src/api/client.js                  # Spring 응답({isSuccess, result}) 공통 처리
│  ├─ src/views/MigrationStatus.vue      # 연결 확인용 첫 화면
│  └─ tests/*.test.mjs
├─ deploy/nginx/default.conf.template    # ★ serve.py 경로 규칙을 옮긴 nginx 설정
└─ Dockerfile                            # ★ node로 web/ 빌드 → nginx 이미지
```

### nginx 경로 규칙 (serve.py와 동일하게 맞춤)

| 경로 | 처리 | 캐시 |
|---|---|---|
| `/`, `/index.html` | 기존 `index-erd.html` | `no-cache` |
| `/public-data` | `public-data.html` | `no-cache` |
| `/static/*` | 기존 정적 파일 | 1일 (`?v=` 버전이 바뀌면 새로 받음) |
| `/app/*` | **새 Vue 앱** | `index.html`은 `no-cache`, `/app/assets/*`는 1년(파일명 해시) |
| `/api/v1/*` | Spring BE 프록시(`BACKEND_URL`) | `no-store` |
| 그 밖의 `/api/*` | 503 (레거시 호환 서버 없음) | — |
| 그 밖 | 기존 정적 폴더에서 찾기 | — |

gzip: HTML·CSS·JS·JSON·SVG. `.mjs`는 `application/javascript`로 보냅니다(기본 mime에 없어서 ES 모듈 import가 거부되던 문제).

### 측정 (로컬, 배포 BE 연결)

- 오퍼 API 한 번: 536KB → **24KB** (gzip)
- 여러 화면을 열었을 때 API 합계: 34.1MB → **1.6MB**
- 두 번째 방문: 정적 파일 82개 전부 브라우저 캐시에서 로드

## 3. 이전 방식 (제안)

1. 화면 하나를 Vue로 옮긴다: `web/src/views/<Screen>.vue` + `router.js`에 경로 추가.
2. 기존 사이트의 해당 메뉴 링크를 `/app/#/<경로>`로 바꾼다.
3. 기존 JS에서 그 화면 코드를 지운다.
4. 모든 화면이 옮겨지면 `/`를 Vue 앱으로 바꾸고 `static/`과 `serve.py`를 정리한다.

제안 순서(의존성이 적고 효과가 큰 순):

| 순서 | 화면 | 이유 |
|---|---|---|
| 1 | 홈 (`#home`) | 첫 진입 화면. 지금은 모든 모델의 오퍼 상세(약 7MB)를 받아 요약을 계산 → 요약 API로 바꾸면 체감 속도가 가장 크게 개선 |
| 2 | 조건별 비교 (`#compare`) | 이미 Spring API만 사용 |
| 3 | 카탈로그·사업자 비교·가격 이력 | `research-workspace.js`가 덮어쓰는 화면 |
| 4 | 계약 할인·관심 사업자 | |
| 5 | 원가·사업성·가격 검토·Copilot·시뮬레이션 | 계산 로직(`v02-calculations.js`, `decision-logic.js`)을 모듈로 옮기며 테스트 이관 |

## 4. 합의할 것

- [ ] Vue 전환 자체와 순서
- [ ] 상태 관리(Pinia 사용 여부), 차트(Chart.js 유지 / vue-chartjs), UI 컴포넌트(sk-ui 유지 여부)
- [ ] 스타일 정리 방식(기존 CSS 28개 → 화면별 scoped / 공통 토큰)
- [ ] 작업 중 zip 전달 대신 `web/`에 직접 PR하는 흐름
- [ ] 테스트: 기존 `tests/*.test.mjs`(node --test)를 화면 이전과 함께 `web/tests`로 이관

## 5. 로컬 개발

```bash
cd web
npm ci
GPU_SPRING_BASE_URL=http://127.0.0.1:18092 npm run dev   # http://localhost:5173/app/
npm test
npm run build
```

기존 사이트 미리보기는 지금처럼 `python3 serve.py`.

배포 이미지와 같은 nginx로 확인하려면:

```bash
docker build -t gpuau-fe:nginx .
docker run --rm -p 18391:8080 --user 101 -e BACKEND_URL=http://host.docker.internal:18092 gpuau-fe:nginx
# http://localhost:18391/ (기존 사이트), http://localhost:18391/app/ (Vue)
```
