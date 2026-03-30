import Anthropic from '@anthropic-ai/sdk'
import { AGENTS, type AgentId, type Issue } from './index'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function callAgent(system: string, code: string): Promise<string> {
  let text = ''
  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system,
    messages: [{ role: 'user', content: code }],
  })
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      text += chunk.delta.text
    }
  }
  return text
}

function parseIssues(raw: string): Issue[] {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) return []
  const parsed = JSON.parse(raw.slice(start, end + 1)) as { issues: Issue[] }
  return parsed.issues ?? []
}

export type AgentResult =
  | { agentId: AgentId; status: 'done'; issues: Issue[] }
  | { agentId: AgentId; status: 'error'; message: string }

export async function runAgents(
  code: string,
  onResult: (result: AgentResult) => void
): Promise<void> {
  await Promise.allSettled(
    AGENTS.map(async (agent) => {
      try {
        const raw = await callAgent(agent.system, code)
        const issues = parseIssues(raw)
        onResult({ agentId: agent.id, status: 'done', issues })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        onResult({ agentId: agent.id, status: 'error', message })
      }
    })
  )
}
