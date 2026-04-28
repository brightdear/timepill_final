# timepill_final

## 폴더 구조

```
src/
  backend/    ← DB, repository, alarm 로직
  frontend/   ← components, hooks
  scan/       ← 스캔 추론, 등록 파이프라인
  shared/     ← 공통 constants, types, utils
app/          ← Expo Router 화면
```

## 브랜치 전략

```
main          ← 배포 버전 (PR 없이 직접 push 금지)
dev           ← 통합 브랜치
  feat/backend
  feat/frontend
  feat/scan-pipeline
```

## 작업 방법

1. `dev` 에서 자기 브랜치 만들기
2. 자기 담당 폴더만 건드리기
3. PR 올려서 팀원 리뷰 후 `dev` 에 머지
