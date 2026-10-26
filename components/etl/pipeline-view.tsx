"use client"

import { ArrowRight, RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Pipeline } from "@/hooks/use-pipeline"
import { duracion, entero } from "@/lib/etl/format"
import { resumirLotes } from "@/lib/etl/load"
import { cn } from "@/lib/utils"
import { StatusBadge, type EstadoFase } from "./status-badge"

export type PestanaId =
  | "original"
  | "transformados"
  | "validos"
  | "rechazados"
  | "preview"
  | "supabase"

type Fase = {
  nombre: string
  estado: EstadoFase
  entrada: string
  salida: string
  explicacion: string
  ms: number | null
  pestana: PestanaId
  extra?: string
}

function fases(p: Pipeline): Fase[] {
  const hayDatos = p.periodo !== null
  const ext = Object.values(p.extracciones)
  const fallidas = ext.filter((e) => e.estado === "error").length
  const registros = p.transformacion.registros.length
  const listoTransformar =
    hayDatos && !p.progreso.enCurso && p.transformacion.entradas > 0
  const resumen = resumirLotes(p.carga.lotes)

  return [
    {
      nombre: "Extracción",
      estado: !hayDatos
        ? "pendiente"
        : p.progreso.enCurso
          ? "en_curso"
          : fallidas
            ? "error"
            : "completada",
      entrada: hayDatos
        ? `${p.periodo!.ciudades.length} ciudades solicitadas`
        : "—",
      salida: hayDatos
        ? `${ext.length - fallidas} JSON recibidos${fallidas ? ` · ${fallidas} con error` : ""}`
        : "—",
      explicacion:
        "Una petición HTTP por ciudad a la API histórica. Se guarda el JSON tal cual llega.",
      ms: p.progreso.duracionMs,
      pestana: "original",
    },
    {
      nombre: "Transformación",
      estado: !listoTransformar
        ? "pendiente"
        : p.transformacion.avisos.length
          ? "error"
          : "completada",
      entrada: listoTransformar ? `${p.transformacion.entradas} JSON` : "—",
      salida: listoTransformar ? `${entero(registros)} registros` : "—",
      explicacion:
        "Los arrays paralelos (time, temperatura…) se convierten en un registro por ciudad y hora UTC.",
      ms: listoTransformar ? p.transformacion.ms : null,
      pestana: "transformados",
      extra: p.transformacion.avisos.length
        ? `${p.transformacion.avisos.length} avisos de estructura`
        : undefined,
    },
    {
      nombre: "Limpieza",
      estado: !listoTransformar ? "pendiente" : "completada",
      entrada: listoTransformar ? `${entero(registros)} registros` : "—",
      salida: listoTransformar
        ? `${entero(p.limpieza.validos.length)} válidos`
        : "—",
      explicacion:
        "Se rechazan nulos, tipos no numéricos, rangos imposibles y duplicados, con su motivo.",
      ms: listoTransformar ? p.limpieza.ms : null,
      pestana: "rechazados",
      extra: listoTransformar
        ? `${entero(p.limpieza.rechazados.length)} rechazados (${entero(p.limpieza.duplicados)} duplicados)`
        : undefined,
    },
    {
      nombre: "Filtrado y selección",
      estado:
        !listoTransformar || p.limpieza.validos.length === 0
          ? "pendiente"
          : p.aSubir.length
            ? "completada"
            : "en_curso",
      entrada: listoTransformar
        ? `${entero(p.limpieza.validos.length)} válidos`
        : "—",
      salida: listoTransformar
        ? `${entero(p.aSubir.length)} seleccionados`
        : "—",
      explicacion:
        "Filtros y orden sobre los válidos; tú eliges qué filas se cargarán.",
      ms: listoTransformar ? p.filtradoMs : null,
      pestana: "validos",
      extra:
        listoTransformar &&
        p.limpieza.validos.length > 0 &&
        p.aSubir.length === 0
          ? "Esperando selección"
          : listoTransformar
            ? `${entero(p.ordenados.length)} coinciden con los filtros`
            : undefined,
    },
    {
      nombre: "Carga",
      estado: p.carga.enCurso
        ? "en_curso"
        : p.carga.lotes.length === 0
          ? "pendiente"
          : resumen.lotesError || p.carga.verificacion.estado === "error"
            ? "error"
            : "completada",
      entrada: p.carga.lotes.length
        ? `${entero(resumen.totalFilas)} filas · ${p.carga.lotes.length} lotes`
        : "—",
      salida: p.carga.lotes.length
        ? `${entero(resumen.filasOk)} confirmadas`
        : "—",
      explicacion:
        "Upsert por lotes de 500 en Supabase desde el servidor y verificación de claves.",
      ms: p.carga.duracionMs,
      pestana: "preview",
      extra: resumen.filasError
        ? `${entero(resumen.filasError)} filas en lotes fallidos`
        : undefined,
    },
  ]
}

