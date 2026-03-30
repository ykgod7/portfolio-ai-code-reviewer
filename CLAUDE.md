# AI 코드리뷰 어시스턴트 — CLAUDE.md

Claude Code가 이 프로젝트를 이해하고 작업하기 위한 컨텍스트 파일입니다.

---

## 프로젝트 개요

프론트엔드 개발자 이직 포트폴리오용 풀스택 프로젝트.
GitHub PR의 변경된 코드를 멀티 에이전트로 분석해 버그·성능·보안 이슈를 자동으로 리뷰해주는 웹 애플리케이션.

**핵심 차별점**
- 단일 Claude API 호출이 아닌, 역할이 분리된 3개 에이전트를 `Promise.all()`로 병렬 실행
- 분석 결과를 실시간 스트리밍으로 UI에 출력
- 웹앱(PR URL 입력)과 GitHub Actions(자동화) 두 진입점을 동일한 에이전트 코어로 처리

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 14 (App Router) |
| 언어 | TypeScript |
| 스타일 | Tailwind CSS |
| AI | Anthropic Claude API (`claude-sonnet-4-6`) |
| 코드 에디터 | Monaco Editor |
| 외부 API | GitHub REST API |
| 배포 | Vercel |
| 자동화 | GitHub Actions |

---

## 아키텍처

### 두 가지 진입점 — 하나의 에이전트 코어

```
진입점 A: 웹앱 UI          진입점 B: GitHub Actions
(PR URL 입력)              (git push 시 자동 실행)
       ↓                          ↓
       └──────── 공유 에이전트 코어 ────────┘
                 (Next.js API Route)
                        ↓
         ┌──────── Promise.all() ────────┐
         ↓              ↓               ↓
    버그 탐지       성능 분석        보안 점검
    에이전트        에이전트         에이전트
         ↓              ↓               ↓
         └──────── 결과 합산 ────────────┘
                        ↓
         ┌──────────────┴──────────────┐
         ↓                             ↓
   웹 UI 스트리밍 출력           PR 자동 코멘트
   (인라인 diff + 코멘트)        (GitHub API)
```

### 에이전트 구조

에이전트는 **system prompt가 다른 Claude API 호출**이다. 별도 라이브러리 없이 설정 객체 배열로 정의한다.

```typescript
// src/agents/index.ts
const AGENTS = [
  { id: 'bug',         name: '버그 탐지',  system: BUG_PROMPT },
  { id: 'performance', name: '성능 분석',  system: PERF_PROMPT },
  { id: 'security',    name: '보안 점검',  system: SEC_PROMPT },
]
```

---

## 디렉토리 구조

```
/
├── src/
│   ├── app/
│   │   ├── page.tsx                  # 메인 웹앱 UI
│   │   └── api/
│   │       └── review/
│   │           └── route.ts          # 에이전트 실행 API Route
│   ├── agents/
│   │   ├── index.ts                  # 에이전트 정의 (AGENTS 배열)
│   │   ├── prompts.ts                # 각 에이전트 system prompt
│   │   └── orchestrator.ts           # Promise.all() 병렬 실행 로직
│   ├── lib/
│   │   ├── github.ts                 # GitHub API — PR diff 가져오기
│   │   └── claude.ts                 # Anthropic SDK 스트리밍 호출
│   └── components/
│       ├── CodeInput.tsx             # 코드 붙여넣기 / PR URL 입력 UI
│       ├── DiffViewer.tsx            # diff + 인라인 코멘트 렌더링
│       ├── ReviewPanel.tsx           # 에이전트별 결과 카드
│       └── SeverityBadge.tsx         # HIGH / MEDIUM / LOW 배지
├── .github/
│   └── workflows/
│       └── code-review.yml           # GitHub Actions 자동화
├── .env.local                        # 환경변수 (아래 참고)
└── CLAUDE.md                         # 이 파일
```

---

## 환경변수

`.env.local`에 아래 값이 필요하다. Claude Code 작업 전 반드시 설정할 것.

```bash
ANTHROPIC_API_KEY=sk-ant-...        # Anthropic Console에서 발급
GITHUB_TOKEN=ghp_...                # GitHub Settings > Developer settings > PAT
```

GitHub Token 필요 권한: `repo` (PR diff 읽기), `pull_requests: write` (코멘트 달기)

---

## 에이전트 System Prompt

### 공통 응답 형식 (JSON 강제)

모든 에이전트는 아래 JSON 형식으로만 응답한다. 프리앰블·마크다운 코드블록 없이 순수 JSON만 출력.

```json
{
  "issues": [
    {
      "file": "src/api/user.ts",
      "line": 23,
      "severity": "HIGH",
      "rule": "OWASP A03 - Injection",
      "message": "문제에 대한 명확한 설명",
      "fix": "구체적인 수정 방법 또는 수정 코드"
    }
  ]
}
```

### 심각도 기준

| 레벨 | 기준 | 처리 |
|------|------|------|
| HIGH | 즉시 크래시 또는 보안 침해 가능 | 머지 블록 권장 |
| MEDIUM | 품질·성능에 명백한 영향, 조건부 위험 | 머지 전 수정 권장 |
| LOW | 동작 문제 없으나 더 나은 방식 존재 | 선택적 개선 |

