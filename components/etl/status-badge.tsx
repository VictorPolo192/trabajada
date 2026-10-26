import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  LoaderCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"

export type EstadoFase = "pendiente" | "en_curso" | "completada" | "error"

const ESTADOS: Record<
  EstadoFase,
  { texto: string; icono: typeof CircleCheck; clase: string }
> = {
  pendiente: {
    texto: "Pendiente",
    icono: CircleDashed,
    clase: "border-border bg-muted text-muted-foreground",
  },
  en_curso: {
    texto: "En curso",
    icono: LoaderCircle,
    clase:
      "border-sky-600/40 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
  },
  completada: {
    texto: "Completada",
    icono: CircleCheck,
    clase:
      "border-emerald-600/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  },
  error: {
    texto: "Con errores",
    icono: CircleAlert,
    clase:
      "border-red-600/40 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100",
  },
}

/** Estado con icono y texto: no depende solo del color. */
export function StatusBadge({
  estado,
  texto,
  className,
}: {
  estado: EstadoFase
  texto?: string
  className?: string
}) {
  const e = ESTADOS[estado]
  const Icono = e.icono
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        e.clase,
        className
      )}
    >
      <Icono
        aria-hidden
        className={cn("size-3.5", estado === "en_curso" && "animate-spin")}
      />
      {texto ?? e.texto}
    </span>
  )
}
