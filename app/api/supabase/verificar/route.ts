import {
  leerJsonLimitado,
  repositorioSupabase,
  verificarClaves,
} from "@/lib/server/mediciones"
import { clienteEscritura } from "@/lib/server/supabase"

// Se usa la clave secreta para que RLS no oculte filas y la verificación sea fiable.
export async function POST(req: Request) {
  const cliente = clienteEscritura()
  if (!cliente)
    return Response.json(
      {
        ok: false,
        error:
          "Falta configurar SUPABASE_URL y SUPABASE_SECRET_KEY en el servidor.",
      },
      { status: 503 }
    )
  const { cuerpo, error } = await leerJsonLimitado(req)
  if (error) return Response.json({ ok: false, error }, { status: 413 })
  const r = await verificarClaves(cuerpo, repositorioSupabase(cliente))
  return Response.json(r.cuerpo, { status: r.status })
}
