import { google } from 'googleapis'

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
const redirectUri = process.env.GOOGLE_REDIRECT_URI

export const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
)

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
]

export function getAuthUrl(userId: string) {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // crucial for getting refresh_token
    scope: GMAIL_SCOPES,
    prompt: 'consent', // force refresh token
    state: userId, // Pass userId through state to ensure we know who it is in callback
  })
}
