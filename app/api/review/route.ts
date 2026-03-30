import { runAgents, type AgentResult } from '../../../agents/orchestrator'
import { getPRDiff, type PRMeta } from '../../../lib/github'
import { writeLog } from '../../../lib/logger'
import type { AgentId, Issue } from '../../../agents/index'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { code?: string; prUrl?: string }

    let codeToAnalyze: string
    let meta: PRMeta | null = null
    const inputType = body.prUrl ? 'pr' : 'code'

    if (body.prUrl) {
      const result = await getPRDiff(body.prUrl)
      codeToAnalyze = result.diff
      meta = result.meta
    } else if (body.code) {
      codeToAnalyze = body.code
    } else {
      return Response.json({ error: '코드 또는 PR URL을 입력해주세요.' }, { status: 400 })
    }

    if (codeToAnalyze.trim() === '') {
      return Response.json({ error: '분석할 내용이 없습니다.' }, { status: 400 })
    }

    const encoder = new TextEncoder()
    const startedAt = Date.now()
    const agentResults: Record<string, { status: 'done' | 'error'; issues: Issue[] }> = {}

    const readable = new ReadableStream({
      async start(controller) {
        if (meta) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'meta', meta })}\n\n`))
        }

        const send = (result: AgentResult) => {
          agentResults[result.agentId] = result.status === 'done'
            ? { status: 'done', issues: result.issues }
            : { status: 'error', issues: [] }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'result', ...result })}\n\n`))
        }

        try {
          await runAgents(codeToAnalyze, send)
        } finally {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()

          // 로그 저장 (스트림 완료 후 fire-and-forget)
          writeLog({
            inputType,
            prMeta: meta,
            codeLines: inputType === 'code'
              ? body.code!.split('\n').length
              : undefined,
            startedAt,
            agentResults: agentResults as Record<AgentId, { status: 'done' | 'error'; issues: Issue[] }>,
          }).catch(console.error)
        }
      },
    })

    return new Response(readable, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
