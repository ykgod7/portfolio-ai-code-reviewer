interface GitHubFile {
  filename: string
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged'
  patch?: string
}

export interface PRMeta {
  owner: string
  repo: string
  prNumber: number
  title: string
  fileCount: number
}

function parsePRUrl(prUrl: string): { owner: string; repo: string; prNumber: number } {
  const match = prUrl.trim().match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!match) throw new Error('올바른 GitHub PR URL을 입력해주세요. (예: https://github.com/owner/repo/pull/123)')
  return { owner: match[1], repo: match[2], prNumber: parseInt(match[3], 10) }
}

export async function getPRDiff(prUrl: string): Promise<{ diff: string; meta: PRMeta }> {
  const { owner, repo, prNumber } = parsePRUrl(prUrl)

  const headers: HeadersInit = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  const [prRes, filesRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`, { headers }),
  ])

  if (!prRes.ok) {
    const err = await prRes.json().catch(() => ({})) as { message?: string }
    throw new Error(`GitHub API 오류 (${prRes.status}): ${err.message ?? prRes.statusText}`)
  }
  if (!filesRes.ok) {
    const err = await filesRes.json().catch(() => ({})) as { message?: string }
    throw new Error(`GitHub API 오류 (${filesRes.status}): ${err.message ?? filesRes.statusText}`)
  }

  const pr = await prRes.json() as { title: string }
  const files = await filesRes.json() as GitHubFile[]

  const diff = files
    .filter(f => f.patch)
    .map(f => `// File: ${f.filename} [${f.status}]\n${f.patch}`)
    .join('\n\n')

  if (!diff) throw new Error('변경된 파일이 없거나 diff를 가져올 수 없습니다.')

  return {
    diff,
    meta: { owner, repo, prNumber, title: pr.title, fileCount: files.length },
  }
}

export async function postPRComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<void> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(`PR 코멘트 작성 실패 (${res.status}): ${err.message ?? res.statusText}`)
  }
}
