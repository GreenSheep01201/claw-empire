# 운영절차서: Planned Kickoff 라운드 1 보완 실행 기준

- 기준 메모: `[PROJECT MEMO] Planned Kickoff 라운드 1 미해결 보완 항목 (2026-02-20 13:35)`
- 문서 목적: 운영팀 보완 항목(지표 모니터링/알람 라우팅/롤백 리허설/런북 업데이트) 실행 절차 표준화
- 작성 부서: 운영팀(터보)
- 버전: v1.1
- 최종 갱신: 2026-02-20 22:57 (KST)
- 최신 런북 링크: `docs/operations/review-round1-ops-procedure-2026-02-20.md`

## 1) 운영 게이트 원칙

1. 운영팀 항목은 승인 보류 없이 `Planned -> In Progress`로 즉시 진행한다.
2. 핵심 지표는 배포 전 `-30분`과 배포 후 `+30분` 동일 윈도우로 비교한다.
3. 증적은 `대시보드 캡처`, `알람 테스트 이벤트`, `롤백 리허설 로그`, `런북 링크` 4종을 고정한다.
4. 증적 필드가 누락되면 해당 SubTask는 `Review Hold`로 유지한다.

## 2) 순차 실행 플로우 (운영팀)

1. `ST-OPS-13-01`: 배포 전후 30분 핵심 지표 baseline/post 비교 캡처
2. `ST-OPS-13-02`: 알람 라우팅 테스트 이벤트 1건 발행 및 L1~L3 디스패치 확인
3. `ST-OPS-13-03`: 롤백 리허설 1회 수행, RTO/담당자 포함 로그 고정
4. `ST-OPS-13-04`: 운영 런북 갱신 및 링크 공유

## 3) 실행 SubTask (명령·담당·증적)

| SubTask | 내용 | 담당 | 실행 명령 | 필수 증적 |
|---|---|---|---|---|
| ST-OPS-13-01 | 배포 전후 30분 핵심 지표(에러율/지연/리소스) baseline/post 비교 | 아틀라스 | `pnpm run ops:dashboard-capture` | `logs/ops-dashboard-capture-baseline-*.txt`, `logs/ops-dashboard-capture-post-*.txt`, `logs/ops-dashboard-capture-*.log` |
| ST-OPS-13-02 | 알람 라우팅 점검(테스트 이벤트 1건) | 아틀라스 | `pnpm run ops:monitoring-escalation` | `logs/ops-monitoring-escalation-*.log` 내 `alert_id` + L1/L2/L3 dispatch 로그 |
| ST-OPS-13-03 | 롤백 리허설 1회 + RTO 측정 | 아틀라스 | `pnpm run ops:health-rollback` | `logs/ops-health-rollback-*.log` 내 `started_at_utc`, `finished_at_utc`, `exit_code`, `rto_seconds`, `owner` |
| ST-OPS-13-04 | 운영 런북 업데이트 및 공유 | 터보 | 문서 갱신(`docs/operations/review-round1-ops-procedure-2026-02-20.md`) | 최신 런북 링크 + `revision_timestamp` |

## 4) 증적 체크 고정 규격

| 증적 유형 | 필수 필드 |
|---|---|
| 대시보드 캡처 증적 | `captured_at_utc`, `metric_window`, `error_rate`, `latency_p95_ms`, `resource_cpu_pct`, `resource_memory_mb` |
| 알람 라우팅 증적 | `alert_id`, `trigger_condition`, `routing_targets`, `dispatch_timestamp`, `resolved_state` |
| 롤백 리허설 증적 | `started_at_utc`, `finished_at_utc`, `rto_seconds`, `owner`, `exit_code` |
| 런북 업데이트 증적 | `runbook_link`, `revision_timestamp`, `owner`, `review_status` |

## 5) 최신 증적 스냅샷 (2026-02-20)

| 항목 | 값/경로 | 상태 |
|---|---|---|
| 배포 전 baseline 캡처 | `logs/ops-dashboard-capture-baseline-20260220T135705Z.txt` | 수집 완료(드라이런) |
| 배포 후 post 캡처 | `logs/ops-dashboard-capture-post-20260220T135705Z.txt` | 수집 완료(드라이런) |
| 알람 테스트 이벤트 ID | `ops-health-20260220T135712Z` (`logs/ops-monitoring-escalation-20260220T135712Z.log`) | 수집 완료 |
| 롤백 리허설 로그 | `logs/ops-health-rollback-20260220T135709Z.log` | 수집 완료 |
| 리허설 RTO/담당자 | `rto_seconds=1`, `owner=터보` | 산출 완료 |
| 최신 런북 링크 | `docs/operations/review-round1-ops-procedure-2026-02-20.md` | 갱신 완료 |

## 6) 승인 판정 기준

| 판정 항목 | 통과 기준 | 미충족 시 |
|---|---|---|
| ST-OPS-13-01 | pre/post 캡처 2건 모두 존재 + 타임스탬프 포함 | `in_progress` 유지 |
| ST-OPS-13-02 | alert_id 1건 + L1/L2/L3 dispatch 로그 확인 | `in_progress` 유지 |
| ST-OPS-13-03 | 리허설 1회 성공 + `rto_seconds`/`owner` 기록 | `in_progress` 유지 |
| ST-OPS-13-04 | 최신 런북 링크 갱신 + 배포 공지에 링크 고정 | `in_progress` 유지 |
