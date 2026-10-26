"use client"

import * as React from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePipeline } from "@/hooks/use-pipeline"
import { entero } from "@/lib/etl/format"
import { ConfigPanel } from "./config-panel"
import { TabOriginal, TabRechazados, TabTransformados } from "./inspect-tabs"
import { TabCarga } from "./load-tab"
import { Contadores, PipelineView, type PestanaId } from "./pipeline-view"
import { TabSupabase, useEstadoSupabase } from "./supabase-tab"
import { TabValidos } from "./valid-tab"

export function PipelineApp() {
  const p = usePipeline()
  const { estado: supabase, refrescar } = useEstadoSupabase()
  const [pestana, setPestana] = React.useState<PestanaId>("original")
  const zonaDatos = React.useRef<HTMLElement>(null)

  const inspeccionar = (t: PestanaId) => {
    setPestana(t)
    zonaDatos.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const pestanas: { id: PestanaId; texto: string; n?: number }[] = [
    { id: "original", texto: "JSON original" },
    {
      id: "transformados",
      texto: "Transformados",
      n: p.transformacion.registros.length,
    },
    { id: "validos", texto: "Registros válidos", n: p.limpieza.validos.length },
    { id: "rechazados", texto: "Rechazados", n: p.limpieza.rechazados.length },
    { id: "preview", texto: "Vista previa de la carga", n: p.aSubir.length },
    { id: "supabase", texto: "Datos en Supabase" },
  ]

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Pipeline ETL: Open-Meteo → Supabase
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Práctica de Big Data. Extrae mediciones horarias históricas,
          transfórmalas en registros, límpialas, elige cuáles cargar y súbelas a
          Supabase. Cada fase muestra sus datos reales para que puedas
          inspeccionarlos.
        </p>
      </header>

      <ConfigPanel p={p} />
      <PipelineView p={p} onInspeccionar={inspeccionar} />
      <Contadores p={p} />

      <section
        ref={zonaDatos}
        aria-labelledby="titulo-datos"
        className="flex scroll-mt-4 flex-col gap-3"
      >
        <h2 id="titulo-datos" className="text-lg font-semibold">
          3. Inspección de datos
        </h2>
        <Tabs value={pestana} onValueChange={(v) => setPestana(v as PestanaId)}>
          <div className="overflow-x-auto">
            <TabsList>
              {pestanas.map((t) => (
                <TabsTrigger
                  key={t.id}
                  value={t.id}
                  className="flex-none px-2.5"
                >
                  {t.texto}
                  {t.n !== undefined && (
                    <span className="rounded bg-muted px-1 text-xs tabular-nums">
                      {entero(t.n)}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="original" className="pt-2">
            <TabOriginal p={p} />
          </TabsContent>
          <TabsContent value="transformados" className="pt-2">
            <TabTransformados p={p} />
          </TabsContent>
          <TabsContent value="validos" className="pt-2">
            <TabValidos p={p} />
          </TabsContent>
          <TabsContent value="rechazados" className="pt-2">
            <TabRechazados p={p} />
          </TabsContent>
          <TabsContent value="preview" className="pt-2">
            <TabCarga p={p} supabase={supabase} />
          </TabsContent>
          <TabsContent value="supabase" className="pt-2">
            <TabSupabase
              p={p}
              supabase={supabase}
              onRefrescarEstado={refrescar}
            />
          </TabsContent>
        </Tabs>
      </section>

      <footer className="border-t pt-3 text-xs text-muted-foreground">
        Datos: Open-Meteo Historical Weather API (CC BY 4.0). Entorno de
        desarrollo sin autenticación: protege las rutas{" "}
        <code>/api/supabase/*</code> antes de publicar. Pulsa <kbd>d</kbd> para
        cambiar el tema.
      </footer>
    </div>
  )
}
