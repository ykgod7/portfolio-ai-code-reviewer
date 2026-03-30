import { supabase } from '../../../lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('code_reviewer_logs')
    .select('id, created_at, input_type, pr_owner, pr_repo, pr_number, pr_title, code_lines, duration_ms, total_issues, high_count, medium_count, low_count, status')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data)
}
