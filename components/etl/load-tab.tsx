"use client"

import { Info, RotateCw, TriangleAlert, Upload } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { Pipeline } from "@/hooks/use-pipeline"
import { duracion, entero, fechaHoraUtc } from "@/lib/etl/format"
import { resumirLotes, TAMANO_LOTE, type Lote } from "@/lib/etl/load"
import { claveDe } from "@/lib/etl/select"
import type { FilaMedicion, RegistroValido } from "@/lib/etl/types"
import { DataTable, type Columna } from "./data-table"
import { StatusBadge, type EstadoFase } from "./status-badge"
import { CAMPOS_ORDEN, columnasMedicion } from "./valid-tab"
import type { EstadoSupabase } from "./supabase-tab"

const colsPreview: Columna<RegistroValido>[] = [
  {
    id: "n",
    cabecera: "Orden de envío",
    celda: (_, i) => i + 1,
    numerica: true,
  },
  {
    id: "lote",
    cabecera: "Lote",
    celda: (_, i) => Math.floor(i / TAMANO_LOTE) + 1,
    numerica: true,
  },
  ...columnasMedicion,
]

const ESTADO_LOTE: Record<Lote["estado"], { fase: EstadoFase; texto: string }> =
  {
    pendiente: { fase: "pendiente", texto: "Pendiente" },
    en_curso: { fase: "en_curso", texto: "Enviando" },
    ok: { fase: "completada", texto: "Correcto" },
    error: { fase: "error", texto: "Fallido" },
  }

const colsLotes: Columna<Lote>[] = [
  { id: "n", cabecera: "Lote", celda: (l) => l.numero, numerica: true },
  {
    id: "filas",
    cabecera: "Filas",
    celda: (l) => entero(l.filas.length),
    numerica: true,
  },
  {
    id: "rango",
    cabecera: "Primera → última fila",
    celda: (l) => (
      <span className="text-xs">
        {resumenFila(l.filas[0])} → {resumenFila(l.filas[l.filas.length - 1])}
      </span>
    ),
  },
  {
    id: "estado",
    cabecera: "Estado",
    celda: (l) => (
      <StatusBadge
        estado={ESTADO_LOTE[l.estado].fase}
        texto={ESTADO_LOTE[l.estado].texto}
      />
    ),
  },
  {
    id: "afectadas",
    cabecera: "Filas afectadas según Supabase",
    celda: (l) => (l.afectadas === null ? "—" : entero(l.afectadas)),
    numerica: true,
  },
  {
    id: "intentos",
    cabecera: "Intentos",
    celda: (l) => l.intentos,
    numerica: true,
  },
  {
    id: "dur",
    cabecera: "Duración",
    celda: (l) => duracion(l.duracionMs),
    numerica: true,
  },
  {
    id: "error",
    cabecera: "Error",
    celda: (l) => (
      <span className="text-xs whitespace-normal">{l.error ?? ""}</span>
    ),
  },
]

function resumenFila(f: FilaMedicion) {
  return `${f.ciudad} ${fechaHoraUtc(f.fecha_hora)}`
}

