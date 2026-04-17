import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const correct = process.env.PORTAL_PASSWORD

  if (!correct) {
    return new Response('Server misconfigured', { status: 500 })
  }

  if (password === correct) {
    const cookieStore = await cookies()
    cookieStore.set('portal_auth', correct, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 5,
      path: '/',
    })
    return new Response('OK', { status: 200 })
  }

  return new Response('Unauthorized', { status: 401 })
}