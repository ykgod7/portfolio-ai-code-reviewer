import { supabase } from './supabase'
import type { PRMeta } from './github'
import type { AgentId, Issue } from '../agents/index'

interface LogPayload {
  inputType: 'pr' | 'code'
  prMeta?: PRMeta | null
  codeLines?: number
  startedAt: number
  agentResults: Record<AgentId, { status: 'done' | 'error'; issues: Issue[] }>
}

export async function writeLog(payload: LogPayload) {
  const durationMs = Date.now() - payload.startedAt

  const allIssues = Object.values(payload.agentResults).flatMap(r => r.issues)
  const countBySev = (sev: string) => allIssues.filter(i => i.severity === sev).length

  const anyError = Object.values(payload.agentResults).some(r => r.status === 'error')
  const anyDone  = Object.values(payload.agentResults).some(r => r.status === 'done')
  const status   = anyError && !anyDone ? 'error' : anyError ? 'partial' : 'success'

  await supabase.from('code_reviewer_logs').insert({
    input_type:   payload.inputType,
    pr_owner:     payload.prMeta?.owner     ?? null,
    pr_repo:      payload.prMeta?.repo      ?? null,
    pr_number:    payload.prMeta?.prNumber  ?? null,
    pr_title:     payload.prMeta?.title     ?? null,
    code_lines:   payload.codeLines         ?? null,
    duration_ms:  durationMs,
    total_issues: allIssues.length,
    high_count:   countBySev('HIGH'),
    medium_count: countBySev('MEDIUM'),
    low_count:    countBySev('LOW'),
    bug_count:    payload.agentResults.bug?.issues.length         ?? 0,
    perf_count:   payload.agentResults.performance?.issues.length ?? 0,
    sec_count:    payload.agentResults.security?.issues.length    ?? 0,
    status,
  })
}
