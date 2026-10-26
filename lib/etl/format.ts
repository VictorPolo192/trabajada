const fmtNumero = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 })
const fmtEntero = new Intl.NumberFormat("es-ES")

export function numero(n: number): string {
  return fmtNumero.format(n)
}

export function entero(n: number): string {
  return fmtEntero.format(n)
}

/** "2026-09-01T05:00:00Z" → "2026-09-01 05:00 UTC" (siempre en UTC, nunca en hora local). */
export function fechaHoraUtc(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return iso
  const s = new Date(ms).toISOString()
  return `${s.slice(0, 10)} ${s.slice(11, 16)} UTC`
}

export function duracion(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—"
  if (ms < 1) return "< 1 ms"
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toLocaleString("es-ES", { maximumFractionDigits: 2 })} s`
}

/** Representa un valor crudo sin ocultar su tipo: null, "" y ausente se ven distintos. */
export function valorCrudo(v: unknown): string {
  if (v === undefined) return "(ausente)"
  if (v === null) return "null"
  if (v === "") return '""'
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : `${v}`
  return JSON.stringify(v)
}

export function descargarJson(nombre: string, datos: unknown) {
  const blob = new Blob([JSON.stringify(datos, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}