export function PipelineView({
  p,
  onInspeccionar,
}: {
  p: Pipeline
  onInspeccionar: (t: PestanaId) => void
}) {
  const lista = fases(p)
  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Pipeline ETL</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ol
          className="grid gap-2 lg:grid-cols-[repeat(5,minmax(0,1fr))]"
          aria-label="Fases del pipeline"
        >
          {lista.map((f, i) => (
            <li key={f.nombre} className="relative flex">
              <div
                className={cn(
                  "flex w-full flex-col gap-2 rounded-lg border p-3 text-sm",
                  f.estado === "error" && "border-red-600/50",
                  f.estado === "en_curso" && "border-sky-600/50"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">
                    <span className="text-muted-foreground">{i + 1}.</span>{" "}
                    {f.nombre}
                  </h3>
                  <StatusBadge estado={f.estado} />
                </div>
                <p className="text-xs text-muted-foreground">{f.explicacion}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                  <dt className="text-muted-foreground">Entrada</dt>
                  <dd className="font-medium tabular-nums">{f.entrada}</dd>
                  <dt className="text-muted-foreground">Salida</dt>
                  <dd className="font-medium tabular-nums">{f.salida}</dd>
                  <dt className="text-muted-foreground">Duración</dt>
                  <dd className="tabular-nums">{duracion(f.ms)}</dd>
                </dl>
                {f.extra && <p className="text-xs">{f.extra}</p>}
                <Button
                  variant="outline"
                  size="xs"
                  className="mt-auto self-start"
                  onClick={() => onInspeccionar(f.pestana)}
                >
                  Inspeccionar
                </Button>
              </div>
              {i < lista.length - 1 && (
                <ArrowRight
                  aria-hidden
                  className="absolute top-1/2 -right-2 z-10 hidden size-4 -translate-y-1/2 rounded-full bg-background text-muted-foreground lg:block"
                />
              )}
            </li>
          ))}
        </ol>
        <ProgresoCiudades p={p} />
      </CardContent>
    </Card>
  )
}

function ProgresoCiudades({ p }: { p: Pipeline }) {
  if (!p.periodo) return null
  return (
    <div className="rounded-lg border p-3">
      <h3 className="mb-2 text-sm font-medium">
        Peticiones por ciudad{" "}
        <span className="font-normal text-muted-foreground">
          ({p.periodo.inicio} → {p.periodo.fin})
        </span>
      </h3>
      <ul
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
        aria-live="polite"
      >
        {p.periodo.ciudades.map((c) => {
          const e = p.extracciones[c]
          const procesando = p.progreso.procesando.includes(c)
          const estado: EstadoFase = procesando
            ? "en_curso"
            : !e
              ? "pendiente"
              : e.estado === "ok"
                ? "completada"
                : "error"
          const texto = procesando
            ? "Descargando"
            : !e
              ? "En cola"
              : e.estado === "ok"
                ? "Descargada"
                : "Error"
          return (
            <li
              key={c}
              className="flex flex-col gap-1 rounded-md bg-muted/40 p-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{c}</span>
                <StatusBadge estado={estado} texto={texto} />
              </div>
              {e && (
                <span className="text-muted-foreground">
                  {duracion(e.duracionMs)}
                </span>
              )}
              {e?.estado === "error" && (
                <>
                  <span className="break-words text-red-700 dark:text-red-300">
                    {e.error}
                  </span>
                  <Button
                    size="xs"
                    variant="outline"
                    className="self-start"
                    disabled={p.progreso.enCurso || p.carga.enCurso}
                    onClick={() => p.reintentarCiudad(c)}
                  >
                    <RotateCw data-icon="inline-start" /> Reintentar {c}
                  </Button>
                </>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function Contadores({ p }: { p: Pipeline }) {
  const items = [
    {
      etiqueta: "Total extraído",
      valor: p.transformacion.registros.length,
      ayuda: "registros horarios",
    },
    {
      etiqueta: "Válidos",
      valor: p.limpieza.validos.length,
      ayuda: "superan la limpieza",
    },
    {
      etiqueta: "Rechazados",
      valor: p.limpieza.rechazados.length,
      ayuda: "por calidad o duplicado",
    },
    {
      etiqueta: "Coinciden con los filtros",
      valor: p.ordenados.length,
      ayuda: "de los válidos",
    },
    {
      etiqueta: "Seleccionados para cargar",
      valor: p.aSubir.length,
      ayuda: "y dentro de los filtros",
      destacado: true,
    },
  ]
  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((it) => (
          <div
            key={it.etiqueta}
            className={cn(
              "rounded-lg border p-3",
              it.destacado && "border-primary bg-primary/5"
            )}
          >
            <dt className="text-xs text-muted-foreground">{it.etiqueta}</dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {entero(it.valor)}
            </dd>
            <dd className="text-xs text-muted-foreground">{it.ayuda}</dd>
          </div>
        ))}
      </dl>
      {p.seleccionadosFueraDeFiltro > 0 && (
        <p className="text-sm" role="status">
          ⚠ Hay <strong>{entero(p.seleccionadosFueraDeFiltro)}</strong> filas
          seleccionadas que no cumplen los filtros actuales:{" "}
          <strong>no se subirán</strong> mientras sigan fuera.
        </p>
      )}
    </div>
  )
}
