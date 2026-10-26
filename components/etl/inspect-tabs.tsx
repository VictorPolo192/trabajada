"use client"

import * as React from "react"
import { Download, TriangleAlert } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Pipeline } from "@/hooks/use-pipeline"
import {
  descargarJson,
  duracion,
  entero,
  fechaHoraUtc,
  valorCrudo,
} from "@/lib/etl/format"
import type { RegistroRechazado, RegistroTransformado } from "@/lib/etl/types"
import { cn } from "@/lib/utils"
import { DataTable, type Columna } from "./data-table"

function SinDatos({
  texto = "Todavía no hay datos: lanza una extracción.",
}: {
  texto?: string
}) {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">{texto}</p>
  )
}

// ---------------------------------------------------------------- JSON original

export function TabOriginal({ p }: { p: Pipeline }) {
  const ciudades = p.periodo?.ciudades ?? []
  const [elegida, setElegida] = React.useState<string | null>(null)
  const actual = elegida && ciudades.includes(elegida) ? elegida : ciudades[0]
  const e = actual ? p.extracciones[actual] : undefined
  const okTodas = Object.values(p.extracciones).filter((x) => x.estado === "ok")

  if (!p.periodo) return <SinDatos />
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Respuesta exacta de la API, sin modificar. Se conserva en memoria
        durante la sesión (se pierde al recargar la página).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Ciudad" className="flex flex-wrap gap-1">
          {ciudades.map((c) => (
            <Button
              key={c}
              size="sm"
              variant={c === actual ? "default" : "outline"}
              aria-pressed={c === actual}
              onClick={() => setElegida(c)}
            >
              {c}
              {p.extracciones[c]?.estado === "error" && " (error)"}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={e?.estado !== "ok"}
            onClick={() =>
              e?.estado === "ok" &&
              descargarJson(
                `open-meteo_${e.ciudad}_${p.periodo!.inicio}_${p.periodo!.fin}.json`,
                e.json
              )
            }
          >
            <Download data-icon="inline-start" /> Descargar {actual}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={okTodas.length === 0}
            onClick={() =>
              descargarJson(
                `open-meteo_todas_${p.periodo!.inicio}_${p.periodo!.fin}.json`,
                Object.fromEntries(
                  okTodas.map((x) => [
                    x.ciudad,
                    x.estado === "ok" ? x.json : null,
                  ])
                )
              )
            }
          >
            <Download data-icon="inline-start" /> Descargar todas
          </Button>
        </div>
      </div>
      {!e ? (
        <SinDatos texto="Descarga en curso o pendiente…" />
      ) : (
        <>
          <p className="font-mono text-xs break-all text-muted-foreground">
            GET {e.url}
          </p>
          {e.estado === "error" ? (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>La petición falló</AlertTitle>
              <AlertDescription>{e.error}</AlertDescription>
            </Alert>
          ) : (
            <>
              <ResumenArrays json={e.json} ms={e.duracionMs} />
              <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
                {JSON.stringify(e.json, null, 2)}
              </pre>
            </>
          )}
        </>
      )}
    </div>
  )
}

function ResumenArrays({
  json,
  ms,
}: {
  json: Record<string, unknown>
  ms: number
}) {
  const hourly = (json.hourly ?? {}) as Record<string, unknown>
  const units = (json.hourly_units ?? {}) as Record<string, unknown>
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {Object.entries(hourly).map(([k, v]) => (
        <Badge key={k} variant="outline">
          {k}: {Array.isArray(v) ? `${v.length} valores` : "no es array"}
          {units[k] ? ` · ${String(units[k])}` : ""}
        </Badge>
      ))}
      <Badge variant="outline">
        utc_offset_seconds: {String(json.utc_offset_seconds)}
      </Badge>
      <Badge variant="outline">duración: {duracion(ms)}</Badge>
    </div>
  )
}

// ---------------------------------------------------------------- Transformados

function celdaCruda(v: unknown) {
  const s = valorCrudo(v)
  const raro = typeof v !== "number" || !Number.isFinite(v)
  return (
    <span
      className={cn(raro && "font-semibold text-red-700 dark:text-red-300")}
    >
      {s}
    </span>
  )
}

const colsTransformados: Columna<RegistroTransformado>[] = [
  { id: "n", cabecera: "#", celda: (_, i) => i + 1, numerica: true },
  { id: "ciudad", cabecera: "Ciudad", celda: (r) => r.ciudad },
  {
    id: "idx",
    cabecera: "Índice en arrays",
    celda: (r) => r.indiceOrigen,
    numerica: true,
  },
  {
    id: "orig",
    cabecera: "time (original)",
    celda: (r) => (
      <span className="font-mono text-xs">{valorCrudo(r.fechaOriginal)}</span>
    ),
  },
  {
    id: "fh",
    cabecera: "fecha_hora (UTC)",
    celda: (r) =>
      r.fecha_hora ? (
        fechaHoraUtc(r.fecha_hora)
      ) : (
        <span className="font-semibold text-red-700 dark:text-red-300">
          no interpretable
        </span>
      ),
  },
  {
    id: "t",
    cabecera: "Temperatura (°C)",
    celda: (r) => celdaCruda(r.temperatura_c),
    numerica: true,
  },
  {
    id: "h",
    cabecera: "Humedad (%)",
    celda: (r) => celdaCruda(r.humedad_pct),
    numerica: true,
  },
  {
    id: "p",
    cabecera: "Precipitación (mm)",
    celda: (r) => celdaCruda(r.precipitacion_mm),
    numerica: true,
  },
]

export function TabTransformados({ p }: { p: Pipeline }) {
  if (!p.periodo) return <SinDatos />
  const { registros, avisos } = p.transformacion
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Cada posición <code>i</code> de los arrays <code>time</code>,{" "}
        <code>temperature_2m</code>, <code>relative_humidity_2m</code> y{" "}
        <code>precipitation</code> forma un registro. La hora se interpreta
        explícitamente como UTC (se añade «Z»). Aún no se valida nada: los
        valores se muestran tal cual (null, &quot;&quot;…).
      </p>
      {avisos.length > 0 && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Avisos de estructura ({avisos.length})</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {avisos.map((a, i) => (
                <li key={i}>
                  <strong>{a.ciudad}:</strong> {a.mensaje}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <DataTable
        etiqueta="Registros transformados"
        filas={registros}
        columnas={colsTransformados}
        claveFila={(r) => r.idFila}
        reinicio={registros}
      />
    </div>
  )
}

// ---------------------------------------------------------------- Rechazados

const colsRechazados: Columna<RegistroRechazado>[] = [
  {
    id: "ciudad",
    cabecera: "Ciudad",
    celda: (r) => r.registro.ciudad || "(vacía)",
  },
  {
    id: "fila",
    cabecera: "Fila origen",
    celda: (r) => (
      <span className="font-mono text-xs">{r.registro.idFila}</span>
    ),
  },
  {
    id: "orig",
    cabecera: "time (original)",
    celda: (r) => (
      <span className="font-mono text-xs">
        {valorCrudo(r.registro.fechaOriginal)}
      </span>
    ),
  },
  {
    id: "t",
    cabecera: "Temp. (°C)",
    celda: (r) => valorCrudo(r.registro.temperatura_c),
    numerica: true,
  },
  {
    id: "h",
    cabecera: "Hum. (%)",
    celda: (r) => valorCrudo(r.registro.humedad_pct),
    numerica: true,
  },
  {
    id: "p",
    cabecera: "Prec. (mm)",
    celda: (r) => valorCrudo(r.registro.precipitacion_mm),
    numerica: true,
  },
  {
    id: "motivo",
    cabecera: "Motivo del rechazo",
    celda: (r) => (
      <ul className="list-disc pl-4 text-xs whitespace-normal">
        {r.motivos.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    ),
  },
]

export function TabRechazados({ p }: { p: Pipeline }) {
  if (!p.periodo) return <SinDatos />
  const { rechazados, duplicados } = p.limpieza
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Descartes por <strong>calidad</strong> (no por filtros):{" "}
        {entero(rechazados.length - duplicados)} con valores ausentes o
        inválidos y {entero(duplicados)} duplicados por (ciudad, fecha_hora).
        Ante un duplicado se conserva la primera aparición válida en el orden de
        extracción. Los nulos nunca se convierten en cero y no se descartan
        temperaturas por ser extremas.
      </p>
      <DataTable
        etiqueta="Registros rechazados"
        filas={rechazados}
        columnas={colsRechazados}
        claveFila={(r) => r.registro.idFila}
        reinicio={rechazados}
        vacio="No hay registros rechazados en esta extracción."
      />
    </div>
  )
}
