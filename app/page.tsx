'use client'

import { useState, useEffect } from 'react'
import { AGENTS, type AgentId, type Issue } from '../agents/index'
import type { PRMeta } from '../lib/github'

type Severity = 'HIGH' | 'MEDIUM' | 'LOW'
type InputMode = 'pr' | 'code'

interface LogEntry {
  id: string
  created_at: string
  input_type: 'pr' | 'code'
  pr_owner: string | null
  pr_repo: string | null
  pr_number: number | null
  pr_title: string | null
  code_lines: number | null
  duration_ms: number
  total_issues: number
  high_count: number
  medium_count: number
  low_count: number
  status: 'success' | 'partial' | 'error'
}

interface AgentState {
  status: 'idle' | 'analyzing' | 'done' | 'error'
  issues: Issue[]
  errorMsg?: string
}

const INITIAL_AGENT_STATE: Record<AgentId, AgentState> = {
  bug:         { status: 'idle', issues: [] },
  performance: { status: 'idle', issues: [] },
  security:    { status: 'idle', issues: [] },
}

const SEVERITY_ORDER: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }

const SEVERITY_COUNT_PILL: Record<Severity, string> = {
  HIGH:   'bg-red-50 text-red-600 ring-1 ring-red-200',
  MEDIUM: 'bg-amber-50 text-amber-600 ring-1 ring-amber-200',
  LOW:    'bg-sky-50 text-sky-600 ring-1 ring-sky-200',
}

const CODE_PLACEHOLDER = `// 여기에 리뷰할 코드를 붙여넣으세요.
const DB_PASSWORD = "admin1234"

function loginUser(username, password) {
  const query = "SELECT * FROM users WHERE username = '" + username + "'"
  return db.query(query)
}

async function fetchUser(id) {
  const res = await fetch('/api/user/' + id)
  const data = res.json()
  return data
}`

