import { TABLA } from "@/lib/server/mediciones"
import { clienteLectura, estadoConfiguracion } from "@/lib/server/supabase"

/** Informa de qué está configurado (nunca devuelve las claves) y si la tabla responde. */
export async function GET() {
  const estado = estadoConfiguracion()
  const lectura = clienteLectura()
  let tabla: { ok: boolean; mensaje: string } = {
    ok: false,
    mensaje: "Sin credenciales.",
  }
  if (lectura) {
    const { error } = await lectura.cliente
      .from(TABLA)
      .select("id", { count: "exact", head: true })
    tabla = error
      ? {
          ok: false,
          mensaje:
            error.message ||
            "La tabla no responde (¿falta aplicar la migración?).",
        }
      : { ok: true, mensaje: "La tabla responde." }
  }
  return Response.json({ ...estado, tabla })
}
