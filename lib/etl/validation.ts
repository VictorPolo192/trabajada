import { NOMBRES_CIUDADES } from "./cities"
import { normalizarFechaHora } from "./transform"
import type { FilaMedicion } from "./types"

export const HUMEDAD_MIN = 0
export const HUMEDAD_MAX = 100

/** Describe por qué un valor no es un número utilizable (o null si lo es). */
export function problemaNumerico(valor: unknown): string | null {
  if (valor === undefined) return "ausente"
  if (valor === null) return "null"
  if (valor === "") return "cadena vacía"
  if (typeof valor === "string") return `texto «${valor}» (no numérico)`
  if (typeof valor !== "number") return `tipo ${typeof valor} (no numérico)`
  if (!Number.isFinite(valor)) return `${valor} (no finito)`
  return null
}

const ETIQUETAS = {
  temperatura_c: "Temperatura (°C)",
  humedad_pct: "Humedad (%)",
  precipitacion_mm: "Precipitación (mm)",
} as const

/**
 * Reglas de calidad de una medición. Se usan en la limpieza (navegador)
 * y de nuevo en el servidor antes de escribir: el servidor no confía en el cliente.
 * No hay umbrales de temperatura: un valor extremo no es por sí mismo un error.
 */
export function motivosMedicion(m: {
  temperatura_c: unknown
  humedad_pct: unknown
  precipitacion_mm: unknown
}): string[] {
  const motivos: string[] = []
  for (const campo of Object.keys(ETIQUETAS) as (keyof typeof ETIQUETAS)[]) {
    const p = problemaNumerico(m[campo])
    if (p) motivos.push(`${ETIQUETAS[campo]}: ${p}`)
  }
  const h = m.humedad_pct
  if (
    typeof h === "number" &&
    Number.isFinite(h) &&
    (h < HUMEDAD_MIN || h > HUMEDAD_MAX)
  )
    motivos.push(`Humedad fuera del rango 0–100 %: ${h}`)
  const p = m.precipitacion_mm
  if (typeof p === "number" && Number.isFinite(p) && p < 0)
    motivos.push(`Precipitación negativa: ${p} mm`)
  return motivos
}

/** Validación estricta de una fila recibida por la API del servidor. */
export function validarFilaEntrante(
  valor: unknown
): { fila: FilaMedicion; motivos: [] } | { fila: null; motivos: string[] } {
  if (!valor || typeof valor !== "object" || Array.isArray(valor))
    return { fila: null, motivos: ["No es un objeto"] }
  const o = valor as Record<string, unknown>
  const permitidas = new Set([
    "ciudad",
    "fecha_hora",
    "temperatura_c",
    "humedad_pct",
    "precipitacion_mm",
  ])
  const motivos: string[] = []
  const extra = Object.keys(o).filter((k) => !permitidas.has(k))
  if (extra.length) motivos.push(`Campos no permitidos: ${extra.join(", ")}`)
  if (typeof o.ciudad !== "string" || !NOMBRES_CIUDADES.includes(o.ciudad))
    motivos.push("Ciudad ausente o desconocida")
  const fecha =
    typeof o.fecha_hora === "string" &&
    /(Z|[+-]\d{2}:\d{2})$/.test(o.fecha_hora)
      ? normalizarFechaHora(o.fecha_hora)
      : null
  if (!fecha) motivos.push("fecha_hora ausente o sin zona horaria explícita")
  motivos.push(...motivosMedicion(o as Parameters<typeof motivosMedicion>[0]))
  if (motivos.length) return { fila: null, motivos }
  return {
    fila: {
      ciudad: o.ciudad as string,
      fecha_hora: fecha!,
      temperatura_c: o.temperatura_c as number,
      humedad_pct: o.humedad_pct as number,
      precipitacion_mm: o.precipitacion_mm as number,
    },
    motivos: [],
  }
}
