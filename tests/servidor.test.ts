/**
 * Pruebas de la lógica del servidor (validación, upsert, verificación) con un
 * repositorio EN MEMORIA que imita la restricción UNIQUE (ciudad, fecha_hora).
 * No sustituyen a la prueba de integración con un proyecto Supabase real.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { claveRegistro } from "../lib/etl/transform"
import type { FilaMedicion } from "../lib/etl/types"
import {
  leerJsonLimitado,
  MAX_BYTES_PETICION,
  procesarCarga,
  verificarClaves,
  type RepositorioMediciones,
} from "../lib/server/mediciones"

function repoEnMemoria() {
  const tabla = new Map<string, FilaMedicion & { id: number }>()
  let id = 0
  const repo: RepositorioMediciones = {
    async upsert(filas) {
      for (const f of filas) {
        const k = claveRegistro(f.ciudad, f.fecha_hora)
        const previa = tabla.get(k)
        tabla.set(k, { ...f, id: previa?.id ?? ++id })
      }
      return { afectadas: filas.length, error: null }
    },
    async fechasExistentes(ciudad, fechas) {
      return {
        fechas: fechas.filter((f) => tabla.has(claveRegistro(ciudad, f))),
        error: null,
      }
    },
  }
  return { repo, tabla }
}

const fila = (h: number, extra: Partial<FilaMedicion> = {}): FilaMedicion => ({
  ciudad: "Sevilla",
  fecha_hora: new Date(Date.UTC(2026, 8, 1, h))
    .toISOString()
    .replace(".000Z", "Z"),
  temperatura_c: 25 + h / 10,
  humedad_pct: 50,
  precipitacion_mm: 0,
  ...extra,
})

test("8. una segunda carga del mismo conjunto no duplica filas (upsert por clave)", async () => {
  const { repo, tabla } = repoEnMemoria()
  const lote = Array.from({ length: 24 }, (_, h) => fila(h))
  const r1 = await procesarCarga({ registros: lote }, repo)
  assert.equal(r1.status, 200)
  const r2 = await procesarCarga(
    {
      registros: lote.map((f) => ({
        ...f,
        temperatura_c: f.temperatura_c + 1,
      })),
    },
    repo
  )
  assert.equal(r2.status, 200)
  assert.equal(tabla.size, 24)
  assert.equal(
    tabla.get(claveRegistro("Sevilla", fila(0).fecha_hora))?.temperatura_c,
    26
  ) // actualizada
  // La respuesta no inventa inserciones/actualizaciones: solo «afectadas».
  assert.deepEqual(Object.keys(r2.cuerpo).sort(), [
    "afectadas",
    "ok",
    "recibidas",
  ])
})

test("el servidor vuelve a validar: rechaza el lote completo si una fila es inválida", async () => {
  const { repo, tabla } = repoEnMemoria()
  const casos: [unknown, RegExp][] = [
    [
      { registros: [fila(0), fila(1, { humedad_pct: 101 })] },
      /Registro 2.*Humedad fuera/,
    ],
    [
      { registros: [fila(0, { temperatura_c: null as unknown as number })] },
      /Temperatura \(°C\): null/,
    ],
    [{ registros: [fila(0, { ciudad: "Atlantis" })] }, /Ciudad/],
    [
      { registros: [fila(0, { fecha_hora: "2026-09-01T00:00" })] },
      /zona horaria/,
    ],
    [{ registros: [{ ...fila(0), id: 7 }] }, /Campos no permitidos: id/],
    [{ registros: [fila(0), fila(0)] }, /duplicado en el lote/],
    [
      { registros: Array.from({ length: 501 }, (_, h) => fila(h)) },
      /máximo es 500/,
    ],
    [{ registros: [] }, /vacío/],
    [{ otra: 1 }, /registros/],
  ]
  for (const [cuerpo, re] of casos) {
    const r = await procesarCarga(cuerpo, repo)
    assert.equal(r.status, 400)
    assert.ok(
      !r.cuerpo.ok && re.test(r.cuerpo.error),
      `esperaba ${re}, obtuvo ${JSON.stringify(r.cuerpo)}`
    )
  }
  assert.equal(tabla.size, 0)
})

test("un error de la base de datos se propaga como fallo del lote", async () => {
  const repo: RepositorioMediciones = {
    upsert: async () => ({
      afectadas: null,
      error: "violates check constraint",
    }),
    fechasExistentes: async () => ({ fechas: [], error: null }),
  }
  const r = await procesarCarga({ registros: [fila(0)] }, repo)
  assert.equal(r.status, 502)
  assert.ok(!r.cuerpo.ok && /violates check constraint/.test(r.cuerpo.error))
})

test("verificación por lotes: detecta claves ausentes y normaliza el formato de Postgres", async () => {
  const { repo } = repoEnMemoria()
  const consultas: number[] = []
  const repoEspia: RepositorioMediciones = {
    upsert: repo.upsert,
    async fechasExistentes(ciudad, fechas) {
      consultas.push(fechas.length)
      const r = await repo.fechasExistentes(ciudad, fechas)
      // Postgres devuelve "+00:00" en lugar de "Z".
      return { ...r, fechas: r.fechas.map((f) => f.replace("Z", "+00:00")) }
    },
  }
  const filas = Array.from({ length: 250 }, (_, h) => fila(h))
  await procesarCarga({ registros: filas.slice(0, 200) }, repo)
  const r = await verificarClaves(
    {
      claves: filas.map((f) => ({
        ciudad: f.ciudad,
        fecha_hora: f.fecha_hora,
      })),
    },
    repoEspia
  )
  assert.ok(r.cuerpo.ok)
  if (r.cuerpo.ok) {
    assert.equal(r.cuerpo.encontradas, 200)
    assert.equal(r.cuerpo.faltan.length, 50)
  }
  assert.deepEqual(consultas, [100, 100, 50]) // consultas acotadas
})

test("límite de tamaño de la petición", async () => {
  const grande = new Request("http://x/api", {
    method: "POST",
    body: "x".repeat(MAX_BYTES_PETICION + 1),
  })
  assert.match((await leerJsonLimitado(grande)).error ?? "", /demasiado grande/)
  const malJson = new Request("http://x/api", { method: "POST", body: "{no" })
  assert.match((await leerJsonLimitado(malJson)).error ?? "", /JSON/)
})
