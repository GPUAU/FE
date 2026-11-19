# 컴포넌트 명세

공통 기준: 4px 간격 단위, radius 6px, 본문 14/21px, 테이블 보조 12/18px, SVG 아이콘 16px. 아래 props/events는 목표 인터페이스이며 현 실행본은 DOM/함수 기반이다. 컴포넌트화 미완료를 표기한다.

| 이름·목적 | 크기 / 상태 / 반응형 | 데이터·이벤트 / 접근성·오류 |
|---|---|---|
| Header·Sidebar / 이동 | header 60px, sidebar 204/176px; 모바일 메뉴 | activePath, expanded; navigate/toggle; nav 레이블·현재 페이지·포커스 |
| Button / 실행 | 높이 ≥40px, padding 8px 12px, 기본·주요·위험·아이콘 | disabled/loading, click; button 이름·중복 클릭 방지; 오류는 결과 영역 |
| Input·Select·Search | 높이 ≥40px, 폭 100%, label과 오류 표시 | value, required, error; input/change; label 연결, Enter 검색; 잘못된 값 사유 |
| Filter Bar | 16px 간격, 넓은 화면 행·작은 화면 줄바꿈 | conditions, options; change/reset; 어떤 조건인지 표기; 미지원 조합 표시 |
| Table | 최소 720px·컨테이너 스크롤, 숫자 tabular | columns, rows, status; sort/open; table/th, 상태·단위·출처, 실패와 빈 결과 분리 |
| Pagination | 버튼 ≥40px, 8px 간격 | page,total; prev/next; 경계 disabled, 현재 페이지 표시 |
| KPI | 의미 있는 지표만, 가변 폭 | value, unit, scope, timestamp; 링크 있을 때만 click; 미확보 표시 |
| Chart | 컨테이너 최소 240px, 모바일 폭 100% | series, unit, range; tooltip; 차트 유형·축·범례 및 텍스트 표 대안, 표본 부족 안내 |
| Tooltip·Popover | 버튼 기준 위치, 화면 가장자리 보정 | open, content; open/close; 키보드·Escape, 포커스 복귀 검증 필요 |
| Dialog | 최대 940px·94vw, 긴 내용 내부 스크롤 | title, open; close/cancel; native dialog, 제목 연결·Escape·호출 위치 포커스 복귀 |
| Drawer | 모바일 메뉴 등 화면 내 100% 폭 이하 | open, items; open/close; 포커스·Escape·배경 접근 제어 미검증 |
| Tabs | 최소 40px, 좁은 폭에서 줄바꿈 | value, choices; select; 링크 내비게이션은 aria-current, 상호작용 탭이면 키보드 규칙 별도 구현 |
| Toast·Alert | 알림 내용에 맞는 폭, 오래 남는 오류는 인라인 | message,severity; dismiss/retry; role=status/alert, 색과 문구 함께 |
| Skeleton | 기존 구조의 자리 유지, 150ms 이내 전환만 | loading; 완료/오류로 전이; aria-busy·텍스트 제공, 움직임 감소 고려 |
| Empty·Error | 결과 영역 안, 제목·사유·행동 | type, action; retry/reset; 미수집/검색 없음/실패 구분 |

대부분의 규격은 목표이며 실제 구현 범위와 검증 결과는 UI_QA_CHECKLIST에 따른다.
