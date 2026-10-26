import type {
  AvisoTransformacion,
  RegistroTransformado,
  RespuestaOpenMeteo,
} from "./types"

const RE_FECHA_HORA = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

/** Formato canónico de fecha_hora en toda la aplicación: "AAAA-MM-DDTHH:MM:SSZ". */
export function aIsoUtc(ms: number): string {
  return new Date(ms).toISOString().replace(".000Z", "Z")
}

/** Normaliza cualquier marca temporal con zona (p. ej. la que devuelve Postgres). */
export function normalizarFechaHora(valor: string): string | null {
  const ms = Date.parse(valor)
  return Number.isNaN(ms) ? null : aIsoUtc(ms)
}

/**
 * Interpreta "2026-09-01T00:00" (sin zona) como hora UTC de forma explícita.
 * No se usa new Date(valor) porque, sin sufijo, JavaScript lo trataría como hora local.
 */
export function interpretarFechaUtc(
  valor: unknown,
  desfaseSegundos = 0
): string | null {
  if (typeof valor !== "string") return null
  const m = RE_FECHA_HORA.exec(valor)
  if (!m) return null
  const [, fecha, hh, mm, ss = "00"] = m
  const texto = `${fecha}T${hh}:${mm}:${ss}Z`
  const ms = Date.parse(texto)
  if (Number.isNaN(ms)) return null
  // Rechaza fechas imposibles que el motor pudiera "corregir" (31 de abril, 25:00…).
  if (new Date(ms).toISOString().slice(0, 19) !== texto.slice(0, 19))
    return null
  return aIsoUtc(ms - desfaseSegundos * 1000)
}

export function claveRegistro(ciudad: string, fechaHora: string): string {
  return `${ciudad}|${normalizarFechaHora(fechaHora) ?? fechaHora}`
}

const VARIABLES = [
  { api: "temperature_2m", campo: "temperatura_c", unidad: "°C" },
  { api: "relative_humidity_2m", campo: "humedad_pct", unidad: "%" },
  { api: "precipitation", campo: "precipitacion_mm", unidad: "mm" },
] as const

export type ResultadoTransformacion = {
  registros: RegistroTransformado[]
  avisos: AvisoTransformacion[]
}

/**
 * Convierte los arrays paralelos de una respuesta en un registro por hora.
 * No valida valores: eso es tarea de la limpieza. Sí comprueba la estructura
 * y deja constancia de cualquier incoherencia en `avisos`.
 */
export function transformarCiudad(
  ciudad: string,
  json: RespuestaOpenMeteo
): ResultadoTransformacion {
  const avisos: AvisoTransformacion[] = []
  const aviso = (mensaje: string) => avisos.push({ ciudad, mensaje })

  const hourly = json.hourly
  if (!hourly || typeof hourly !== "object") {
    aviso(
      "La respuesta no contiene el bloque «hourly»: no se generan registros."
    )
    return { registros: [], avisos }
  }

  let desfase = 0
  if (json.utc_offset_seconds !== 0) {
    if (
      typeof json.utc_offset_seconds === "number" &&
      Number.isFinite(json.utc_offset_seconds)
    ) {
      desfase = json.utc_offset_seconds
      aviso(
        `utc_offset_seconds = ${desfase}: las horas se convierten a UTC restando el desfase.`
      )
    } else {
      aviso(
        "utc_offset_seconds ausente; se asume que las horas ya están en UTC (se pidió timezone=GMT)."
      )
    }
  }

  const unidades = json.hourly_units ?? {}
  for (const v of VARIABLES) {
    const recibida = unidades[v.api]
    if (recibida !== undefined && recibida !== v.unidad)
      aviso(
        `Unidad inesperada para ${v.api}: «${String(recibida)}» (se esperaba «${v.unidad}»).`
      )
  }

  const tiempos = Array.isArray(hourly.time) ? hourly.time : null
  if (!tiempos)
    aviso("«hourly.time» no es un array: ningún registro tendrá fecha válida.")

  const columnas: Record<string, unknown[] | null> = {}
  let longitudMaxima = tiempos?.length ?? 0
  for (const v of VARIABLES) {
    const arr = hourly[v.api]
    if (!Array.isArray(arr)) {
      aviso(
        `«hourly.${v.api}» no es un array: la medición quedará ausente en todos los registros.`
      )
      columnas[v.api] = null
      continue
    }
    columnas[v.api] = arr
    if (tiempos && arr.length !== tiempos.length)
      aviso(
        `Longitudes incoherentes: time tiene ${tiempos.length} elementos y ${v.api} tiene ${arr.length}.`
      )
    longitudMaxima = Math.max(longitudMaxima, arr.length)
  }

  // Se recorre la longitud máxima para que ningún valor desaparezca en silencio:
  // las posiciones sin pareja quedan como ausentes y la limpieza las rechaza.
  const registros: RegistroTransformado[] = []
  for (let i = 0; i < longitudMaxima; i++) {
    const fechaOriginal = tiempos ? tiempos[i] : undefined
    const valor = (api: string) => {
      const col = columnas[api]
      return col && i < col.length ? col[i] : undefined
    }
    registros.push({
      idFila: `${ciudad}#${i}`,
      ciudad,
      indiceOrigen: i,
      fechaOriginal,
      fecha_hora: interpretarFechaUtc(fechaOriginal, desfase),
      temperatura_c: valor("temperature_2m"),
      humedad_pct: valor("relative_humidity_2m"),
      precipitacion_mm: valor("precipitation"),
    })
  }
  return { registros, avisos }
}

export function transformar(
  entradas: { ciudad: string; json: RespuestaOpenMeteo }[]
): ResultadoTransformacion {
  const registros: RegistroTransformado[] = []
  const avisos: AvisoTransformacion[] = []
  for (const e of entradas) {
    const r = transformarCiudad(e.ciudad, e.json)
    registros.push(...r.registros)
    avisos.push(...r.avisos)
  }
  return { registros, avisos }
}
