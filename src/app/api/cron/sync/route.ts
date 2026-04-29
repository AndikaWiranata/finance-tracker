import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { performUserSync } from '@/lib/sync-logic'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // 1. Security Check
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Fetch all user IDs from profiles
  const { data: profiles, error: pError } = await supabaseAdmin
    .from('profiles')
    .select('id')

  if (pError || !profiles) {
    return NextResponse.json({ error: 'Failed to fetch profiles', details: pError }, { status: 500 })
  }

  const results = []

  // 3. Process each user
  // Using sequential processing to avoid hitting public API rate limits too hard
  for (const profile of profiles) {
    try {
      const res = await performUserSync(supabaseAdmin, profile.id)
      results.push({ id: profile.id, ...res })
    } catch (err: any) {
      results.push({ id: profile.id, error: err.message })
    }
  }

  return NextResponse.json({
    message: `Processed ${profiles.length} users`,
    results
  })
}
