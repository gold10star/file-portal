import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const correct = process.env.PORTAL_PASSWORD

  if (!correct) {
    return new Response('Server misconfigured: PORTAL_PASSWORD not set', { status: 500 })
  }

  if (password === correct) {
    const cookieStore = await cookies()
    cookieStore.set('portal_auth', correct, {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })
    return new Response('OK', { status: 200 })
  }

  return new Response('Unauthorized', { status: 401 })
}