export default function Home() {
  const [inputMode, setInputMode] = useState<InputMode>('pr')
  const [code, setCode] = useState('')
  const [prUrl, setPrUrl] = useState('')
  const [prMeta, setPrMeta] = useState<PRMeta | null>(null)
  const [agentStates, setAgentStates] = useState<Record<AgentId, AgentState>>(INITIAL_AGENT_STATE)
  const [globalStatus, setGlobalStatus] = useState<'idle' | 'running' | 'done'>('idle')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logsOpen, setLogsOpen] = useState(false)

  useEffect(() => {
    fetch('/api/logs').then(r => r.json()).then(setLogs).catch(() => {})
  }, [])

  function setAgent(id: AgentId, patch: Partial<AgentState>) {
    setAgentStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const isReady = inputMode === 'code' ? code.trim() !== '' : prUrl.trim() !== ''

  async function handleReview() {
    if (!isReady) return

    setGlobalStatus('running')
    setPrMeta(null)
    setAgentStates({
      bug:         { status: 'analyzing', issues: [] },
      performance: { status: 'analyzing', issues: [] },
      security:    { status: 'analyzing', issues: [] },
    })

    try {
      const body = inputMode === 'pr' ? { prUrl } : { code }

      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const err = await response.json() as { error?: string }
        throw new Error(err.error ?? 'API 오류')
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') continue

          const event = JSON.parse(payload) as
            | { type: 'meta'; meta: PRMeta }
            | { type: 'result'; agentId: AgentId; status: 'done'; issues: Issue[] }
            | { type: 'result'; agentId: AgentId; status: 'error'; message: string }

          if (event.type === 'meta') {
            setPrMeta(event.meta)
          } else if (event.status === 'done') {
            const sorted = [...event.issues].sort(
              (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
            )
            setAgent(event.agentId, { status: 'done', issues: sorted })
          } else {
            setAgent(event.agentId, { status: 'error', errorMsg: event.message })
          }
        }
      }

      setGlobalStatus('done')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류'
      setAgentStates({
        bug:         { status: 'error', issues: [], errorMsg: msg },
        performance: { status: 'error', issues: [], errorMsg: msg },
        security:    { status: 'error', issues: [], errorMsg: msg },
      })
      setGlobalStatus('done')
    }
  }

  const totalIssues = Object.values(agentStates).flatMap(a => a.issues)
  const countBySev = (sev: Severity) => totalIssues.filter(i => i.severity === sev).length

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif' }}>
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-900 leading-none">AI Code Reviewer</h1>
            <p className="text-xs text-gray-400 mt-0.5">버그 · 성능 · 보안 멀티 에이전트</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 flex flex-col gap-6">
        {/* 입력 카드 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* 탭 */}
          <div className="flex gap-1 p-2 border-b border-gray-100 bg-gray-50/60">
            {([
              { id: 'pr',   label: '🔗  GitHub PR URL' },
              { id: 'code', label: '📋  코드 직접 입력' },
            ] as { id: InputMode; label: string }[]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setInputMode(tab.id)}
                className={`px-4 py-1.5 text-sm rounded-lg cursor-pointer transition-all font-medium ${
                  inputMode === tab.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-5 flex flex-col gap-4">
            {inputMode === 'pr' && (
              <>
                <input
                  type="url"
                  value={prUrl}
                  onChange={(e) => setPrUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleReview()}
                  placeholder="https://github.com/owner/repo/pull/123"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-50 transition-all"
                />
                <p className="text-xs text-gray-400">
                  공개 저장소는 토큰 불필요 · private repo는{' '}
                  <code className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono text-xs">GITHUB_TOKEN</code>{' '}
                  환경변수 필요
                </p>
              </>
            )}

            {inputMode === 'code' && (
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={CODE_PLACEHOLDER}
                className="w-full h-52 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono text-gray-900 placeholder:text-gray-400 resize-y focus:outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-50 transition-all"
                spellCheck={false}
              />
            )}

            {/* 액션 바 */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleReview}
                disabled={globalStatus === 'running' || !isReady}
                className="px-5 py-2 bg-violet-600 hover:bg-violet-700 active:bg-violet-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed cursor-pointer text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
              >
                {globalStatus === 'running' ? '분석 중…' : '분석 시작'}
              </button>

              {globalStatus === 'done' && (
                <div className="flex items-center gap-2">
                  {(['HIGH', 'MEDIUM', 'LOW'] as Severity[]).map(sev => {
                    const count = countBySev(sev)
                    if (count === 0) return null
                    return (
                      <span key={sev} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${SEVERITY_COUNT_PILL[sev]}`}>
                        {sev} {count}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PR 메타 정보 */}
        {prMeta && (
          <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-violet-400 shrink-0" />
            <span className="text-sm font-semibold text-violet-800">PR #{prMeta.prNumber}</span>
            <span className="text-sm text-violet-700 truncate">{prMeta.title}</span>
            <span className="ml-auto text-xs text-violet-400 shrink-0">
              {prMeta.fileCount}개 파일 · {prMeta.owner}/{prMeta.repo}
            </span>
          </div>
        )}

        {/* 에이전트 패널 */}
        {globalStatus !== 'idle' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {AGENTS.map(agent => (
              <AgentPanel
                key={agent.id}
                name={agent.name}
                icon={agent.icon}
                state={agentStates[agent.id]}
              />
            ))}
          </div>
        )}

        {/* 분석 로그 패널 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            onClick={() => {
              setLogsOpen(prev => !prev)
              if (!logsOpen) {
                fetch('/api/logs').then(r => r.json()).then(setLogs).catch(() => {})
              }
            }}
            className="w-full flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors"
          >
            <span className="text-sm font-semibold text-gray-700">분석 로그</span>
            <div className="flex items-center gap-2">
              {logs.length > 0 && (
                <span className="text-xs text-gray-400">{logs.length}건</span>
              )}
              <span className="text-gray-400 text-xs">{logsOpen ? '▲' : '▼'}</span>
            </div>
          </button>

          {logsOpen && (
            <div className="border-t border-gray-100">
              {logs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">아직 로그가 없습니다.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-400 text-left">
                      <th className="px-4 py-2.5 font-medium">시각</th>
                      <th className="px-4 py-2.5 font-medium">대상</th>
                      <th className="px-4 py-2.5 font-medium text-right">HIGH</th>
                      <th className="px-4 py-2.5 font-medium text-right">MED</th>
                      <th className="px-4 py-2.5 font-medium text-right">LOW</th>
                      <th className="px-4 py-2.5 font-medium text-right">소요</th>
                      <th className="px-4 py-2.5 font-medium text-center">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-2.5 text-gray-700 max-w-50 truncate">
                          {log.input_type === 'pr'
                            ? `${log.pr_owner}/${log.pr_repo} #${log.pr_number}`
                            : `코드 ${log.code_lines}줄`}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-red-500">{log.high_count || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-amber-500">{log.medium_count || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-sky-500">{log.low_count || '—'}</td>
                        <td className="px-4 py-2.5 text-right text-gray-400">{(log.duration_ms / 1000).toFixed(1)}s</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            log.status === 'success' ? 'bg-green-50 text-green-600' :
                            log.status === 'partial' ? 'bg-amber-50 text-amber-600' :
                            'bg-red-50 text-red-600'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function AgentPanel({ name, icon, state }: { name: string; icon: string; state: AgentState }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
      {/* 패널 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-900">{icon} {name}</span>
        <StatusBadge status={state.status} count={state.issues.length} />
      </div>

      {/* 패널 바디 */}
      <div className="flex flex-col gap-2.5 p-4 flex-1">
        {state.status === 'analyzing' && (
          <div className="flex items-center gap-2.5 py-2">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-sm text-gray-400">분석 중…</span>
          </div>
        )}
        {state.status === 'error' && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 text-sm text-red-600">
            {state.errorMsg}
          </div>
        )}
        {state.status === 'done' && state.issues.length === 0 && (
          <div className="flex items-center gap-2 py-2">
            <span className="text-green-500 text-base">✓</span>
            <span className="text-sm text-gray-500">이슈가 발견되지 않았습니다</span>
          </div>
        )}
        {state.status === 'done' && state.issues.map((issue, i) => (
          <IssueCard key={i} issue={issue} />
        ))}
      </div>
    </div>
  )
}

