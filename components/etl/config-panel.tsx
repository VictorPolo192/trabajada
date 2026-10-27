"use client"

import { CloudDownload, TriangleAlert } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Pipeline } from "@/hooks/use-pipeline"
import { CIUDADES } from "@/lib/etl/cities"
import {
  MAX_DIAS_EXTRACCION,
  VARIABLES_HORARIAS,
  validarPeriodo,
} from "@/lib/etl/extract"
import { entero } from "@/lib/etl/format"
import { CiudadesMapa } from "./ciudades-mapa"

export function ConfigPanel({ p }: { p: Pipeline }) {
  const { config } = p
  const v = validarPeriodo(config.inicio, config.fin)
  const errores = [...v.errores]
  if (config.ciudades.length === 0)
    errores.push("Selecciona al menos una ciudad.")
  const horas = v.errores.length ? 0 : v.dias * 24
  const bloqueado = p.progreso.enCurso || p.carga.enCurso

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Configuración de la extracción</CardTitle>
        <CardDescription>
          API histórica de Open-Meteo · horas en UTC · °C · mm · máximo{" "}
          {MAX_DIAS_EXTRACCION} días
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Ciudades</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {CIUDADES.map((c) => {
              const id = `ciudad-${c.nombre}`
              return (
                <div key={c.nombre} className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={config.ciudades.includes(c.nombre)}
                    disabled={bloqueado}
                    onCheckedChange={(marcado) =>
                      config.setCiudades((prev) =>
                        marcado
                          ? [...prev, c.nombre]
                          : prev.filter((n) => n !== c.nombre)
                      )
                    }
                  />
                  <Label htmlFor={id} className="font-normal">
                    {c.nombre}
                    <span className="text-xs text-muted-foreground">
                      ({c.latitud}, {c.longitud})
                    </span>
                  </Label>
                </div>
              )
            })}
          </div>
          <div className="flex gap-2">
            <Button
              variant="link"
              size="xs"
              className="px-0"
              disabled={bloqueado}
              onClick={() => config.setCiudades(CIUDADES.map((c) => c.nombre))}
            >
              Todas
            </Button>
            <Button
              variant="link"
              size="xs"
              className="px-0"
              disabled={bloqueado}
              onClick={() => config.setCiudades([])}
            >
              Ninguna
            </Button>
          </div>
          <CiudadesMapa
            seleccionadas={config.ciudades}
            bloqueado={bloqueado}
            onAlternar={(nombre) =>
              config.setCiudades((prev) =>
                prev.includes(nombre)
                  ? prev.filter((n) => n !== nombre)
                  : [...prev, nombre]
              )
            }
          />
        </fieldset>

        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fecha-inicio">Fecha inicial (UTC)</Label>
            <Input
              id="fecha-inicio"
              type="date"
              value={config.inicio}
              disabled={bloqueado}
              onChange={(e) => config.setInicio(e.target.value)}
              aria-invalid={v.errores.length > 0}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fecha-fin">Fecha final (UTC)</Label>
            <Input
              id="fecha-fin"
              type="date"
              value={config.fin}
              disabled={bloqueado}
              onChange={(e) => config.setFin(e.target.value)}
              aria-invalid={v.errores.length > 0}
            />
          </div>
        </div>

        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Volumen previsto</p>
          <p className="text-muted-foreground">
            {config.ciudades.length} ciudades ×{" "}
            {v.errores.length ? "—" : v.dias} días × 24 h ={" "}
            <strong className="text-foreground">
              {entero(config.ciudades.length * horas)} registros horarios
            </strong>{" "}
            ({config.ciudades.length} peticiones, {VARIABLES_HORARIAS.length}{" "}
            variables cada una)
          </p>
        </div>

        {errores.length > 0 && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Revisa la configuración</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {errores.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {errores.length === 0 &&
          v.avisos.map((a) => (
            <Alert key={a}>
              <TriangleAlert />
              <AlertDescription>{a}</AlertDescription>
            </Alert>
          ))}

        <div>
          <Button
            size="lg"
            onClick={p.extraer}
            disabled={errores.length > 0 || bloqueado}
          >
            <CloudDownload data-icon="inline-start" />
            {p.progreso.enCurso ? "Extrayendo…" : "Extraer datos"}
          </Button>
          {p.periodo && !p.progreso.enCurso && (
            <p className="mt-2 text-xs text-muted-foreground">
              Una nueva extracción sustituye los datos, la selección y el
              informe de carga de esta sesión.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
