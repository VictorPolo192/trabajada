"use client"

import * as React from "react"
import { Database, HardDrive, RefreshCw, TriangleAlert } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Pipeline } from "@/hooks/use-pipeline"
import { NOMBRES_CIUDADES } from "@/lib/etl/cities"
import { entero, fechaHoraUtc, numero } from "@/lib/etl/format"
import { resumirLotes } from "@/lib/etl/load"
import { Paginacion } from "./data-table"
import { StatusBadge } from "./status-badge"

export type EstadoSupabase = {
  cargado: boolean
  url: boolean
  escritura: boolean
  lectura: "secreta" | "publicable" | null
  tabla: { ok: boolean; mensaje: string }
}

export const ESTADO_SUPABASE_INICIAL: EstadoSupabase = {
  cargado: false,
  url: false,
  escritura: false,
  lectura: null,
  tabla: { ok: false, mensaje: "" },
}

export function useEstadoSupabase() {
  const [estado, setEstado] = React.useState(ESTADO_SUPABASE_INICIAL)
  const refrescar = React.useCallback(async () => {
    try {
      const res = await fetch("/api/supabase/estado", { cache: "no-store" })
      const json = await res.json()
      setEstado({ ...json, cargado: true })
    } catch (e) {
      setEstado({
        ...ESTADO_SUPABASE_INICIAL,
        cargado: true,
        tabla: {
          ok: false,
          mensaje: e instanceof Error ? e.message : String(e),
        },
      })
    }
  }, [])
  React.useEffect(() => {
    // Sincroniza con un sistema externo (el servidor) al montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refrescar()
  }, [refrescar])
  return { estado, refrescar }
}

type FilaDestino = {
  id: number
  ciudad: string
  fecha_hora: string
  temperatura_c: number
  humedad_pct: number
  precipitacion_mm: number
  importado_en: string
}

const ORDENES = [
  { valor: "fecha_hora", texto: "Fecha y hora" },
  { valor: "ciudad", texto: "Ciudad" },
  { valor: "temperatura_c", texto: "Temperatura" },
  { valor: "humedad_pct", texto: "Humedad" },
  { valor: "precipitacion_mm", texto: "Precipitación" },
  { valor: "importado_en", texto: "Importado en" },
]

