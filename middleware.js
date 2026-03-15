import { NextResponse } from 'next/server'

export function middleware(request) {
  const { pathname } = request.nextUrl

  // Allow the login page and login API route through
  if (pathname === '/login' || pathname.startsWith('/api/login')) {
    return NextResponse.next()
  }

  // Allow Next.js internals and static files through
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  // Check for auth cookie
  const auth = request.cookies.get('hfh_auth')
  if (auth?.value === 'authenticated') {
    return NextResponse.next()
  }

  // Redirect to login
  const loginUrl = new URL('/login', request.url)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