### 버그 탐지 에이전트 (BUG_PROMPT)

분석 기준:
- **런타임 오류**: null/undefined 참조, 타입 불일치, 무한 루프
- **엣지케이스**: 빈 배열·문자열, 네트워크 실패, 경계값 미처리
- **React 패턴**: useEffect 의존성 누락, 조건부 훅, key prop 미설정, 메모리 누수(cleanup 미설정)
- **비동기**: 에러 미처리, race condition, 타임아웃 미설정

성능·보안 이슈는 다루지 않는다. 버그만 집중 분석.

### 성능 분석 에이전트 (PERF_PROMPT)

분석 기준:
- **알고리즘**: 중첩 루프 O(n²), 불필요한 전체 배열 순회, Map/Set 대신 Array 탐색
- **React 렌더링**: 불필요한 리렌더링, useMemo·useCallback 누락, 대용량 리스트 가상화 미적용
- **네트워크**: 중복 API 호출, 캐싱 미적용, 불필요한 데이터 페칭
- **번들**: 불필요한 전체 라이브러리 import (tree-shaking 미적용)

수정 제안 시 Big-O 개선 수치를 함께 명시한다.

### 보안 점검 에이전트 (SEC_PROMPT)

분석 기준:
- **OWASP Top 10**: XSS, SQL Injection, 인증·세션 취약점, CSRF, 민감 데이터 노출
- **CWE Top 25**: 하드코딩된 자격증명, 경쟁 조건, null 포인터 역참조
- **프론트 특화**: dangerouslySetInnerHTML, eval() 사용, 환경변수 클라이언트 노출, API 키 하드코딩

취약점 발견 시 CVE 또는 OWASP 분류 코드를 함께 명시한다.

---

## 핵심 구현 패턴

### 1. 병렬 에이전트 실행

```typescript
// src/agents/orchestrator.ts
export async function runAgents(diff: string) {
  const results = await Promise.allSettled(
    AGENTS.map(agent => callClaude({ system: agent.system, user: diff }))
  )
  // allSettled: 하나가 실패해도 나머지 결과는 살림
  return results
}
```

### 2. 스트리밍 호출

```typescript
// src/lib/claude.ts
export async function callClaude({ system, user, onChunk }) {
  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: user }],
  })

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta') {
      onChunk(chunk.delta.text) // 실시간 UI 출력
    }
  }
}
```

### 3. GitHub PR diff 가져오기

```typescript
// src/lib/github.ts
// PR URL: https://github.com/owner/repo/pull/123
export async function getPRDiff(prUrl: string): Promise<string> {
  const { owner, repo, prNumber } = parsePRUrl(prUrl)
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`,
    { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } }
  )
  const files = await res.json()
  // 변경된 모든 파일의 patch(diff)를 합쳐서 반환
  return files.map(f => `// ${f.filename}\n${f.patch}`).join('\n\n')
}
```

### 4. GitHub PR 코멘트 달기 (Actions용)

```typescript
// src/lib/github.ts
export async function postPRComment(owner, repo, prNumber, body) {
  await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` },
      body: JSON.stringify({ body }),
    }
  )
}
```

---

## GitHub Actions 설정

```yaml
# .github/workflows/code-review.yml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - name: Run AI Review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
          REPO_OWNER: ${{ github.repository_owner }}
          REPO_NAME: ${{ github.event.repository.name }}
        run: npx tsx scripts/review.ts
```

---

## 개발 단계 로드맵

### 1단계 — 웹앱 MVP (1주차)
- [ ] Next.js 프로젝트 생성 및 기본 세팅
- [ ] Claude API 연동 + 단일 에이전트 스트리밍 동작 확인
- [ ] 코드 붙여넣기 입력 UI
- [ ] 기본 결과 카드 출력

### 2단계 — 멀티 에이전트 (2주차)
- [ ] 에이전트 3개 분리 (버그·성능·보안)
- [ ] `Promise.allSettled()` 병렬 실행
- [ ] 오케스트레이터 로직
- [ ] 에러 핸들링 (하나 실패해도 나머지 결과 유지)

### 3단계 — GitHub 연동 (3주차)
- [ ] GitHub API PR diff 파싱
- [ ] PR URL 입력 UI
- [ ] Monaco Editor + diff 하이라이팅
- [ ] 인라인 코멘트 UI (줄 번호 매칭)

### 4단계 — 자동화 + 완성도 (4주차)
- [ ] GitHub Actions 워크플로우
- [ ] PR 자동 코멘트 (GitHub API)
- [ ] 심각도 배지·필터
- [ ] 분석 히스토리 (localStorage)
- [ ] Vercel 배포

---

## 작업 규칙 (Claude Code용)

- 컴포넌트는 항상 TypeScript + 명시적 타입 정의
- API Route는 `try/catch` 필수, 에러 시 적절한 HTTP 상태코드 반환
- 에이전트 응답은 반드시 JSON 파싱 후 사용 (`JSON.parse` + 유효성 검사)
- 환경변수는 `.env.local`에서만 관리, 코드에 하드코딩 금지
- 커밋 전 `feature/` 브랜치 생성 후 PR → 머지 흐름 유지
- 스타일은 Tailwind 유틸리티 클래스만 사용, 인라인 style 지양
