import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Lee la configuración del entorno del servidor. La clave secreta NUNCA lleva
 * prefijo NEXT_PUBLIC_, por lo que Next.js no la incluye en el bundle del navegador.
 */
function config() {
  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const secreta =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  const publicable =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  return { url, secreta, publicable }
}

export function estadoConfiguracion() {
  const c = config()
  return {
    url: Boolean(c.url),
    escritura: Boolean(c.url && c.secreta),
    lectura:
      c.url && c.secreta
        ? ("secreta" as const)
        : c.url && c.publicable
          ? ("publicable" as const)
          : null,
  }
}

const opciones = { auth: { persistSession: false, autoRefreshToken: false } }

/** Cliente con clave secreta (salta RLS). Solo para rutas del servidor. */
export function clienteEscritura(): SupabaseClient | null {
  const c = config()
  if (!c.url || !c.secreta) return null
  return createClient(c.url, c.secreta, opciones)
}

/** Para leer se prefiere la clave secreta; con la publicable, RLS decide qué filas se ven. */
export function clienteLectura(): {
  cliente: SupabaseClient
  clave: "secreta" | "publicable"
} | null {
  const c = config()
  if (c.url && c.secreta)
    return {
      cliente: createClient(c.url, c.secreta, opciones),
      clave: "secreta",
    }
  if (c.url && c.publicable)
    return {
      cliente: createClient(c.url, c.publicable, opciones),
      clave: "publicable",
    }
  return null
}
