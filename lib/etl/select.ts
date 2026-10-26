import { claveRegistro, interpretarFechaUtc } from "./transform"
import type { FilaMedicion, RegistroValido } from "./types"

export type CampoOrden =
  "ciudad" | "fecha_hora" | "temperatura_c" | "humedad_pct" | "precipitacion_mm"
export type Direccion = "asc" | "desc"

/** Valores tal como están en el formulario (cadenas vacías = sin límite). */
export type Filtros = {
  ciudades: string[]
  /** "AAAA-MM-DDTHH:MM" interpretado como UTC. */
  desde: string
  hasta: string
  tempMin: string
  tempMax: string
  humMin: string
  humMax: string
  precMin: string
  precMax: string
  soloLluvia: boolean
}

export function filtrosIniciales(ciudades: string[]): Filtros {
  return {
    ciudades: [...ciudades],
    desde: "",
    hasta: "",
    tempMin: "",
    tempMax: "",
    humMin: "",
    humMax: "",
    precMin: "",
    precMax: "",
    soloLluvia: false,
  }
}

type Criterios = {
  ciudades: Set<string>
  desde: number | null
  hasta: number | null
  rangos: { campo: CampoOrden; min: number | null; max: number | null }[]
  soloLluvia: boolean
}

export function interpretarFiltros(f: Filtros): {
  criterios: Criterios
  errores: string[]
} {
  const errores: string[] = []
  const num = (texto: string, etiqueta: string): number | null => {
    if (texto.trim() === "") return null
    const n = Number(texto.replace(",", "."))
    if (!Number.isFinite(n)) {
      errores.push(`${etiqueta}: «${texto}» no es un número; se ignora.`)
      return null
    }
    return n
  }
  const fecha = (texto: string, etiqueta: string): number | null => {
    if (texto === "") return null
    const iso = interpretarFechaUtc(texto)
    if (!iso) {
      errores.push(`${etiqueta}: fecha no válida; se ignora.`)
      return null
    }
    return Date.parse(iso)
  }
  const rangos: Criterios["rangos"] = [
    {
      campo: "temperatura_c",
      min: num(f.tempMin, "Temperatura mínima"),
      max: num(f.tempMax, "Temperatura máxima"),
    },
    {
      campo: "humedad_pct",
      min: num(f.humMin, "Humedad mínima"),
      max: num(f.humMax, "Humedad máxima"),
    },
    {
      campo: "precipitacion_mm",
      min: num(f.precMin, "Precipitación mínima"),
      max: num(f.precMax, "Precipitación máxima"),
    },
  ]
  for (const r of rangos)
    if (r.min !== null && r.max !== null && r.min > r.max)
      errores.push(
        `El mínimo de ${r.campo} es mayor que el máximo: ningún registro coincidirá.`
      )
  const desde = fecha(f.desde, "Desde")
  const hasta = fecha(f.hasta, "Hasta")
  if (desde !== null && hasta !== null && desde > hasta)
    errores.push("«Desde» es posterior a «Hasta»: ningún registro coincidirá.")
  return {
    criterios: {
      ciudades: new Set(f.ciudades),
      desde,
      hasta,
      rangos,
      soloLluvia: f.soloLluvia,
    },
    errores,
  }
}

export function aplicarFiltros(
  registros: RegistroValido[],
  c: Criterios
): RegistroValido[] {
  return registros.filter((r) => {
    if (!c.ciudades.has(r.ciudad)) return false
    const t = Date.parse(r.fecha_hora)
    if (c.desde !== null && t < c.desde) return false
    if (c.hasta !== null && t > c.hasta) return false
    for (const rango of c.rangos) {
      const v = r[rango.campo] as number
      if (rango.min !== null && v < rango.min) return false
      if (rango.max !== null && v > rango.max) return false
    }
    if (c.soloLluvia && !(r.precipitacion_mm > 0)) return false
    return true
  })
}

function comparar(
  a: RegistroValido,
  b: RegistroValido,
  campo: CampoOrden
): number {
  if (campo === "ciudad") return a.ciudad.localeCompare(b.ciudad, "es")
  if (campo === "fecha_hora")
    return Date.parse(a.fecha_hora) - Date.parse(b.fecha_hora)
  return (a[campo] as number) - (b[campo] as number)
}

/** Ordena sin mutar. Desempate fijo por ciudad y fecha para que el orden sea determinista. */
export function ordenar(
  registros: RegistroValido[],
  campo: CampoOrden,
  dir: Direccion
): RegistroValido[] {
  const signo = dir === "asc" ? 1 : -1
  return [...registros].sort(
    (a, b) =>
      signo * comparar(a, b, campo) ||
      comparar(a, b, "ciudad") ||
      comparar(a, b, "fecha_hora")
  )
}

export function claveDe(r: { ciudad: string; fecha_hora: string }): string {
  return claveRegistro(r.ciudad, r.fecha_hora)
}

export type ResumenSeleccion = {
  /** Conjunto exacto a subir: seleccionados ∩ filtrados, en el orden elegido. */
  aSubir: RegistroValido[]
  seleccionadosFueraDeFiltro: number
}

/**
 * Orden de operaciones: válidos → filtros → ordenación → selección.
 * `ordenados` ya debe venir filtrado y ordenado.
 */
export function resumirSeleccion(
  ordenados: RegistroValido[],
  seleccion: ReadonlySet<string>
): ResumenSeleccion {
  const aSubir = ordenados.filter((r) => seleccion.has(claveDe(r)))
  return { aSubir, seleccionadosFueraDeFiltro: seleccion.size - aSubir.length }
}

export function aFilaMedicion(r: RegistroValido): FilaMedicion {
  return {
    ciudad: r.ciudad,
    fecha_hora: r.fecha_hora,
    temperatura_c: r.temperatura_c,
    humedad_pct: r.humedad_pct,
    precipitacion_mm: r.precipitacion_mm,
  }
}

export function paginar<T>(filas: T[], pagina: number, tamano: number) {
  const totalPaginas = Math.max(1, Math.ceil(filas.length / tamano))
  const actual = Math.min(Math.max(1, pagina), totalPaginas)
  return {
    filas: filas.slice((actual - 1) * tamano, actual * tamano),
    pagina: actual,
    totalPaginas,
  }
}
