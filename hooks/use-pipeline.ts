"use client"

import * as React from "react"

import { CIUDADES, buscarCiudad } from "@/lib/etl/cities"
import { limpiar } from "@/lib/etl/clean"
import { extraerCiudad } from "@/lib/etl/extract"
import {
  crearLotes,
  ejecutarLotes,
  enviarLoteHttp,
  type Lote,
} from "@/lib/etl/load"
import {
  aFilaMedicion,
  aplicarFiltros,
  claveDe,
  filtrosIniciales,
  interpretarFiltros,
  ordenar,
  resumirSeleccion,
  type CampoOrden,
  type Direccion,
  type Filtros,
} from "@/lib/etl/select"
import { transformar } from "@/lib/etl/transform"
import type { ExtraccionCiudad, FilaMedicion } from "@/lib/etl/types"

const CONCURRENCIA_EXTRACCION = 2

export type ProgresoExtraccion = {
  enCurso: boolean
  procesando: string[]
  pendientes: string[]
  duracionMs: number | null
}

export type Verificacion =
  | { estado: "inactiva" }
  | { estado: "en_curso" }
  | {
      estado: "ok"
      esperadas: number
      encontradas: number
      faltan: { ciudad: string; fecha_hora: string }[]
    }
  | { estado: "error"; error: string }

export type EstadoCarga = {
  lotes: Lote[]
  enCurso: boolean
  duracionMs: number | null
  verificacion: Verificacion
}

const CARGA_VACIA: EstadoCarga = {
  lotes: [],
  enCurso: false,
  duracionMs: null,
  verificacion: { estado: "inactiva" },
}

/** Mide la duración real de un cálculo síncrono. */
function medir<T>(fn: () => T): { resultado: T; ms: number } {
  const t0 = performance.now()
  const resultado = fn()
  return { resultado, ms: performance.now() - t0 }
}

async function verificarEnDestino(
  filas: FilaMedicion[]
): Promise<Verificacion> {
  const faltan: { ciudad: string; fecha_hora: string }[] = []
  for (let i = 0; i < filas.length; i += 500) {
    const claves = filas
      .slice(i, i + 500)
      .map((f) => ({ ciudad: f.ciudad, fecha_hora: f.fecha_hora }))
    try {
      const res = await fetch("/api/supabase/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claves }),
      })
      const cuerpo = await res.json().catch(() => null)
      if (!res.ok || !cuerpo?.ok)
        return { estado: "error", error: cuerpo?.error ?? `HTTP ${res.status}` }
      faltan.push(...cuerpo.faltan)
    } catch (e) {
      return {
        estado: "error",
        error: e instanceof Error ? e.message : String(e),
      }
    }
  }
  return {
    estado: "ok",
    esperadas: filas.length,
    encontradas: filas.length - faltan.length,
    faltan,
  }
}

