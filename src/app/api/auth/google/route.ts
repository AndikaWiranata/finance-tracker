import { NextRequest, NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/google-auth'

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  
  if (!userId) {
    return NextResponse.json({ error: 'UserId is required' }, { status: 400 })
  }

  const url = getAuthUrl(userId)
  return NextResponse.redirect(url)
}
