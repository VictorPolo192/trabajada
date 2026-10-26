import type { SupabaseClient } from "@supabase/supabase-js"

import { claveRegistro, normalizarFechaHora } from "../etl/transform"
import type { FilaMedicion } from "../etl/types"
import { validarFilaEntrante } from "../etl/validation"
import { TAMANO_LOTE } from "../etl/load"

export const TABLA = "mediciones_meteorologicas"
export const MAX_BYTES_PETICION = 256 * 1024
const TAMANO_CONSULTA_VERIFICACION = 100

/** Acceso mínimo a la tabla; permite probar la lógica sin una base de datos real. */
export type RepositorioMediciones = {
  upsert(
    filas: FilaMedicion[]
  ): Promise<{ afectadas: number | null; error: string | null }>
  fechasExistentes(
    ciudad: string,
    fechas: string[]
  ): Promise<{ fechas: string[]; error: string | null }>
}

export function repositorioSupabase(
  cliente: SupabaseClient
): RepositorioMediciones {
  return {
    async upsert(filas) {
      // count: "exact" devuelve el nº de filas afectadas por el INSERT ... ON CONFLICT DO UPDATE.
      // PostgREST no distingue cuántas fueron inserciones y cuántas actualizaciones.
      const { error, count } = await cliente
        .from(TABLA)
        .upsert(filas, { onConflict: "ciudad,fecha_hora", count: "exact" })
      return { afectadas: count ?? null, error: error ? error.message : null }
    },
    async fechasExistentes(ciudad, fechas) {
      const { data, error } = await cliente
        .from(TABLA)
        .select("fecha_hora")
        .eq("ciudad", ciudad)
        .in("fecha_hora", fechas)
      return {
        fechas: (data ?? []).map((d) =>
          String((d as { fecha_hora: string }).fecha_hora)
        ),
        error: error ? error.message : null,
      }
    },
  }
}

type Resultado<T> = { status: number; cuerpo: T }

function validarLote(
  cuerpo: unknown
): { filas: FilaMedicion[]; error: null } | { filas: null; error: string } {
  const registros = (cuerpo as { registros?: unknown } | null)?.registros
  if (!Array.isArray(registros))
    return { filas: null, error: "Se esperaba { registros: [...] }." }
  if (registros.length === 0)
    return { filas: null, error: "El lote está vacío." }
  if (registros.length > TAMANO_LOTE)
    return {
      filas: null,
      error: `El lote tiene ${registros.length} registros; el máximo es ${TAMANO_LOTE}.`,
    }
  const filas: FilaMedicion[] = []
  const claves = new Set<string>()
  for (let i = 0; i < registros.length; i++) {
    const v = validarFilaEntrante(registros[i])
    if (!v.fila)
      return {
        filas: null,
        error: `Registro ${i + 1} inválido: ${v.motivos.join("; ")}`,
      }
    const clave = claveRegistro(v.fila.ciudad, v.fila.fecha_hora)
    if (claves.has(clave))
      return {
        filas: null,
        error: `Registro ${i + 1} duplicado en el lote (${clave}).`,
      }
    claves.add(clave)
    filas.push(v.fila)
  }
  return { filas, error: null }
}

/** Valida en el servidor y ejecuta el upsert de un lote completo (todo o nada). */
export async function procesarCarga(
  cuerpo: unknown,
  repo: RepositorioMediciones
): Promise<
  Resultado<
    | { ok: true; recibidas: number; afectadas: number | null }
    | { ok: false; error: string }
  >
> {
  const v = validarLote(cuerpo)
  if (!v.filas) return { status: 400, cuerpo: { ok: false, error: v.error } }
  const r = await repo.upsert(v.filas)
  if (r.error)
    return { status: 502, cuerpo: { ok: false, error: `Supabase: ${r.error}` } }
  return {
    status: 200,
    cuerpo: { ok: true, recibidas: v.filas.length, afectadas: r.afectadas },
  }
}

/**
 * Comprueba qué claves (ciudad, fecha_hora) existen en destino.
 * Agrupa por ciudad y consulta en bloques pequeños para no exceder la longitud de URL.
 */
export async function verificarClaves(
  cuerpo: unknown,
  repo: RepositorioMediciones
): Promise<
  Resultado<
    | {
        ok: true
        encontradas: number
        faltan: { ciudad: string; fecha_hora: string }[]
      }
    | { ok: false; error: string }
  >
> {
  const claves = (cuerpo as { claves?: unknown } | null)?.claves
  if (
    !Array.isArray(claves) ||
    claves.length === 0 ||
    claves.length > TAMANO_LOTE
  )
    return {
      status: 400,
      cuerpo: {
        ok: false,
        error: `Se esperaban entre 1 y ${TAMANO_LOTE} claves.`,
      },
    }

  const porCiudad = new Map<string, string[]>()
  for (const c of claves) {
    const ciudad = (c as { ciudad?: unknown })?.ciudad
    const fecha = (c as { fecha_hora?: unknown })?.fecha_hora
    const norm = typeof fecha === "string" ? normalizarFechaHora(fecha) : null
    if (typeof ciudad !== "string" || !norm)
      return {
        status: 400,
        cuerpo: { ok: false, error: "Clave con formato inválido." },
      }
    porCiudad.set(ciudad, [...(porCiudad.get(ciudad) ?? []), norm])
  }

  const existentes = new Set<string>()
  for (const [ciudad, fechas] of porCiudad) {
    for (let i = 0; i < fechas.length; i += TAMANO_CONSULTA_VERIFICACION) {
      const r = await repo.fechasExistentes(
        ciudad,
        fechas.slice(i, i + TAMANO_CONSULTA_VERIFICACION)
      )
      if (r.error)
        return {
          status: 502,
          cuerpo: { ok: false, error: `Supabase: ${r.error}` },
        }
      for (const f of r.fechas) existentes.add(claveRegistro(ciudad, f))
    }
  }

  const faltan: { ciudad: string; fecha_hora: string }[] = []
  for (const [ciudad, fechas] of porCiudad)
    for (const f of fechas)
      if (!existentes.has(claveRegistro(ciudad, f)))
        faltan.push({ ciudad, fecha_hora: f })
  return {
    status: 200,
    cuerpo: { ok: true, encontradas: claves.length - faltan.length, faltan },
  }
}

/** Lee el cuerpo respetando un límite de tamaño, aunque falte Content-Length. */
export async function leerJsonLimitado(
  req: Request
): Promise<{ cuerpo: unknown; error: string | null }> {
  const declarado = Number(req.headers.get("content-length") ?? "0")
  if (declarado > MAX_BYTES_PETICION)
    return {
      cuerpo: null,
      error: `Petición demasiado grande (${declarado} bytes; máximo ${MAX_BYTES_PETICION}).`,
    }
  const texto = await req.text()
  if (new TextEncoder().encode(texto).length > MAX_BYTES_PETICION)
    return {
      cuerpo: null,
      error: `Petición demasiado grande (máximo ${MAX_BYTES_PETICION} bytes).`,
    }
  try {
    return { cuerpo: JSON.parse(texto), error: null }
  } catch {
    return { cuerpo: null, error: "El cuerpo no es JSON válido." }
  }
}
