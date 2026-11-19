# 디자인 시스템

상태: 기존 공통 CSS와 일치시키는 목표 명세. 전 화면의 실제 값은 점진적으로 통합한다.

## 토큰

| 의미 | 토큰 | 값 |
|---|---|---|
| 페이지 배경 | --work-bg | #f5f6f8 |
| 표면 / 팝업 | --work-surface / --work-elevated | #ffffff / #ffffff |
| 본문 / 보조 | --work-ink / --work-muted | #20242a / #596574 |
| 경계 | --work-border | #dfe3e8 |
| 강조 / 선택 | --work-red / --work-selected | #d92335 / #fff1f2 |
| hover | --work-hover | #f2f4f6 |
| focus | --work-focus | #275da8, 3px 외곽선 + 2px 간격 |
| 성공 / 경고 / 오류 | --work-success / --work-warning / --work-error | #176747 / #754411 / #a31b2a |
| disabled | --work-disabled | #66717e, 제어 비활성 + 문구 |
| 간격 | --work-space-1…6 | 4 / 8 / 12 / 16 / 24px |
| 반경 | --work-radius | 6px |

상태는 색상만으로 전달하지 않는다. 경고 텍스트는 이유와 조치를 함께 제공한다. 대비는 브라우저 적용 색과 배경 조합을 별도로 실측해야 하며 토큰 지정만으로 AA를 보장하지 않는다.

## 글자

Pretendard Variable, system sans-serif fallback. 목표: 페이지 제목 28/36px 700, 섹션 20/28px 700, 표 헤더 12/18px 600, 본문·컨트롤 14/21px 400~600, 보조 12/18px 400. 수치 tabular-nums, 가격 오른쪽 정렬 권장. 긴 SKU·URL은 줄바꿈하고 원문 전체를 상세에서 볼 수 있게 한다. 제목 간격은 -0.02em 이하만 사용한다.

## 참고

[Carbon](https://carbondesignsystem.com/)의 토큰·패턴, [Cloudscape](https://cloudscape.design/)의 필터·테이블·상태, [Pajamas](https://design.gitlab.com/)의 접근성·콘텐츠, [Blueprint](https://blueprintjs.com/)의 밀도 있는 업무 UI, [shadcn-vue](https://www.shadcn-vue.com/)의 조합형 컴포넌트를 참고한다. [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), [Impeccable](https://github.com/pbakaus/impeccable)은 현재 설치된 스킬 목록에 없다. 외부 코드는 설치하거나 복사하지 않았다.
