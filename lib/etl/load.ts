import type { FilaMedicion } from "./types"

export const TAMANO_LOTE = 500

export type EstadoLote = "pendiente" | "en_curso" | "ok" | "error"

export type Lote = {
  numero: number
  filas: FilaMedicion[]
  estado: EstadoLote
  /** Filas que Supabase declara afectadas (insertadas o actualizadas, sin distinguir). */
  afectadas: number | null
  error: string | null
  duracionMs: number | null
  intentos: number
}

export type RespuestaCarga =
  { ok: true; afectadas: number | null } | { ok: false; error: string }

export type EnviarLote = (filas: FilaMedicion[]) => Promise<RespuestaCarga>

/** Divide una copia congelada del conjunto, respetando su orden. */
export function crearLotes(
  filas: readonly FilaMedicion[],
  tamano = TAMANO_LOTE
): Lote[] {
  const copia = filas.map((f) => Object.freeze({ ...f }))
  const lotes: Lote[] = []
  for (let i = 0; i < copia.length; i += tamano)
    lotes.push({
      numero: lotes.length + 1,
      filas: copia.slice(i, i + tamano),
      estado: "pendiente",
      afectadas: null,
      error: null,
      duracionMs: null,
      intentos: 0,
    })
  return lotes
}

/**
 * Envía en secuencia los lotes pendientes o fallidos (los correctos no se reenvían).
 * Si un lote falla se continúa con los siguientes y el fallo queda registrado
 * para reintentarlo después. `alCambiar` recibe una copia nueva tras cada paso.
 */
export async function ejecutarLotes(
  lotes: Lote[],
  enviar: EnviarLote,
  alCambiar: (lotes: Lote[]) => void = () => {}
): Promise<Lote[]> {
  let estado = lotes.map((l) => ({ ...l }))
  const actualizar = (numero: number, cambios: Partial<Lote>) => {
    estado = estado.map((l) => (l.numero === numero ? { ...l, ...cambios } : l))
    alCambiar(estado)
  }
  for (const lote of lotes) {
    if (lote.estado === "ok") continue
    actualizar(lote.numero, { estado: "en_curso", error: null })
    const t0 = performance.now()
    let r: RespuestaCarga
    try {
      r = await enviar(lote.filas)
    } catch (e) {
      r = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
    const base = {
      duracionMs: performance.now() - t0,
      intentos: lote.intentos + 1,
    }
    if (r.ok)
      actualizar(lote.numero, { ...base, estado: "ok", afectadas: r.afectadas })
    else
      actualizar(lote.numero, {
        ...base,
        estado: "error",
        error: r.error,
        afectadas: null,
      })
  }
  return estado
}

export function resumirLotes(lotes: Lote[]) {
  const sum = (estado: EstadoLote) =>
    lotes
      .filter((l) => l.estado === estado)
      .reduce((n, l) => n + l.filas.length, 0)
  return {
    totalFilas: lotes.reduce((n, l) => n + l.filas.length, 0),
    filasOk: sum("ok"),
    filasError: sum("error"),
    filasPendientes: sum("pendiente") + sum("en_curso"),
    lotesOk: lotes.filter((l) => l.estado === "ok").length,
    lotesError: lotes.filter((l) => l.estado === "error").length,
  }
}

/** Cliente HTTP real hacia la ruta del servidor. */
export const enviarLoteHttp: EnviarLote = async (filas) => {
  try {
    const res = await fetch("/api/supabase/cargar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registros: filas }),
    })
    const cuerpo = await res.json().catch(() => null)
    if (!res.ok || !cuerpo?.ok)
      return { ok: false, error: cuerpo?.error ?? `HTTP ${res.status}` }
    return {
      ok: true,
      afectadas: typeof cuerpo.afectadas === "number" ? cuerpo.afectadas : null,
    }
  } catch (e) {
    return {
      ok: false,
      error: `Error de red: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}