export function TabCarga({
  p,
  supabase,
}: {
  p: Pipeline
  supabase: EstadoSupabase
}) {
  const { carga } = p
  const r = resumirLotes(carga.lotes)
  const campo = CAMPOS_ORDEN.find((c) => c.valor === p.orden.campo)?.texto
  const puedeEscribir = supabase.cargado && supabase.escritura
  const lotesPrevistos = Math.ceil(p.aSubir.length / TAMANO_LOTE)

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <Info />
        <AlertTitle>Esto es exactamente lo que se enviará</AlertTitle>
        <AlertDescription>
          Filas seleccionadas que cumplen los filtros actuales, en el orden
          elegido ({campo},{" "}
          {p.orden.dir === "asc" ? "ascendente" : "descendente"}). Ese orden
          determina cómo se reparten en lotes, pero{" "}
          <strong>
            una base de datos no garantiza conservar el orden de inserción
          </strong>
          : cualquier consulta posterior debe indicar su orden con{" "}
          <code>ORDER BY</code>.
        </AlertDescription>
      </Alert>

      {!puedeEscribir && supabase.cargado && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Carga no disponible</AlertTitle>
          <AlertDescription>
            El servidor no tiene configuradas <code>SUPABASE_URL</code> y{" "}
            <code>SUPABASE_SECRET_KEY</code>. Consulta el README y{" "}
            <code>.env.example</code>. No se simula ninguna carga.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          onClick={p.subir}
          disabled={!puedeEscribir || carga.enCurso || p.aSubir.length === 0}
        >
          <Upload data-icon="inline-start" />
          Subir {entero(p.aSubir.length)} registros a Supabase
        </Button>
        <span className="text-sm text-muted-foreground">
          {lotesPrevistos} {lotesPrevistos === 1 ? "lote" : "lotes"} de hasta{" "}
          {TAMANO_LOTE} · upsert por (ciudad, fecha_hora)
        </span>
      </div>

      <DataTable
        etiqueta="Vista previa de la carga"
        filas={p.aSubir}
        columnas={colsPreview}
        claveFila={claveDe}
        reinicio={p.aSubir}
        vacio="No hay filas seleccionadas que cumplan los filtros. Selecciónalas en «Registros válidos»."
      />

      {carga.lotes.length > 0 && (
        <section
          aria-labelledby="titulo-informe"
          className="flex flex-col gap-3 rounded-lg border p-3"
        >
          <h3 id="titulo-informe" className="text-sm font-semibold">
            Informe de la carga {carga.enCurso && "(en curso)"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Al pulsar «Subir» se congeló una copia de {entero(r.totalFilas)}{" "}
            filas y su orden. Cambiar filtros o selección ahora no modifica esta
            carga.
          </p>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-md bg-muted/40 p-2">
              <dt className="text-xs text-muted-foreground">
                Enviadas correctamente
              </dt>
              <dd className="text-lg font-semibold tabular-nums">
                {entero(r.filasOk)}
              </dd>
            </div>
            <div className="rounded-md bg-muted/40 p-2">
              <dt className="text-xs text-muted-foreground">
                En lotes fallidos
              </dt>
              <dd className="text-lg font-semibold tabular-nums">
                {entero(r.filasError)}
              </dd>
            </div>
            <div className="rounded-md bg-muted/40 p-2">
              <dt className="text-xs text-muted-foreground">Pendientes</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {entero(r.filasPendientes)}
              </dd>
            </div>
            <div className="rounded-md bg-muted/40 p-2">
              <dt className="text-xs text-muted-foreground">
                Lotes correctos / fallidos
              </dt>
              <dd className="text-lg font-semibold tabular-nums">
                {r.lotesOk} / {r.lotesError}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            Supabase informa del número de filas afectadas por el upsert, pero
            no distingue cuántas eran nuevas y cuántas se actualizaron; por eso
            no se muestran recuentos separados de inserciones y actualizaciones.
          </p>
          {r.lotesError > 0 && !carga.enCurso && (
            <Button
              variant="outline"
              className="self-start"
              onClick={p.reintentarLotes}
            >
              <RotateCw data-icon="inline-start" /> Reintentar {r.lotesError}{" "}
              {r.lotesError === 1 ? "lote fallido" : "lotes fallidos"}
            </Button>
          )}
          <DataTable
            etiqueta="Estado por lote"
            filas={carga.lotes}
            columnas={colsLotes}
            claveFila={(l) => String(l.numero)}
          />
          <Verificacion p={p} />
        </section>
      )}
    </div>
  )
}

function Verificacion({ p }: { p: Pipeline }) {
  const v = p.carga.verificacion
  if (v.estado === "inactiva") return null
  if (v.estado === "en_curso")
    return (
      <StatusBadge
        estado="en_curso"
        texto="Verificando claves en destino…"
        className="self-start"
      />
    )
  if (v.estado === "error")
    return (
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertTitle>No se pudo verificar en destino</AlertTitle>
        <AlertDescription>{v.error}</AlertDescription>
      </Alert>
    )
  const completa = v.faltan.length === 0
  return (
    <div className="flex flex-col gap-1 text-sm">
      <StatusBadge
        estado={completa ? "completada" : "error"}
        texto={completa ? "Verificación correcta" : "Faltan claves en destino"}
        className="self-start"
      />
      <p>
        Se consultaron en Supabase las {entero(v.esperadas)} claves (ciudad,
        fecha_hora) de los lotes correctos:{" "}
        <strong>{entero(v.encontradas)}</strong> existen en destino
        {completa ? "." : `; faltan ${entero(v.faltan.length)}.`}
      </p>
      {!completa && (
        <ul className="list-disc pl-4 text-xs">
          {v.faltan.slice(0, 20).map((f) => (
            <li key={`${f.ciudad}|${f.fecha_hora}`}>
              {f.ciudad} {fechaHoraUtc(f.fecha_hora)}
            </li>
          ))}
          {v.faltan.length > 20 && (
            <li>… y {entero(v.faltan.length - 20)} más</li>
          )}
        </ul>
      )}
    </div>
  )
}
