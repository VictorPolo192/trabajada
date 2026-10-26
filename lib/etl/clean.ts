import { claveRegistro } from "./transform"
import type {
  RegistroRechazado,
  RegistroTransformado,
  RegistroValido,
} from "./types"
import { motivosMedicion } from "./validation"

export type ResultadoLimpieza = {
  validos: RegistroValido[]
  rechazados: RegistroRechazado[]
  duplicados: number
}

function describir(v: unknown): string {
  if (v === undefined) return "ausente"
  return JSON.stringify(v)
}

/**
 * Aplica las reglas de calidad y elimina duplicados.
 *
 * Duplicados: la clave es (ciudad, fecha_hora). Se recorren los registros en el
 * orden de extracción (ciudad y después posición en el array) y se conserva la
 * PRIMERA aparición válida; las siguientes se rechazan indicando cuál se conservó.
 * La deduplicación se hace después de validar, para que un registro defectuoso
 * nunca desplace a uno correcto con la misma clave.
 */
export function limpiar(registros: RegistroTransformado[]): ResultadoLimpieza {
  const validos: RegistroValido[] = []
  const rechazados: RegistroRechazado[] = []
  const vistos = new Map<string, string>()
  let duplicados = 0

  for (const r of registros) {
    const motivos: string[] = []
    if (typeof r.ciudad !== "string" || r.ciudad.trim() === "")
      motivos.push("Sin ciudad")
    if (r.fecha_hora === null)
      motivos.push(
        `Fecha/hora inválida o ausente (valor original: ${describir(r.fechaOriginal)})`
      )
    motivos.push(...motivosMedicion(r))

    if (motivos.length) {
      rechazados.push({ registro: r, motivos })
      continue
    }

    const clave = claveRegistro(r.ciudad, r.fecha_hora!)
    const conservado = vistos.get(clave)
    if (conservado) {
      duplicados++
      rechazados.push({
        registro: r,
        motivos: [
          `Duplicado de (ciudad, fecha_hora): se conserva la primera aparición (${conservado})`,
        ],
      })
      continue
    }
    vistos.set(clave, r.idFila)
    validos.push({
      idFila: r.idFila,
      ciudad: r.ciudad,
      fecha_hora: r.fecha_hora!,
      temperatura_c: r.temperatura_c as number,
      humedad_pct: r.humedad_pct as number,
      precipitacion_mm: r.precipitacion_mm as number,
    })
  }
  return { validos, rechazados, duplicados }
}
