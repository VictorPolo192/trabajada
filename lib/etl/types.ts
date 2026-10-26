// Tipos compartidos por todas las fases del pipeline ETL.

export type Ciudad = {
  nombre: string
  latitud: number
  longitud: number
}

/** Respuesta JSON de Open-Meteo tal cual llega (no se confía en su forma). */
export type RespuestaOpenMeteo = {
  latitude?: unknown
  longitude?: unknown
  utc_offset_seconds?: unknown
  timezone?: unknown
  hourly_units?: Record<string, unknown>
  hourly?: Record<string, unknown>
  [clave: string]: unknown
}

/** Resultado de la extracción de una ciudad. */
export type ExtraccionCiudad =
  | {
      ciudad: string
      estado: "ok"
      url: string
      json: RespuestaOpenMeteo
      duracionMs: number
      descargadoEn: string
      /** true si procede de un fixture de pruebas y no de la API real. */
      esFixture?: boolean
    }
  | {
      ciudad: string
      estado: "error"
      url: string
      error: string
      duracionMs: number
    }

/**
 * Registro tras la transformación: un registro por ciudad y hora.
 * Los valores todavía no están validados: pueden ser null, cadenas, etc.
 */
export type RegistroTransformado = {
  /** Identificador estable dentro de la sesión: ciudad#índice. */
  idFila: string
  ciudad: string
  indiceOrigen: number
  /** Valor original de la API (p. ej. "2026-09-01T00:00"). */
  fechaOriginal: unknown
  /** ISO 8601 en UTC con "Z" explícita, o null si no se pudo interpretar. */
  fecha_hora: string | null
  temperatura_c: unknown
  humedad_pct: unknown
  precipitacion_mm: unknown
}

/** Registro limpio, listo para filtrar y cargar. */
export type RegistroValido = {
  idFila: string
  ciudad: string
  fecha_hora: string
  temperatura_c: number
  humedad_pct: number
  precipitacion_mm: number
}

export type RegistroRechazado = {
  registro: RegistroTransformado
  motivos: string[]
}

/** Fila que se envía a Supabase (sin campos internos). */
export type FilaMedicion = {
  ciudad: string
  fecha_hora: string
  temperatura_c: number
  humedad_pct: number
  precipitacion_mm: number
}

export type AvisoTransformacion = {
  ciudad: string
  mensaje: string
}
