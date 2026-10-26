# Pipeline ETL: Open-Meteo → Supabase

Primera práctica de Big Data. Una aplicación Next.js que permite **ver y ejecutar** un pipeline ETL completo:

```
Extracción → Transformación → Limpieza → Filtrado y selección → Carga
```

Datos: mediciones horarias históricas (temperatura, humedad y precipitación) de Barcelona, Madrid, Sevilla, Bilbao y Valencia, obtenidas de la [API histórica de Open-Meteo](https://open-meteo.com/en/docs/historical-weather-api).

## Instalación

```bash
npm install
cp .env.example .env.local   # y rellena los valores (ver «Configuración»)
npm run dev                   # http://localhost:3000
```

Otros comandos: `npm test` (pruebas), `npm run typecheck`, `npm run lint`, `npm run build`.

## Configuración de Supabase

1. Crea un proyecto en Supabase.
2. Aplica la migración [supabase/migrations/20261026000000_mediciones_meteorologicas.sql](supabase/migrations/20261026000000_mediciones_meteorologicas.sql): pega su contenido en el *SQL Editor* o ejecuta `supabase db push` con la CLI.
3. En *Project Settings → API Keys*, copia la URL y una **clave secreta** (`sb_secret_…`; en proyectos antiguos, la `service_role`) en `.env.local`:

| Variable | Dónde se usa | Obligatoria |
| --- | --- | --- |
| `SUPABASE_URL` | Servidor | Sí (o `NEXT_PUBLIC_SUPABASE_URL`) |
| `SUPABASE_SECRET_KEY` | Servidor (escritura, verificación y lectura) | Sí, para cargar |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Respaldo de lectura en el servidor | No |

Sin estas variables la aplicación funciona igualmente hasta la vista previa; el botón de carga queda desactivado y se explica el motivo. **No se simula ninguna carga.**

### Seguridad

- La escritura solo se hace en las rutas del servidor `app/api/supabase/*`. El módulo `lib/server/supabase.ts` importa `server-only`, así que no puede acabar en el navegador.
- La clave secreta **nunca** lleva el prefijo `NEXT_PUBLIC_` y no se imprime en logs.
- El servidor vuelve a validar cada lote: máximo 500 filas, 256 KB, campos permitidos, ciudad conocida, fecha con zona horaria, números finitos, humedad 0–100 y precipitación ≥ 0.
- RLS está **activado** y **sin políticas**: con la clave publicable no se puede leer ni escribir.
- ⚠️ La aplicación **no tiene autenticación**: las rutas `/api/supabase/*` están abiertas para el desarrollo local. Antes de publicarla hay que protegerlas (p. ej. con Supabase Auth y comprobando la sesión en cada ruta).

## Cómo funciona el pipeline

| Fase | Qué hace | Dónde |
| --- | --- | --- |
| **Extracción** | Una petición por ciudad (`timezone=GMT`, `celsius`, `mm`), con 2 en paralelo. Máximo 31 días. El JSON original se guarda tal cual durante la sesión y se puede descargar. Si una ciudad falla, se reintenta solo esa: su resultado **sustituye** al anterior, así que no se duplican datos. | `lib/etl/extract.ts` |
| **Transformación** | La API devuelve arrays paralelos (`time[i]`, `temperature_2m[i]`…). Cada posición `i` se convierte en un registro `{ciudad, fecha_hora, temperatura_c, humedad_pct, precipitacion_mm}`. La hora `"2026-09-01T00:00"` se interpreta **explícitamente como UTC** (se le añade `Z`). Se comprueba que los arrays tengan la misma longitud; si no, se avisa y las posiciones sin pareja quedan como «ausentes». | `lib/etl/transform.ts` |
| **Limpieza** | Rechaza (con su motivo) los registros sin ciudad, sin fecha válida o con alguna medición `null`, `""`, ausente, de texto o no finita. **Nunca convierte un nulo en 0.** La humedad debe estar entre 0 y 100 y la precipitación ser ≥ 0. Las temperaturas extremas **no** se descartan. **Duplicados** por (ciudad, fecha_hora): se conserva la **primera aparición válida** en el orden de extracción y las demás se rechazan indicando cuál se conservó. | `lib/etl/clean.ts`, `lib/etl/validation.ts` |
| **Filtrado y selección** | Sobre los válidos: filtros (ciudad, fecha/hora UTC, rangos, «solo lluvia» = precipitación > 0) → ordenación → selección manual. La paginación solo afecta a lo que se ve. Solo se suben las filas seleccionadas **que siguen cumpliendo los filtros**; las que quedan fuera se cuentan aparte. Cambiar filtros nunca selecciona filas nuevas. | `lib/etl/select.ts` |
| **Carga** | Al pulsar «Subir N registros» se congela una copia del conjunto y su orden. Se envía en lotes de 500 con *upsert* por `(ciudad, fecha_hora)`; repetir una carga actualiza en lugar de duplicar. Cada lote tiene su estado; si uno falla, los anteriores se conservan y se pueden reintentar solo los fallidos. Después se verifica, por lotes, que todas las claves enviadas existen en destino. | `lib/etl/load.ts`, `lib/server/mediciones.ts` |

Notas didácticas:

- **Descartes por calidad ≠ exclusiones por filtro.** Los primeros son datos defectuosos (pestaña «Rechazados»); los segundos son datos correctos que tú decides no cargar.
- **El orden no se guarda.** Una base de datos no garantiza devolver las filas en el orden en que se insertaron; cualquier consulta debe usar `ORDER BY` (la pestaña «Datos en Supabase» lo hace).
- **Insertadas vs. actualizadas.** Supabase devuelve cuántas filas afectó el upsert, pero no distingue nuevas de actualizadas, así que la aplicación no inventa ese desglose. `importado_en` conserva la fecha de la primera inserción.

## Pruebas

```bash
npm test
```

- `tests/pipeline.test.ts`: transformación, nulos, duplicados, filtros y orden antes de paginar, selección entre páginas, coincidencia vista previa ↔ envío y fallo parcial con reintento. Usa **fixtures controlados** en `tests/fixtures/` (los datos reales de septiembre de 2026 no tienen nulos ni duplicados). Los fixtures solo se usan en las pruebas, nunca en la aplicación.
- `tests/servidor.test.ts`: validación del servidor, segunda carga sin duplicados y verificación por lotes, con un repositorio **en memoria** que imita la restricción `UNIQUE`. No sustituye a una prueba con Supabase real.
- `tests/open-meteo.integracion.test.ts`: llamada real a Open-Meteo (requiere red): una ciudad, un día → 24 registros en UTC.

## Estructura

```
app/page.tsx                      Pantalla de trabajo
app/api/supabase/*/route.ts       Carga, verificación, lectura y estado (solo servidor)
components/etl/                   Interfaz (configuración, pipeline, pestañas, tablas)
hooks/use-pipeline.ts             Estado del pipeline en el navegador
lib/etl/                          Lógica pura de cada fase (sin React)
lib/server/                       Acceso a Supabase en el servidor
supabase/migrations/              Tabla mediciones_meteorologicas
tests/                            Pruebas y fixtures
```