function IssueCard({ issue }: { issue: Issue }) {
  const SEVERITY_PILL: Record<Severity, string> = {
    HIGH:   'bg-red-50 text-red-600 ring-1 ring-red-200',
    MEDIUM: 'bg-amber-50 text-amber-600 ring-1 ring-amber-200',
    LOW:    'bg-sky-50 text-sky-600 ring-1 ring-sky-200',
  }

  const SEVERITY_BAR: Record<Severity, string> = {
    HIGH:   'bg-red-400',
    MEDIUM: 'bg-amber-400',
    LOW:    'bg-sky-400',
  }

  return (
    <div className="flex gap-3 bg-gray-50 rounded-xl p-3 border border-gray-100">
      {/* 심각도 컬러 바 */}
      <div className={`w-1 rounded-full shrink-0 ${SEVERITY_BAR[issue.severity]}`} />

      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SEVERITY_PILL[issue.severity]}`}>
            {issue.severity}
          </span>
          <span className="text-xs text-gray-400 font-mono truncate">{issue.rule}</span>
          {issue.line > 0 && (
            <span className="ml-auto text-xs text-gray-300 shrink-0">:{issue.line}</span>
          )}
        </div>

        <p className="text-sm text-gray-700 leading-relaxed">{issue.message}</p>

        <div className="flex flex-col gap-1">
          <p className="text-xs text-gray-400 font-medium">수정 방법</p>
          <pre className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-800 overflow-auto whitespace-pre-wrap leading-relaxed">
            {issue.fix}
          </pre>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status, count }: { status: AgentState['status']; count: number }) {
  if (status === 'idle') return null
  if (status === 'analyzing') return (
    <span className="text-xs text-violet-400 font-medium animate-pulse">분석 중</span>
  )
  if (status === 'error') return (
    <span className="text-xs text-red-400 font-medium">오류</span>
  )
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
      count > 0
        ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-200'
        : 'bg-green-50 text-green-600 ring-1 ring-green-200'
    }`}>
      {count > 0 ? `${count}건` : '이상 없음'}
    </span>
  )
}
