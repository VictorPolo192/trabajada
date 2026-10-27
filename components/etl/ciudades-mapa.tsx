"use client"

import * as React from "react"
import "maplibre-gl/dist/maplibre-gl.css"
import type { Map as MapaMapLibre, Marker } from "maplibre-gl"

import { CIUDADES } from "@/lib/etl/cities"

// Clave pública de MapTiler: viaja al navegador por diseño. Restríngela por
// dominio en el panel de MapTiler (Account > Keys > Allowed HTTP origins).
const CLAVE_MAPTILER = process.env.NEXT_PUBLIC_MAPTILER_KEY
const ESTILO = `https://api.maptiler.com/maps/hybrid-v4/style.json?key=${CLAVE_MAPTILER}`

type Props = {
  seleccionadas: string[]
  bloqueado: boolean
  onAlternar: (nombre: string) => void
}

export function CiudadesMapa({ seleccionadas, bloqueado, onAlternar }: Props) {
  const contenedor = React.useRef<HTMLDivElement>(null)
  const marcadores = React.useRef(new Map<string, Marker>())
  // Los marcadores se crean una vez; leen las props actuales a través de esta ref.
  const ultimas = React.useRef({ seleccionadas, bloqueado, onAlternar })
  React.useEffect(() => {
    ultimas.current = { seleccionadas, bloqueado, onAlternar }
    pintar(marcadores.current, seleccionadas, bloqueado)
  })

  React.useEffect(() => {
    if (!CLAVE_MAPTILER || !contenedor.current) return
    let mapa: MapaMapLibre | undefined
    let cancelado = false

    // maplibre-gl usa window: se carga solo en el navegador.
    import("maplibre-gl").then(({ Map, Marker, NavigationControl }) => {
      if (cancelado || !contenedor.current) return
      mapa = new Map({
        container: contenedor.current,
        style: ESTILO,
        center: [-3.2, 40.2],
        zoom: 4.6,
        attributionControl: { compact: true },
      })
      mapa.addControl(new NavigationControl({ showCompass: false }))

      for (const c of CIUDADES) {
        const el = document.createElement("button")
        el.type = "button"
        el.className =
          "rounded-full border-2 border-white px-2 py-0.5 text-xs font-medium shadow-md transition-colors"
        el.textContent = c.nombre
        el.addEventListener("click", () => {
          if (!ultimas.current.bloqueado) ultimas.current.onAlternar(c.nombre)
        })
        marcadores.current.set(
          c.nombre,
          new Marker({ element: el })
            .setLngLat([c.longitud, c.latitud])
            .addTo(mapa)
        )
      }
      const { seleccionadas, bloqueado } = ultimas.current
      pintar(marcadores.current, seleccionadas, bloqueado)
    })

    const lista = marcadores.current
    return () => {
      cancelado = true
      lista.clear()
      mapa?.remove()
    }
  }, [])

  if (!CLAVE_MAPTILER) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        Mapa desactivado: define <code>NEXT_PUBLIC_MAPTILER_KEY</code>.
      </p>
    )
  }

  return (
    <div
      ref={contenedor}
      className="h-72 w-full overflow-hidden rounded-lg border sm:h-80"
      aria-label="Mapa de ciudades. Pulsa una ciudad para seleccionarla."
    />
  )
}

function pintar(
  marcadores: Map<string, Marker>,
  seleccionadas: string[],
  bloqueado: boolean
) {
  for (const [nombre, m] of marcadores) {
    const el = m.getElement() as HTMLButtonElement
    const activa = seleccionadas.includes(nombre)
    el.setAttribute("aria-pressed", String(activa))
    el.disabled = bloqueado
    el.style.cursor = bloqueado ? "not-allowed" : "pointer"
    el.style.background = activa ? "#2563eb" : "rgba(255,255,255,0.85)"
    el.style.color = activa ? "#fff" : "#111"
  }
}
