"use client"

import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ListChecks,
  ListX,
  RotateCcw,
  TriangleAlert,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Pipeline } from "@/hooks/use-pipeline"
import { entero, fechaHoraUtc, numero } from "@/lib/etl/format"
import { claveDe, type CampoOrden, type Filtros } from "@/lib/etl/select"
import type { RegistroValido } from "@/lib/etl/types"
import { DataTable, type Columna } from "./data-table"

export const CAMPOS_ORDEN: { valor: CampoOrden; texto: string }[] = [
  { valor: "ciudad", texto: "Ciudad" },
  { valor: "fecha_hora", texto: "Fecha y hora" },
  { valor: "temperatura_c", texto: "Temperatura" },
  { valor: "humedad_pct", texto: "Humedad" },
  { valor: "precipitacion_mm", texto: "Precipitación" },
]

export const columnasMedicion: Columna<RegistroValido>[] = [
  { id: "ciudad", cabecera: "Ciudad", celda: (r) => r.ciudad },
  {
    id: "fh",
    cabecera: "Fecha y hora (UTC)",
    celda: (r) => fechaHoraUtc(r.fecha_hora),
  },
  {
    id: "t",
    cabecera: "Temperatura (°C)",
    celda: (r) => numero(r.temperatura_c),
    numerica: true,
  },
  {
    id: "h",
    cabecera: "Humedad (%)",
    celda: (r) => numero(r.humedad_pct),
    numerica: true,
  },
  {
    id: "p",
    cabecera: "Precipitación (mm)",
    celda: (r) => numero(r.precipitacion_mm),
    numerica: true,
  },
]

function Rango({
  etiqueta,
  unidad,
  min,
  max,
  onMin,
  onMax,
}: {
  etiqueta: string
  unidad: string
  min: string
  max: string
  onMin: (v: string) => void
  onMax: (v: string) => void
}) {
  const id = etiqueta.toLowerCase().replace(/\W/g, "")
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-xs font-medium">
        {etiqueta} ({unidad})
      </legend>
      <div className="flex gap-1">
        <Input
          id={`${id}-min`}
          aria-label={`${etiqueta} mínima`}
          inputMode="decimal"
          placeholder="mín."
          value={min}
          onChange={(e) => onMin(e.target.value)}
        />
        <Input
          id={`${id}-max`}
          aria-label={`${etiqueta} máxima`}
          inputMode="decimal"
          placeholder="máx."
          value={max}
          onChange={(e) => onMax(e.target.value)}
        />
      </div>
    </fieldset>
  )
}

