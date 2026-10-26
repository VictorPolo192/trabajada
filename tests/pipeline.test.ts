/**
 * Pruebas unitarias del pipeline con FIXTURES controlados (tests/fixtures).
 * Los fixtures nunca se mezclan con extracciones reales: solo se cargan aquí.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { limpiar } from "../lib/etl/clean"
import { construirUrl, validarPeriodo } from "../lib/etl/extract"
import {
  crearLotes,
  ejecutarLotes,
  resumirLotes,
  type EnviarLote,
} from "../lib/etl/load"
import {
  aFilaMedicion,
  aplicarFiltros,
  claveDe,
  filtrosIniciales,
  interpretarFiltros,
  ordenar,
  paginar,
  resumirSeleccion,
} from "../lib/etl/select"
import {
  interpretarFechaUtc,
  transformar,
  transformarCiudad,
} from "../lib/etl/transform"
import type {
  FilaMedicion,
  RegistroValido,
  RespuestaOpenMeteo,
} from "../lib/etl/types"

const fixture = (nombre: string) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/${nombre}`, import.meta.url), "utf8")
  ) as RespuestaOpenMeteo

/** Respuesta sintética sin defectos: n horas desde 2026-09-01T00:00. */
function respuestaSintetica(n: number, base = 0): RespuestaOpenMeteo {
  const time = Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(2026, 8, 1, i)).toISOString().slice(0, 16)
  )
  return {
    utc_offset_seconds: 0,
    hourly: {
      time,
      temperature_2m: time.map((_, i) => base + (i % 30)),
      relative_humidity_2m: time.map((_, i) => 40 + (i % 50)),
      precipitation: time.map((_, i) => (i % 7 === 0 ? 0.5 : 0)),
    },
  }
}

test("validación del periodo: máximo 31 días, orden de fechas y fechas futuras", () => {
  const hoy = new Date("2026-10-26T12:00:00Z")
  assert.deepEqual(validarPeriodo("2026-09-01", "2026-09-30", hoy).errores, [])
  assert.equal(validarPeriodo("2026-09-01", "2026-09-30", hoy).dias, 30)
  assert.equal(
    validarPeriodo("2026-08-01", "2026-08-31", hoy).errores.length,
    0
  ) // 31 días: permitido
  assert.match(
    validarPeriodo("2026-08-01", "2026-09-01", hoy).errores.join(),
    /32 días/
  )
  assert.match(
    validarPeriodo("2026-09-10", "2026-09-01", hoy).errores.join(),
    /posterior/
  )
  assert.match(
    validarPeriodo("2026-10-20", "2026-10-30", hoy).errores.join(),
    /futuros/
  )
  assert.match(
    validarPeriodo("2026-02-30", "2026-03-01", hoy).errores.join(),
    /no es válida/
  )
})

test("la URL pide UTC, °C, mm y las tres variables horarias", () => {
  const url = new URL(
    construirUrl(
      { nombre: "Barcelona", latitud: 41.3874, longitud: 2.1686 },
      "2026-09-01",
      "2026-09-01"
    )
  )
  assert.equal(
    url.origin + url.pathname,
    "https://archive-api.open-meteo.com/v1/archive"
  )
  assert.equal(url.searchParams.get("timezone"), "GMT")
  assert.equal(url.searchParams.get("temperature_unit"), "celsius")
  assert.equal(url.searchParams.get("precipitation_unit"), "mm")
  assert.equal(
    url.searchParams.get("hourly"),
    "temperature_2m,relative_humidity_2m,precipitation"
  )
})

test("2. transformación: arrays paralelos → un registro por hora, con fecha UTC explícita", () => {
  const { registros, avisos } = transformarCiudad(
    "Madrid",
    respuestaSintetica(24)
  )
  assert.equal(avisos.length, 0)
  assert.equal(registros.length, 24)
  assert.equal(registros[0].fecha_hora, "2026-09-01T00:00:00Z")
  assert.equal(registros[23].fecha_hora, "2026-09-01T23:00:00Z")
  assert.deepEqual(
    [
      registros[5].temperatura_c,
      registros[5].humedad_pct,
      registros[5].precipitacion_mm,
    ],
    [5, 45, 0]
  )
  // Interpretación UTC independiente de la zona del proceso.
  assert.equal(interpretarFechaUtc("2026-03-29T02:00"), "2026-03-29T02:00:00Z") // cambio de hora en España
  assert.equal(interpretarFechaUtc("2026-09-31T00:00"), null)
  assert.equal(interpretarFechaUtc("2026-09-01 00:00"), null)
  assert.equal(interpretarFechaUtc(null), null)
  // Si la API devolviera hora local, se convierte restando el desfase.
  assert.equal(
    interpretarFechaUtc("2026-09-01T02:00", 7200),
    "2026-09-01T00:00:00Z"
  )
})

