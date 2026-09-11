# K 스텔라 웨이 P1 — 자동 쇼츠 제작국 V11

GitHub `main` → 검사 → Cloudflare dry-run → 전용 Worker 배포 → 실제 `/healthz` 검증 파이프라인.

## 절대 운영 규칙
- 전용 Worker: `k-stella-shorts-factory`
- 기존 다른 Worker 수정/삭제/재사용 금지
- 기존 D1: `k-stella-shorts-factory` (binding `DB`)
- 기존 R2: `k-stella-shorts-assets` (binding `ASSETS_BUCKET`)
- Workers AI binding: `AI`
- D1은 배포 시 이름으로 조회하여 기존 ID를 자동 사용하며 삭제/재생성하지 않음

## GitHub Secrets
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## 배포 검증
배포 직후 Cloudflare 전파 지연을 고려해 `/healthz`를 최대 12회, 10초 간격으로 확인하며 `version=11`, `db=true`, `r2=true`, `ai=true`가 모두 확인되어야 성공 처리합니다.
