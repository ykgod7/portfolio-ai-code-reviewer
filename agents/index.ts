import { BUG_PROMPT, PERF_PROMPT, SEC_PROMPT } from './prompts'

export interface Issue {
  file: string
  line: number
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  category: 'BUG' | 'PERFORMANCE' | 'SECURITY'
  rule: string
  message: string
  fix: string
}

export const AGENTS = [
  { id: 'bug',         name: '버그 탐지',  icon: '🐛', system: BUG_PROMPT  },
  { id: 'performance', name: '성능 분석',  icon: '⚡', system: PERF_PROMPT },
  { id: 'security',    name: '보안 점검',  icon: '🔒', system: SEC_PROMPT  },
] as const

export type AgentId = typeof AGENTS[number]['id']