export function TabSupabase({
  p,
  supabase,
  onRefrescarEstado,
}: {
  p: Pipeline
  supabase: EstadoSupabase
  onRefrescarEstado: () => void
}) {
  const [ciudad, setCiudad] = React.useState("")
  const [desde, setDesde] = React.useState("")
  const [hasta, setHasta] = React.useState("")
  const [orden, setOrden] = React.useState("fecha_hora")
  const [dir, setDir] = React.useState<"asc" | "desc">("asc")
  const [pagina, setPagina] = React.useState(1)
  const [tamano, setTamano] = React.useState(25)
  const [datos, setDatos] = React.useState<{
    filas: FilaDestino[]
    total: number
    clave: string
    leidoEn: string
  } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [cargando, setCargando] = React.useState(false)

  const consultar = React.useCallback(async () => {
    setCargando(true)
    setError(null)
    const qs = new URLSearchParams({
      orden,
      dir,
      pagina: String(pagina),
      tamano: String(tamano),
    })
    if (ciudad) qs.set("ciudad", ciudad)
    if (desde) qs.set("desde", desde)
    if (hasta) qs.set("hasta", hasta)
    try {
      const res = await fetch(`/api/supabase/mediciones?${qs}`, {
        cache: "no-store",
      })
      const json = await res.json()
      if (!res.ok || !json.ok)
        throw new Error(json.error ?? `HTTP ${res.status}`)
      setDatos({
        filas: json.filas,
        total: json.total,
        clave: json.clave,
        leidoEn: new Date().toISOString(),
      })
    } catch (e) {
      setDatos(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }, [ciudad, desde, hasta, orden, dir, pagina, tamano])

  const lectura = supabase.lectura !== null
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (lectura) void consultar()
  }, [lectura, consultar])

  const r = resumirLotes(p.carga.lotes)
  const totalPaginas = Math.max(1, Math.ceil((datos?.total ?? 0) / tamano))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex gap-3 rounded-lg border border-dashed p-3">
          <HardDrive
            aria-hidden
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
          />
          <div className="text-sm">
            <p className="font-semibold">
              Datos locales (solo en este navegador)
            </p>
            <p className="text-muted-foreground">
              {entero(p.aSubir.length)} filas seleccionadas en la vista previa ·{" "}
              {entero(r.filasOk)} enviadas en la última carga ·{" "}
              {entero(r.filasError + r.filasPendientes)} sin confirmar. Se
              pierden al recargar la página.
            </p>
          </div>
        </div>
        <div className="flex gap-3 rounded-lg border border-primary/50 bg-primary/5 p-3">
          <Database aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Datos persistidos en Supabase</p>
            <p className="text-muted-foreground">
              {datos
                ? `${entero(datos.total)} filas coinciden con la consulta (leído a las ${datos.leidoEn.slice(11, 19)} UTC).`
                : "Sin leer todavía."}{" "}
              Esto es lo que realmente está guardado.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Conexión:</span>
        {!supabase.cargado ? (
          <StatusBadge estado="en_curso" texto="Comprobando…" />
        ) : (
          <>
            <StatusBadge
              estado={supabase.escritura ? "completada" : "error"}
              texto={
                supabase.escritura
                  ? "Escritura configurada"
                  : "Sin clave secreta"
              }
            />
            <StatusBadge
              estado={supabase.tabla.ok ? "completada" : "error"}
              texto={
                supabase.tabla.ok ? "Tabla accesible" : "Tabla no accesible"
              }
            />
          </>
        )}
        <Button size="sm" variant="ghost" onClick={onRefrescarEstado}>
          Comprobar de nuevo
        </Button>
      </div>
      {supabase.cargado && !supabase.tabla.ok && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>
            No se puede leer la tabla mediciones_meteorologicas
          </AlertTitle>
          <AlertDescription>
            {supabase.tabla.mensaje || "Sin detalle."} Configura las variables
            de entorno y aplica la migración de <code>supabase/migrations</code>
            .
          </AlertDescription>
        </Alert>
      )}
      {supabase.lectura === "publicable" && (
        <Alert>
          <TriangleAlert />
          <AlertDescription>
            Se lee con la clave publicable: RLS no tiene políticas de lectura,
            así que la tabla aparecerá vacía aunque tenga datos. Configura{" "}
            <code>SUPABASE_SECRET_KEY</code> en el servidor.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="sb-ciudad" className="text-xs">
            Ciudad
          </Label>
          <select
            id="sb-ciudad"
            className="h-8 rounded-lg border bg-background px-2 text-sm"
            value={ciudad}
            onChange={(e) => {
              setCiudad(e.target.value)
              setPagina(1)
            }}
          >
            <option value="">Todas</option>
            {NOMBRES_CIUDADES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="sb-desde" className="text-xs">
            Desde (día UTC)
          </Label>
          <Input
            id="sb-desde"
            type="date"
            value={desde}
            onChange={(e) => {
              setDesde(e.target.value)
              setPagina(1)
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="sb-hasta" className="text-xs">
            Hasta (día UTC)
          </Label>
          <Input
            id="sb-hasta"
            type="date"
            value={hasta}
            onChange={(e) => {
              setHasta(e.target.value)
              setPagina(1)
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="sb-orden" className="text-xs">
            ORDER BY
          </Label>
          <select
            id="sb-orden"
            className="h-8 rounded-lg border bg-background px-2 text-sm"
            value={orden}
            onChange={(e) => {
              setOrden(e.target.value)
              setPagina(1)
            }}
          >
            {ORDENES.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="sb-dir" className="text-xs">
            Dirección
          </Label>
          <select
            id="sb-dir"
            className="h-8 rounded-lg border bg-background px-2 text-sm"
            value={dir}
            onChange={(e) => {
              setDir(e.target.value as "asc" | "desc")
              setPagina(1)
            }}
          >
            <option value="asc">Ascendente</option>
            <option value="desc">Descendente</option>
          </select>
        </div>
        <Button onClick={consultar} disabled={cargando || !lectura}>
          <RefreshCw
            data-icon="inline-start"
            className={cargando ? "animate-spin" : undefined}
          />
          {cargando ? "Leyendo…" : "Actualizar"}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Error al leer Supabase</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table aria-label="Datos persistidos en Supabase" aria-busy={cargando}>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="text-right">id</TableHead>
              <TableHead>Ciudad</TableHead>
              <TableHead>Fecha y hora (UTC)</TableHead>
              <TableHead className="text-right">Temperatura (°C)</TableHead>
              <TableHead className="text-right">Humedad (%)</TableHead>
              <TableHead className="text-right">Precipitación (mm)</TableHead>
              <TableHead>Importado en (UTC)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!datos || datos.filas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  {!lectura
                    ? "Supabase no está configurado."
                    : cargando
                      ? "Leyendo…"
                      : "No hay filas persistidas que coincidan."}
                </TableCell>
              </TableRow>
            ) : (
              datos.filas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="text-right font-mono tabular-nums">
                    {f.id}
                  </TableCell>
                  <TableCell>{f.ciudad}</TableCell>
                  <TableCell>{fechaHoraUtc(f.fecha_hora)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {numero(f.temperatura_c)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {numero(f.humedad_pct)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {numero(f.precipitacion_mm)}
                  </TableCell>
                  <TableCell>{fechaHoraUtc(f.importado_en)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Paginacion
        total={datos?.total ?? 0}
        pagina={Math.min(pagina, totalPaginas)}
        totalPaginas={totalPaginas}
        tamano={tamano}
        onPagina={setPagina}
        onTamano={(t) => {
          setTamano(t)
          setPagina(1)
        }}
        deshabilitado={cargando}
      />
    </div>
  )
}
