/**
 * Prueba de INTEGRACIÓN contra la API real de Open-Meteo (requiere red).
 * Usa datos reales; no utiliza fixtures.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { CIUDADES } from "../lib/etl/cities"
import { limpiar } from "../lib/etl/clean"
import { extraerCiudad } from "../lib/etl/extract"
import { transformarCiudad } from "../lib/etl/transform"

test("1. extracción real: una ciudad durante un día devuelve 24 registros horarios en UTC", async () => {
  const barcelona = CIUDADES[0]
  const e = await extraerCiudad(barcelona, "2026-09-01", "2026-09-01")
  assert.equal(e.estado, "ok", e.estado === "error" ? e.error : "")
  if (e.estado !== "ok") return

  assert.equal(e.json.utc_offset_seconds, 0)
  assert.equal(e.json.hourly_units?.temperature_2m, "°C")
  assert.equal(e.json.hourly_units?.precipitation, "mm")

  const { registros, avisos } = transformarCiudad(barcelona.nombre, e.json)
  assert.deepEqual(avisos, [])
  assert.equal(registros.length, 24)
  assert.equal(registros[0].fecha_hora, "2026-09-01T00:00:00Z")
  assert.equal(registros[23].fecha_hora, "2026-09-01T23:00:00Z")

  const { validos, rechazados } = limpiar(registros)
  console.log(
    `   válidos: ${validos.length}, rechazados: ${rechazados.length}, duración: ${Math.round(e.duracionMs)} ms`
  )
  assert.equal(validos.length + rechazados.length, 24)
})

test("error controlado de la API: fecha anterior al archivo devuelve el motivo", async () => {
  const e = await extraerCiudad(CIUDADES[1], "1900-01-01", "1900-01-02")
  assert.equal(e.estado, "error")
  if (e.estado === "error") assert.match(e.error, /HTTP 400/)
})
