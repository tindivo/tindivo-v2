import { createTindivoServerClient, STORAGE_KEYS } from '@tindivo/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      console.error('[auth/callback] Missing Supabase environment variables')
      return NextResponse.redirect(`${origin}/`)
    }
    const cookieStore = await cookies()
    // Este es el único sitio de `customer` que ESCRIBE la cookie de sesión: aquí
    // el `storageKey` decide dónde va a quedar guardada, y el cliente del
    // navegador la busca por ese mismo nombre. Cuando eran dos cadenas escritas
    // a mano, una errata en cualquiera de las dos dejaba al usuario fuera con un
    // login que había ido bien.
    const supabase = createTindivoServerClient({
      url,
      anonKey: key,
      storageKey: STORAGE_KEYS.customer,
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Ignore cookie errors
          }
        },
      },
    })

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error('[auth/callback] Error exchanging code for session:', error)
  }

  return NextResponse.redirect(`${origin}/`)
}