test("2b. longitudes incoherentes: se avisa y las posiciones sin pareja quedan ausentes", () => {
  const { registros, avisos } = transformarCiudad(
    "Barcelona",
    fixture("open-meteo-con-defectos.json")
  )
  assert.equal(registros.length, 11)
  assert.ok(
    avisos.some((a) =>
      /time tiene 11 elementos y temperature_2m tiene 10/.test(a.mensaje)
    )
  )
  assert.equal(registros[10].temperatura_c, undefined)
})

test("3. null, cadena vacía y ausentes NO se convierten en cero y se rechazan con motivo", () => {
  const { registros } = transformarCiudad(
    "Barcelona",
    fixture("open-meteo-con-defectos.json")
  )
  const { validos, rechazados } = limpiar(registros)
  const motivo = (i: number) =>
    rechazados
      .find((r) => r.registro.indiceOrigen === i)
      ?.motivos.join(" | ") ?? ""

  assert.deepEqual(
    validos.map((v) => v.idFila),
    ["Barcelona#0", "Barcelona#5", "Barcelona#7", "Barcelona#9"]
  )
  assert.equal(rechazados.length, 7)
  assert.equal(registros[1].temperatura_c, null) // sigue siendo null tras transformar
  assert.match(motivo(1), /Temperatura \(°C\): null/)
  assert.match(motivo(2), /Humedad \(%\): null/)
  assert.match(motivo(3), /cadena vacía/)
  assert.match(motivo(4), /fuera del rango 0–100/)
  assert.match(motivo(6), /Precipitación negativa/)
  assert.match(motivo(8), /no numérico/) // "21.3" no se coacciona a número
  assert.match(motivo(10), /ausente/)
  // Ninguna temperatura válida es un 0 inventado; la extrema (48,7 °C) se conserva.
  assert.ok(validos.every((v) => v.temperatura_c !== 0))
  assert.ok(validos.some((v) => v.temperatura_c === 48.7))
})

