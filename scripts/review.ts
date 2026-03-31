import { getPRDiff, postPRComment } from '../lib/github'
import { runAgents, type AgentResult } from '../agents/orchestrator'
import { AGENTS } from '../agents/index'

const AGENT_LABELS: Record<string, string> = {
  bug: '🐛 버그 탐지',
  performance: '⚡ 성능 분석',
  security: '🔒 보안 점검',
}

const SEVERITY_ORDER = ['HIGH', 'MEDIUM', 'LOW'] as const

function formatComment(results: AgentResult[], prTitle: string): string {
  const lines: string[] = []
  lines.push(`## 🤖 AI 코드 리뷰 — ${prTitle}`)
  lines.push('')

  let totalIssues = 0

  for (const result of results) {
    const label = AGENT_LABELS[result.agentId] ?? result.agentId
    lines.push(`### ${label}`)

    if (result.status === 'error') {
      lines.push(`> ⚠️ 에이전트 오류: ${result.message}`)
      lines.push('')
      continue
    }

    if (result.issues.length === 0) {
      lines.push('이슈 없음 ✅')
      lines.push('')
      continue
    }

    totalIssues += result.issues.length

    const sorted = [...result.issues].sort(
      (a, b) => SEVERITY_ORDER.indexOf(a.severity as typeof SEVERITY_ORDER[number]) -
                SEVERITY_ORDER.indexOf(b.severity as typeof SEVERITY_ORDER[number])
    )

    for (const issue of sorted) {
      const badge = issue.severity === 'HIGH' ? '🔴' : issue.severity === 'MEDIUM' ? '🟡' : '🟢'
      lines.push(`**${badge} ${issue.severity}** — \`${issue.file}:${issue.line}\``)
      lines.push(`- **규칙**: ${issue.rule}`)
      lines.push(`- **설명**: ${issue.message}`)
      lines.push(`- **수정**: ${issue.fix}`)
      lines.push('')
    }
  }

  lines.push('---')
  lines.push(`총 **${totalIssues}개** 이슈 발견 | [AI Code Reviewer](https://portfolio-ai-code-reviewer.vercel.app/)`)

  return lines.join('\n')
}

async function main() {
  const prNumber = parseInt(process.env.PR_NUMBER ?? '', 10)
  const owner = process.env.REPO_OWNER ?? ''
  const repo = process.env.REPO_NAME ?? ''

  if (!prNumber || !owner || !repo) {
    console.error('필수 환경변수 누락: PR_NUMBER, REPO_OWNER, REPO_NAME')
    process.exit(1)
  }

  const prUrl = `https://github.com/${owner}/${repo}/pull/${prNumber}`
  console.log(`🔍 PR 분석 시작: ${prUrl}`)

  const { diff, meta } = await getPRDiff(prUrl)
  console.log(`📄 파일 ${meta.fileCount}개 변경 감지`)

  const results: AgentResult[] = []
  await runAgents(diff, (result) => {
    const label = AGENT_LABELS[result.agentId] ?? result.agentId
    if (result.status === 'done') {
      console.log(`✅ ${label}: ${result.issues.length}개 이슈`)
    } else {
      console.log(`❌ ${label}: ${result.message}`)
    }
    results.push(result)
  })

  const comment = formatComment(results, meta.title)
  await postPRComment(owner, repo, prNumber, comment)
  console.log('💬 PR 코멘트 작성 완료')
}

main().catch((err) => {
  console.error('리뷰 실패:', err)
  process.exit(1)
})
