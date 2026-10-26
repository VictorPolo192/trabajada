import type { NextRequest } from "next/server"

import { NOMBRES_CIUDADES } from "@/lib/etl/cities"
import { fechaIsoAMs } from "@/lib/etl/extract"
import { TABLA } from "@/lib/server/mediciones"
import { clienteLectura } from "@/lib/server/supabase"

const CAMPOS_ORDEN = [
  "ciudad",
  "fecha_hora",
  "temperatura_c",
  "humedad_pct",
  "precipitacion_mm",
  "importado_en",
]
const MAX_TAMANO = 100

/** Lectura paginada de los datos persistidos, con filtros y ORDER BY explícito. */
export async function GET(req: NextRequest) {
  const lectura = clienteLectura()
  if (!lectura)
    return Response.json(
      {
        ok: false,
        error: "Falta configurar SUPABASE_URL y una clave en el servidor.",
      },
      { status: 503 }
    )

  const p = req.nextUrl.searchParams
  const ciudad = p.get("ciudad") ?? ""
  const desde = p.get("desde") ?? ""
  const hasta = p.get("hasta") ?? ""
  const orden = p.get("orden") ?? "fecha_hora"
  const asc = p.get("dir") !== "desc"
  const pagina = Math.max(1, Number.parseInt(p.get("pagina") ?? "1", 10) || 1)
  const tamano = Math.min(
    MAX_TAMANO,
    Math.max(1, Number.parseInt(p.get("tamano") ?? "25", 10) || 25)
  )

  if (ciudad && !NOMBRES_CIUDADES.includes(ciudad))
    return Response.json(
      { ok: false, error: "Ciudad desconocida." },
      { status: 400 }
    )
  if (!CAMPOS_ORDEN.includes(orden))
    return Response.json(
      { ok: false, error: "Campo de ordenación no permitido." },
      { status: 400 }
    )
  if (
    (desde && fechaIsoAMs(desde) === null) ||
    (hasta && fechaIsoAMs(hasta) === null)
  )
    return Response.json(
      { ok: false, error: "Fechas con formato AAAA-MM-DD." },
      { status: 400 }
    )

  let q = lectura.cliente
    .from(TABLA)
    .select(
      "id, ciudad, fecha_hora, temperatura_c, humedad_pct, precipitacion_mm, importado_en",
      { count: "exact" }
    )
  if (ciudad) q = q.eq("ciudad", ciudad)
  if (desde) q = q.gte("fecha_hora", `${desde}T00:00:00Z`)
  if (hasta) q = q.lte("fecha_hora", `${hasta}T23:59:59Z`)
  // Desempate por id para que la paginación sea estable.
  q = q.order(orden, { ascending: asc }).order("id", { ascending: true })
  const inicio = (pagina - 1) * tamano
  const { data, error, count } = await q.range(inicio, inicio + tamano - 1)

  if (error) {
    console.error("[mediciones]", error.message)
    return Response.json(
      { ok: false, error: `Supabase: ${error.message}` },
      { status: 502 }
    )
  }
  return Response.json({
    ok: true,
    filas: data,
    total: count ?? 0,
    pagina,
    tamano,
    clave: lectura.clave,
  })
}
