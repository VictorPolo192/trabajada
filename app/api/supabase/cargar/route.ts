import {
  leerJsonLimitado,
  procesarCarga,
  repositorioSupabase,
} from "@/lib/server/mediciones"
import { clienteEscritura } from "@/lib/server/supabase"

// AVISO: la aplicación no tiene autenticación. Esta ruta escribe con la clave
// secreta y solo debe usarse en desarrollo local. Protégela antes de publicar.
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
  const r = await procesarCarga(cuerpo, repositorioSupabase(cliente))
  if (!r.cuerpo.ok) console.error("[cargar]", r.cuerpo.error)
  return Response.json(r.cuerpo, { status: r.status })
}