export function usePipeline() {
  // ---- Configuración de la extracción ----
  const [ciudadesConfig, setCiudadesConfig] = React.useState<string[]>(
    CIUDADES.map((c) => c.nombre)
  )
  const [inicio, setInicio] = React.useState("2026-09-01")
  const [fin, setFin] = React.useState("2026-09-30")

  // ---- Extracción: JSON originales por ciudad, conservados durante la sesión ----
  const [periodo, setPeriodo] = React.useState<{
    inicio: string
    fin: string
    ciudades: string[]
  } | null>(null)
  const [extracciones, setExtracciones] = React.useState<
    Record<string, ExtraccionCiudad>
  >({})
  const [progreso, setProgreso] = React.useState<ProgresoExtraccion>({
    enCurso: false,
    procesando: [],
    pendientes: [],
    duracionMs: null,
  })

  // ---- Filtros, orden y selección ----
  const [filtros, setFiltros] = React.useState<Filtros>(() =>
    filtrosIniciales([])
  )
  const [orden, setOrden] = React.useState<{
    campo: CampoOrden
    dir: Direccion
  }>({ campo: "fecha_hora", dir: "asc" })
  const [seleccion, setSeleccion] = React.useState<Set<string>>(() => new Set())

  // ---- Carga ----
  const [carga, setCarga] = React.useState<EstadoCarga>(CARGA_VACIA)
  const cargaActiva = React.useRef(false)

  // ---- Fases derivadas (recalculadas a partir de los JSON originales) ----
  const okOrdenadas = React.useMemo(
    () =>
      (periodo?.ciudades ?? [])
        .map((c) => extracciones[c])
        .filter(
          (e): e is Extract<ExtraccionCiudad, { estado: "ok" }> =>
            e?.estado === "ok"
        ),
    [extracciones, periodo]
  )
  const transformacion = React.useMemo(
    () =>
      medir(() =>
        transformar(
          okOrdenadas.map((e) => ({ ciudad: e.ciudad, json: e.json }))
        )
      ),
    [okOrdenadas]
  )
  const limpieza = React.useMemo(
    () => medir(() => limpiar(transformacion.resultado.registros)),
    [transformacion]
  )
  const validos = limpieza.resultado.validos
  const filtrosInterpretados = React.useMemo(
    () => interpretarFiltros(filtros),
    [filtros]
  )
  const filtrado = React.useMemo(
    () =>
      medir(() => {
        // Orden obligatorio: válidos → filtros → ordenación (la paginación va después, solo al mostrar).
        const coinciden = aplicarFiltros(
          validos,
          filtrosInterpretados.criterios
        )
        return ordenar(coinciden, orden.campo, orden.dir)
      }),
    [validos, filtrosInterpretados, orden]
  )
  const ordenados = filtrado.resultado
  // La selección solo cuenta claves que existen entre los válidos actuales.
  const seleccionVigente = React.useMemo(() => {
    const validas = new Set(validos.map(claveDe))
    return new Set([...seleccion].filter((k) => validas.has(k)))
  }, [seleccion, validos])
  const resumen = React.useMemo(
    () => resumirSeleccion(ordenados, seleccionVigente),
    [ordenados, seleccionVigente]
  )

  // ---- Acciones de extracción ----
  const descargar = React.useCallback(
    async (nombres: string[], ini: string, fn: string) => {
      const t0 = performance.now()
      const cola = [...nombres]
      setProgreso({
        enCurso: true,
        procesando: [],
        pendientes: [...cola],
        duracionMs: null,
      })
      const trabajador = async () => {
        while (cola.length) {
          const nombre = cola.shift()!
          setProgreso((p) => ({
            ...p,
            procesando: [...p.procesando, nombre],
            pendientes: p.pendientes.filter((n) => n !== nombre),
          }))
          const r = await extraerCiudad(buscarCiudad(nombre)!, ini, fn)
          // Se sustituye la entrada de la ciudad: reintentar nunca duplica datos.
          setExtracciones((prev) => ({ ...prev, [nombre]: r }))
          setProgreso((p) => ({
            ...p,
            procesando: p.procesando.filter((n) => n !== nombre),
          }))
        }
      }
      await Promise.all(
        Array.from(
          { length: Math.min(CONCURRENCIA_EXTRACCION, nombres.length) },
          trabajador
        )
      )
      setProgreso((p) => ({
        ...p,
        enCurso: false,
        duracionMs: performance.now() - t0,
      }))
    },
    []
  )

  const extraer = React.useCallback(async () => {
    if (progreso.enCurso || cargaActiva.current) return
    const nombres = CIUDADES.map((c) => c.nombre).filter((n) =>
      ciudadesConfig.includes(n)
    )
    setPeriodo({ inicio, fin, ciudades: nombres })
    setExtracciones({})
    setSeleccion(new Set())
    setFiltros(filtrosIniciales(nombres))
    setCarga(CARGA_VACIA)
    await descargar(nombres, inicio, fin)
  }, [progreso.enCurso, ciudadesConfig, inicio, fin, descargar])

  const reintentarCiudad = React.useCallback(
    async (nombre: string) => {
      if (!periodo || progreso.enCurso || cargaActiva.current) return
      await descargar([nombre], periodo.inicio, periodo.fin)
    },
    [periodo, progreso.enCurso, descargar]
  )

  // ---- Selección ----
  const alternar = React.useCallback((clave: string, marcado: boolean) => {
    setSeleccion((prev) => {
      const s = new Set(prev)
      if (marcado) s.add(clave)
      else s.delete(clave)
      return s
    })
  }, [])
  const marcarVarias = React.useCallback(
    (claves: string[], marcado: boolean) => {
      setSeleccion((prev) => {
        const s = new Set(prev)
        for (const k of claves) {
          if (marcado) s.add(k)
          else s.delete(k)
        }
        return s
      })
    },
    []
  )
  const seleccionarFiltrados = React.useCallback(
    () => marcarVarias(ordenados.map(claveDe), true),
    [marcarVarias, ordenados]
  )
  const vaciarSeleccion = React.useCallback(() => setSeleccion(new Set()), [])
  const quitarFueraDeFiltro = React.useCallback(
    () => setSeleccion(new Set(resumen.aSubir.map(claveDe))),
    [resumen.aSubir]
  )
  const restablecerFiltros = React.useCallback(
    () => setFiltros(filtrosIniciales(periodo?.ciudades ?? [])),
    [periodo]
  )

  // ---- Carga ----
  const ejecutar = React.useCallback(async (lotesIniciales: Lote[]) => {
    const t0 = performance.now()
    setCarga((c) => ({
      ...c,
      lotes: lotesIniciales,
      enCurso: true,
      verificacion: { estado: "inactiva" },
    }))
    const finales = await ejecutarLotes(
      lotesIniciales,
      enviarLoteHttp,
      (lotes) => setCarga((c) => ({ ...c, lotes }))
    )
    const enviadas = finales
      .filter((l) => l.estado === "ok")
      .flatMap((l) => l.filas)
    let verificacion: Verificacion = { estado: "inactiva" }
    if (enviadas.length) {
      setCarga((c) => ({ ...c, verificacion: { estado: "en_curso" } }))
      verificacion = await verificarEnDestino(enviadas)
    }
    setCarga((c) => ({
      ...c,
      lotes: finales,
      enCurso: false,
      duracionMs: (c.duracionMs ?? 0) + performance.now() - t0,
      verificacion,
    }))
  }, [])

  const subir = React.useCallback(async () => {
    // Evita envíos simultáneos aunque se pulse el botón varias veces antes de re-renderizar.
    if (cargaActiva.current || resumen.aSubir.length === 0) return
    cargaActiva.current = true
    try {
      // Copia congelada del conjunto y su orden: los filtros posteriores no la alteran.
      const lotes = crearLotes(resumen.aSubir.map(aFilaMedicion))
      setCarga({ ...CARGA_VACIA, lotes })
      await ejecutar(lotes)
    } finally {
      cargaActiva.current = false
    }
  }, [resumen.aSubir, ejecutar])

  const reintentarLotes = React.useCallback(async () => {
    if (cargaActiva.current) return
    cargaActiva.current = true
    try {
      await ejecutar(carga.lotes)
    } finally {
      cargaActiva.current = false
    }
  }, [carga.lotes, ejecutar])

  return {
    config: {
      ciudades: ciudadesConfig,
      setCiudades: setCiudadesConfig,
      inicio,
      setInicio,
      fin,
      setFin,
    },
    periodo,
    extracciones,
    progreso,
    extraer,
    reintentarCiudad,
    transformacion: {
      ...transformacion.resultado,
      ms: transformacion.ms,
      entradas: okOrdenadas.length,
    },
    limpieza: { ...limpieza.resultado, ms: limpieza.ms },
    filtros,
    setFiltros,
    erroresFiltros: filtrosInterpretados.errores,
    restablecerFiltros,
    orden,
    setOrden,
    ordenados,
    filtradoMs: filtrado.ms,
    seleccion: seleccionVigente,
    alternar,
    marcarVarias,
    seleccionarFiltrados,
    vaciarSeleccion,
    quitarFueraDeFiltro,
    aSubir: resumen.aSubir,
    seleccionadosFueraDeFiltro: resumen.seleccionadosFueraDeFiltro,
    carga,
    subir,
    reintentarLotes,
  }
}

export type Pipeline = ReturnType<typeof usePipeline>