test("4. duplicados por (ciudad, fecha_hora): se conserva la primera aparición válida", () => {
  const { registros } = transformarCiudad(
    "Madrid",
    fixture("open-meteo-con-duplicados.json")
  )
  const { validos, rechazados, duplicados } = limpiar(registros)
  assert.equal(duplicados, 2)
  assert.deepEqual(
    validos.map((v) => v.idFila),
    ["Madrid#0", "Madrid#1", "Madrid#3", "Madrid#5"]
  )
  assert.equal(
    validos.find((v) => v.fecha_hora === "2026-09-01T01:00:00Z")?.temperatura_c,
    16
  )
  // 03:00: la primera aparición es null (calidad); se conserva la siguiente válida.
  assert.equal(
    validos.find((v) => v.fecha_hora === "2026-09-01T03:00:00Z")?.temperatura_c,
    18
  )
  const dup = rechazados.filter((r) => r.motivos[0].startsWith("Duplicado"))
  assert.deepEqual(
    dup.map((d) => d.registro.idFila),
    ["Madrid#2", "Madrid#6"]
  )
  assert.match(dup[0].motivos[0], /Madrid#1/)
  assert.ok(
    rechazados.some(
      (r) =>
        r.registro.idFila === "Madrid#7" &&
        /Fecha\/hora inválida/.test(r.motivos[0])
    )
  )
})

test("misma hora en ciudades distintas NO es duplicado", () => {
  const { registros } = transformar([
    { ciudad: "Madrid", json: respuestaSintetica(3) },
    { ciudad: "Sevilla", json: respuestaSintetica(3) },
  ])
  assert.equal(limpiar(registros).validos.length, 6)
})

function validosSinteticos(): RegistroValido[] {
  const { registros } = transformar([
    { ciudad: "Madrid", json: respuestaSintetica(72, 0) },
    { ciudad: "Bilbao", json: respuestaSintetica(72, 5) },
  ])
  return limpiar(registros).validos
}

test("5. filtros y ordenación se aplican al conjunto completo antes de paginar", () => {
  const validos = validosSinteticos()
  const f = {
    ...filtrosIniciales(["Madrid", "Bilbao"]),
    tempMin: "20",
    hasta: "2026-09-02T23:00",
  }
  const { criterios, errores } = interpretarFiltros(f)
  assert.deepEqual(errores, [])
  const ordenados = ordenar(
    aplicarFiltros(validos, criterios),
    "temperatura_c",
    "desc"
  )
  // Comprobación independiente con un recorrido manual.
  const esperados = validos.filter(
    (v) => v.temperatura_c >= 20 && v.fecha_hora <= "2026-09-02T23:00:00Z"
  )
  assert.equal(ordenados.length, esperados.length)
  // El máximo global aparece en la PRIMERA página aunque estuviera al final de los datos originales.
  const max = Math.max(...esperados.map((e) => e.temperatura_c))
  assert.equal(paginar(ordenados, 1, 25).filas[0].temperatura_c, max)
  for (let i = 1; i < ordenados.length; i++)
    assert.ok(ordenados[i - 1].temperatura_c >= ordenados[i].temperatura_c)

  const lluvia = aplicarFiltros(
    validos,
    interpretarFiltros({ ...filtrosIniciales(["Madrid"]), soloLluvia: true })
      .criterios
  )
  assert.ok(
    lluvia.length > 0 &&
      lluvia.every((r) => r.precipitacion_mm > 0 && r.ciudad === "Madrid")
  )
  assert.match(
    interpretarFiltros({ ...f, humMin: "abc" }).errores.join(),
    /no es un número/
  )
})

test("6. selección entre páginas y filas seleccionadas que quedan fuera de los filtros", () => {
  const validos = validosSinteticos()
  const todos = ordenar(validos, "fecha_hora", "asc")
  const pag1 = paginar(todos, 1, 25).filas
  const pag4 = paginar(todos, 4, 25).filas
  const seleccion = new Set(
    [...pag1.slice(0, 3), ...pag4.slice(0, 2)].map(claveDe)
  )

  let r = resumirSeleccion(todos, seleccion)
  assert.equal(r.aSubir.length, 5)
  assert.equal(r.seleccionadosFueraDeFiltro, 0)

  // Cambia el filtro: solo Madrid. Las de Bilbao siguen seleccionadas pero no se subirán.
  const soloMadrid = ordenar(
    aplicarFiltros(
      validos,
      interpretarFiltros(filtrosIniciales(["Madrid"])).criterios
    ),
    "fecha_hora",
    "asc"
  )
  r = resumirSeleccion(soloMadrid, seleccion)
  const bilbaoSel = [...seleccion].filter((k) => k.startsWith("Bilbao")).length
  assert.equal(r.aSubir.length, 5 - bilbaoSel)
  assert.equal(r.seleccionadosFueraDeFiltro, bilbaoSel)
  // El filtro no añadió filas nuevas a la selección.
  assert.equal(seleccion.size, 5)

  // «Seleccionar todas las que cumplen los filtros» incluye filas de todas las páginas.
  const todas = new Set(soloMadrid.map(claveDe))
  assert.equal(
    resumirSeleccion(soloMadrid, todas).aSubir.length,
    soloMadrid.length
  )
  assert.ok(soloMadrid.length > 25)
})

test("7. la vista previa coincide exactamente con lo enviado, en orden y por lotes de 500", async () => {
  const { registros } = transformar(
    ["Madrid", "Bilbao", "Sevilla"].map((c, k) => ({
      ciudad: c,
      json: respuestaSintetica(31 * 24, k),
    }))
  )
  const validos = limpiar(registros).validos
  const ordenados = ordenar(validos, "temperatura_c", "desc")
  const preview = resumirSeleccion(
    ordenados,
    new Set(ordenados.map(claveDe))
  ).aSubir

  const enviados: FilaMedicion[][] = []
  const enviar: EnviarLote = async (filas) => {
    enviados.push(JSON.parse(JSON.stringify(filas)))
    return { ok: true, afectadas: filas.length }
  }
  const esperado = preview.map(aFilaMedicion)
  const lotes = crearLotes(esperado)
  // Tras congelar, cambiar el orden o los datos de origen no altera la carga.
  esperado.reverse()
  esperado[0].temperatura_c = 999
  esperado.reverse()
  preview.sort((a, b) => a.ciudad.localeCompare(b.ciudad))
  const final = await ejecutarLotes(lotes, enviar)

  assert.equal(enviados.length, Math.ceil(preview.length / 500))
  assert.ok(enviados.every((l) => l.length <= 500))
  assert.deepEqual(enviados.flat(), ordenados.map(aFilaMedicion))
  assert.ok(!enviados.flat().some((f) => f.temperatura_c === 999))
  assert.ok(enviados.flat().every((f) => !("idFila" in f)))
  assert.equal(resumirLotes(final).filasOk, preview.length)
})

test("9. fallo parcial: se conservan los lotes correctos y el reintento solo envía los fallidos", async () => {
  const filas = validosSinteticos().map(aFilaMedicion)
  const lotes = crearLotes(filas, 50) // 144 filas → 3 lotes
  assert.equal(lotes.length, 3)

  const llamadas: number[] = []
  let caido = true
  const enviar: EnviarLote = async (l) => {
    llamadas.push(l.length)
    if (caido && l === lotes[1].filas)
      return { ok: false, error: "HTTP 502: simulado" }
    return { ok: true, afectadas: l.length }
  }
  const tras1 = await ejecutarLotes(lotes, enviar)
  assert.deepEqual(
    tras1.map((l) => l.estado),
    ["ok", "error", "ok"]
  )
  assert.equal(tras1[1].error, "HTTP 502: simulado")
  assert.deepEqual(resumirLotes(tras1), {
    totalFilas: 144,
    filasOk: 94,
    filasError: 50,
    filasPendientes: 0,
    lotesOk: 2,
    lotesError: 1,
  })

  caido = false
  llamadas.length = 0
  const tras2 = await ejecutarLotes(tras1, enviar)
  assert.deepEqual(llamadas, [50]) // solo el lote 2
  assert.deepEqual(
    tras2.map((l) => [l.estado, l.intentos]),
    [
      ["ok", 1],
      ["ok", 2],
      ["ok", 1],
    ]
  )
})