export function TabValidos({ p }: { p: Pipeline }) {
  if (!p.periodo)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Todavía no hay datos: lanza una extracción.
      </p>
    )

  const f = p.filtros
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) =>
    p.setFiltros((prev) => ({ ...prev, [k]: v }))
  const ciudades = p.periodo.ciudades

  const columnas: Columna<RegistroValido>[] = [
    {
      id: "sel",
      className: "w-10",
      cabecera: (pagina) => {
        const marcadas = pagina.filter((r) =>
          p.seleccion.has(claveDe(r))
        ).length
        return (
          <Checkbox
            aria-label="Seleccionar las filas de esta página"
            checked={pagina.length > 0 && marcadas === pagina.length}
            indeterminate={marcadas > 0 && marcadas < pagina.length}
            disabled={pagina.length === 0}
            onCheckedChange={(v) => p.marcarVarias(pagina.map(claveDe), v)}
          />
        )
      },
      celda: (r) => (
        <Checkbox
          aria-label={`Seleccionar ${r.ciudad} ${fechaHoraUtc(r.fecha_hora)}`}
          checked={p.seleccion.has(claveDe(r))}
          onCheckedChange={(v) => p.alternar(claveDe(r), v)}
        />
      ),
    },
    ...columnasMedicion,
  ]

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Orden de operaciones:{" "}
        <strong>válidos → filtros → ordenación → selección → carga</strong>.
        Filtros y orden se aplican al conjunto completo antes de paginar; la
        paginación solo afecta a lo que ves. Cambiar los filtros nunca
        selecciona filas nuevas automáticamente.
      </p>

      <section
        aria-labelledby="titulo-filtros"
        className="flex flex-col gap-3 rounded-lg border p-3"
      >
        <div className="flex items-center justify-between">
          <h3 id="titulo-filtros" className="text-sm font-semibold">
            Filtros
          </h3>
          <Button size="sm" variant="ghost" onClick={p.restablecerFiltros}>
            <RotateCcw data-icon="inline-start" /> Restablecer filtros
          </Button>
        </div>
        <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
          <legend className="mb-1 text-xs font-medium">Ciudades</legend>
          {ciudades.map((c) => (
            <div key={c} className="flex items-center gap-2">
              <Checkbox
                id={`filtro-${c}`}
                checked={f.ciudades.includes(c)}
                onCheckedChange={(v) =>
                  set(
                    "ciudades",
                    v ? [...f.ciudades, c] : f.ciudades.filter((x) => x !== c)
                  )
                }
              />
              <Label htmlFor={`filtro-${c}`} className="font-normal">
                {c}
              </Label>
            </div>
          ))}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-1">
            <Label htmlFor="filtro-desde" className="text-xs">
              Desde (UTC)
            </Label>
            <Input
              id="filtro-desde"
              type="datetime-local"
              value={f.desde}
              onChange={(e) => set("desde", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="filtro-hasta" className="text-xs">
              Hasta (UTC)
            </Label>
            <Input
              id="filtro-hasta"
              type="datetime-local"
              value={f.hasta}
              onChange={(e) => set("hasta", e.target.value)}
            />
          </div>
          <Rango
            etiqueta="Temperatura"
            unidad="°C"
            min={f.tempMin}
            max={f.tempMax}
            onMin={(v) => set("tempMin", v)}
            onMax={(v) => set("tempMax", v)}
          />
          <Rango
            etiqueta="Humedad"
            unidad="%"
            min={f.humMin}
            max={f.humMax}
            onMin={(v) => set("humMin", v)}
            onMax={(v) => set("humMax", v)}
          />
          <Rango
            etiqueta="Precipitación"
            unidad="mm"
            min={f.precMin}
            max={f.precMax}
            onMin={(v) => set("precMin", v)}
            onMax={(v) => set("precMax", v)}
          />
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="solo-lluvia"
              checked={f.soloLluvia}
              onCheckedChange={(v) => set("soloLluvia", v)}
            />
            <Label htmlFor="solo-lluvia" className="font-normal">
              Solo registros con lluvia (precipitación &gt; 0 mm)
            </Label>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="orden-campo" className="text-xs">
                Ordenar por
              </Label>
              <select
                id="orden-campo"
                className="h-8 rounded-lg border bg-background px-2 text-sm"
                value={p.orden.campo}
                onChange={(e) =>
                  p.setOrden((o) => ({
                    ...o,
                    campo: e.target.value as CampoOrden,
                  }))
                }
              >
                {CAMPOS_ORDEN.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.texto}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              onClick={() =>
                p.setOrden((o) => ({
                  ...o,
                  dir: o.dir === "asc" ? "desc" : "asc",
                }))
              }
              aria-label={`Dirección: ${p.orden.dir === "asc" ? "ascendente" : "descendente"}. Pulsa para cambiar.`}
            >
              {p.orden.dir === "asc" ? (
                <ArrowUpNarrowWide data-icon="inline-start" />
              ) : (
                <ArrowDownWideNarrow data-icon="inline-start" />
              )}
              {p.orden.dir === "asc" ? "Ascendente" : "Descendente"}
            </Button>
          </div>
        </div>
        {p.erroresFiltros.length > 0 && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>
              <ul className="list-disc pl-4">
                {p.erroresFiltros.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </section>

      <section
        aria-label="Selección"
        className="flex flex-wrap items-center gap-2"
      >
        <Button
          size="sm"
          onClick={p.seleccionarFiltrados}
          disabled={p.ordenados.length === 0}
        >
          <ListChecks data-icon="inline-start" /> Seleccionar las{" "}
          {entero(p.ordenados.length)} que cumplen los filtros
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={p.vaciarSeleccion}
          disabled={p.seleccion.size === 0}
        >
          <ListX data-icon="inline-start" /> Vaciar selección
        </Button>
        {p.seleccionadosFueraDeFiltro > 0 && (
          <Button size="sm" variant="outline" onClick={p.quitarFueraDeFiltro}>
            Quitar {entero(p.seleccionadosFueraDeFiltro)} seleccionadas fuera de
            filtros
          </Button>
        )}
        <span className="text-sm text-muted-foreground" role="status">
          {entero(p.seleccion.size)} seleccionadas en total ·{" "}
          <strong className="text-foreground">
            {entero(p.aSubir.length)} se subirán
          </strong>
          {p.seleccionadosFueraDeFiltro > 0 &&
            ` · ${entero(p.seleccionadosFueraDeFiltro)} fuera de filtros (no se subirán)`}
        </span>
      </section>

      <DataTable
        etiqueta="Registros válidos filtrados y ordenados"
        filas={p.ordenados}
        columnas={columnas}
        claveFila={claveDe}
        reinicio={p.ordenados}
        vacio="Ningún registro válido coincide con los filtros."
        claseFila={(r) =>
          p.seleccion.has(claveDe(r)) ? "bg-primary/5" : undefined
        }
      />
    </div>
  )
}
