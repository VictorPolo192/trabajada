"use client"

import * as React from "react"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { entero } from "@/lib/etl/format"
import { paginar } from "@/lib/etl/select"
import { cn } from "@/lib/utils"

export type Columna<T> = {
  id: string
  /** Puede depender de las filas de la página visible (p. ej. «seleccionar página»). */
  cabecera: React.ReactNode | ((filasPagina: T[]) => React.ReactNode)
  celda: (fila: T, indiceGlobal: number) => React.ReactNode
  numerica?: boolean
  className?: string
}

const TAMANOS = [25, 50, 100]

/**
 * Tabla paginada. Recibe el conjunto completo ya filtrado y ordenado:
 * la paginación solo recorta lo que se ve, nunca cambia los datos.
 */
export function DataTable<T>({
  filas,
  columnas,
  claveFila,
  reinicio,
  vacio = "No hay registros.",
  claseFila,
  etiqueta,
}: {
  filas: T[]
  columnas: Columna<T>[]
  claveFila: (fila: T) => string
  /** Cuando cambia, se vuelve a la primera página (p. ej. al cambiar filtros). */
  reinicio?: unknown
  vacio?: string
  claseFila?: (fila: T) => string | undefined
  etiqueta: string
}) {
  const [pagina, setPagina] = React.useState(1)
  const [tamano, setTamano] = React.useState(TAMANOS[0])
  const [reinicioPrevio, setReinicioPrevio] = React.useState(reinicio)
  if (reinicio !== reinicioPrevio) {
    setReinicioPrevio(reinicio)
    setPagina(1)
  }
  const p = paginar(filas, pagina, tamano)
  const desplazamiento = (p.pagina - 1) * tamano

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border">
        <Table aria-label={etiqueta}>
          <TableHeader className="bg-muted/50">
            <TableRow>
              {columnas.map((c) => (
                <TableHead
                  key={c.id}
                  className={cn(c.numerica && "text-right", c.className)}
                >
                  {typeof c.cabecera === "function"
                    ? c.cabecera(p.filas)
                    : c.cabecera}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {p.filas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columnas.length}
                  className="py-8 text-center text-muted-foreground"
                >
                  {vacio}
                </TableCell>
              </TableRow>
            ) : (
              p.filas.map((f, i) => (
                <TableRow key={claveFila(f)} className={claseFila?.(f)}>
                  {columnas.map((c) => (
                    <TableCell
                      key={c.id}
                      className={cn(
                        c.numerica && "text-right font-mono tabular-nums",
                        c.className
                      )}
                    >
                      {c.celda(f, desplazamiento + i)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Paginacion
        total={filas.length}
        pagina={p.pagina}
        totalPaginas={p.totalPaginas}
        tamano={tamano}
        onPagina={setPagina}
        onTamano={(t) => {
          setTamano(t)
          setPagina(1)
        }}
      />
    </div>
  )
}

export function Paginacion({
  total,
  pagina,
  totalPaginas,
  tamano,
  onPagina,
  onTamano,
  deshabilitado,
}: {
  total: number
  pagina: number
  totalPaginas: number
  tamano: number
  onPagina: (p: number) => void
  onTamano: (t: number) => void
  deshabilitado?: boolean
}) {
  const desde = total === 0 ? 0 : (pagina - 1) * tamano + 1
  const hasta = Math.min(total, pagina * tamano)
  return (
    <nav
      aria-label="Paginación"
      className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
    >
      <span aria-live="polite">
        Filas {entero(desde)}–{entero(hasta)} de {entero(total)}
      </span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1">
          Por página
          <select
            className="h-7 rounded-md border bg-background px-1 text-foreground"
            value={tamano}
            disabled={deshabilitado}
            onChange={(e) => onTamano(Number(e.target.value))}
          >
            {TAMANOS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Primera página"
          disabled={deshabilitado || pagina <= 1}
          onClick={() => onPagina(1)}
        >
          <ChevronsLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Página anterior"
          disabled={deshabilitado || pagina <= 1}
          onClick={() => onPagina(pagina - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-20 text-center text-foreground">
          Página {pagina} de {totalPaginas}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Página siguiente"
          disabled={deshabilitado || pagina >= totalPaginas}
          onClick={() => onPagina(pagina + 1)}
        >
          <ChevronRight />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Última página"
          disabled={deshabilitado || pagina >= totalPaginas}
          onClick={() => onPagina(totalPaginas)}
        >
          <ChevronsRight />
        </Button>
      </div>
    </nav>
  )
}
