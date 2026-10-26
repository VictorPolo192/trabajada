import type { Ciudad, ExtraccionCiudad, RespuestaOpenMeteo } from "./types"

export const URL_ARCHIVO_OPEN_METEO =
  "https://archive-api.open-meteo.com/v1/archive"
export const VARIABLES_HORARIAS = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
] as const
export const MAX_DIAS_EXTRACCION = 31
const TIEMPO_MAXIMO_PETICION_MS = 30_000
const MS_DIA = 86_400_000
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Convierte "AAAA-MM-DD" en milisegundos UTC, o null si no es una fecha real. */
export function fechaIsoAMs(fecha: string): number | null {
  if (!RE_FECHA.test(fecha)) return null
  const ms = Date.parse(`${fecha}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  // Date.parse acepta 2026-02-30 en algunos motores; se comprueba la ida y vuelta.
  if (new Date(ms).toISOString().slice(0, 10) !== fecha) return null
  return ms
}

export function diasInclusivos(inicio: string, fin: string): number | null {
  const a = fechaIsoAMs(inicio)
  const b = fechaIsoAMs(fin)
  if (a === null || b === null) return null
  return Math.round((b - a) / MS_DIA) + 1
}

export type ValidacionPeriodo = {
  errores: string[]
  avisos: string[]
  dias: number
}

export function validarPeriodo(
  inicio: string,
  fin: string,
  hoy: Date = new Date()
): ValidacionPeriodo {
  const errores: string[] = []
  const avisos: string[] = []
  const a = fechaIsoAMs(inicio)
  const b = fechaIsoAMs(fin)
  if (a === null) errores.push("La fecha inicial no es válida (AAAA-MM-DD).")
  if (b === null) errores.push("La fecha final no es válida (AAAA-MM-DD).")
  if (a === null || b === null) return { errores, avisos, dias: 0 }

  const dias = Math.round((b - a) / MS_DIA) + 1
  if (b < a)
    errores.push("La fecha final debe ser igual o posterior a la inicial.")
  if (dias > MAX_DIAS_EXTRACCION)
    errores.push(
      `El periodo tiene ${dias} días; el máximo por extracción es ${MAX_DIAS_EXTRACCION}.`
    )
  const hoyMs = Date.UTC(
    hoy.getUTCFullYear(),
    hoy.getUTCMonth(),
    hoy.getUTCDate()
  )
  if (b > hoyMs)
    errores.push(
      "La API histórica no ofrece datos futuros: la fecha final es posterior a hoy (UTC)."
    )
  else if (b > hoyMs - 5 * MS_DIA)
    avisos.push(
      "Los últimos ~5 días pueden llegar incompletos (ERA5 se publica con retraso): es posible que aparezcan valores null."
    )
  return { errores, avisos, dias: Math.max(dias, 0) }
}

export function construirUrl(ciudad: Ciudad, inicio: string, fin: string) {
  const params = new URLSearchParams({
    latitude: String(ciudad.latitud),
    longitude: String(ciudad.longitud),
    start_date: inicio,
    end_date: fin,
    hourly: VARIABLES_HORARIAS.join(","),
    timezone: "GMT",
    temperature_unit: "celsius",
    precipitation_unit: "mm",
    timeformat: "iso8601",
  })
  return `${URL_ARCHIVO_OPEN_METEO}?${params.toString()}`
}

/**
 * Descarga los datos de una ciudad. Nunca lanza: los errores se devuelven
 * como resultado para poder mostrarlos y reintentar solo esa ciudad.
 */
export async function extraerCiudad(
  ciudad: Ciudad,
  inicio: string,
  fin: string,
  fetchImpl: typeof fetch = fetch
): Promise<ExtraccionCiudad> {
  const url = construirUrl(ciudad, inicio, fin)
  const t0 = performance.now()
  const fallo = (error: string): ExtraccionCiudad => ({
    ciudad: ciudad.nombre,
    estado: "error",
    url,
    error,
    duracionMs: performance.now() - t0,
  })

  let respuesta: Response
  try {
    respuesta = await fetchImpl(url, {
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_PETICION_MS),
    })
  } catch (e) {
    const nombre = e instanceof Error ? e.name : ""
    if (nombre === "TimeoutError")
      return fallo(
        `Tiempo de espera agotado (${TIEMPO_MAXIMO_PETICION_MS / 1000} s).`
      )
    return fallo(`Error de red: ${e instanceof Error ? e.message : String(e)}`)
  }

  let cuerpo: unknown
  try {
    cuerpo = await respuesta.json()
  } catch {
    return fallo(`Respuesta no JSON (HTTP ${respuesta.status}).`)
  }

  if (!respuesta.ok) {
    const motivo =
      cuerpo && typeof cuerpo === "object" && "reason" in cuerpo
        ? String((cuerpo as { reason: unknown }).reason)
        : "sin detalle"
    return fallo(`HTTP ${respuesta.status}: ${motivo}`)
  }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo))
    return fallo("La respuesta no es un objeto JSON.")

  return {
    ciudad: ciudad.nombre,
    estado: "ok",
    url,
    json: cuerpo as RespuestaOpenMeteo,
    duracionMs: performance.now() - t0,
    descargadoEn: new Date().toISOString(),
  }
}
