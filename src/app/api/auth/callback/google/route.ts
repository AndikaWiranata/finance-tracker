import { NextRequest, NextResponse } from 'next/server'
import { oauth2Client } from '@/lib/google-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

// We need a helper to get the user from cookies since this is an API route
async function getUserIdFromCookies() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  return user?.id
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state') // This is our userId

  if (error) {
    return NextResponse.redirect(new URL('/profile?error=' + error, req.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/profile?error=no_code', req.url))
  }

  try {
    const { tokens } = await oauth2Client.getToken(code)
    
    // Get current user (try cookie first, then state)
    let userId = await getUserIdFromCookies()
    if (!userId && state) {
      userId = state
    }

    if (!userId) {
      console.error('No userId found in cookies or state')
      return NextResponse.redirect(new URL('/profile?error=unauthorized', req.url))
    }

    // Save to DB
    const { error: dbError } = await supabaseAdmin
      .from('email_integrations')
      .upsert({
        user_id: userId,
        provider: 'gmail',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,provider' })

    if (dbError) {
      console.error('Database error saving tokens:', dbError)
      return NextResponse.redirect(new URL('/profile?error=db_error', req.url))
    }

    return NextResponse.redirect(new URL('/profile?success=gmail_connected', req.url))
  } catch (err: any) {
    console.error('Google Auth Error:', err)
    return NextResponse.redirect(new URL('/profile?error=' + encodeURIComponent(err.message), req.url))
  }
}
