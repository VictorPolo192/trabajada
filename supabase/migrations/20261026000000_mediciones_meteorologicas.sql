-- Tabla destino del pipeline ETL Open-Meteo → Supabase.
-- Una fila por ciudad y hora (UTC). La clave natural (ciudad, fecha_hora) permite
-- hacer upsert sin duplicar datos al repetir una carga.

create table if not exists public.mediciones_meteorologicas (
  id bigint generated always as identity primary key,
  ciudad text not null,
  fecha_hora timestamptz not null,
  temperatura_c double precision not null,
  humedad_pct double precision not null,
  precipitacion_mm double precision not null,
  importado_en timestamptz not null default now(),

  constraint mediciones_ciudad_fecha_hora_key unique (ciudad, fecha_hora),
  constraint mediciones_ciudad_no_vacia check (length(btrim(ciudad)) > 0),
  constraint mediciones_humedad_rango check (humedad_pct >= 0 and humedad_pct <= 100),
  constraint mediciones_precipitacion_no_negativa check (precipitacion_mm >= 0),
  -- Sin restricción de temperatura: los valores extremos no son errores por sí mismos.
  -- Las columnas double precision admiten 'NaN' e 'Infinity'; se rechazan explícitamente:
  constraint mediciones_valores_finitos check (
      temperatura_c not in ('NaN', 'Infinity', '-Infinity')
      and humedad_pct not in ('NaN', 'Infinity', '-Infinity')
      and precipitacion_mm not in ('NaN', 'Infinity', '-Infinity')
    )
);

comment on table public.mediciones_meteorologicas is
  'Mediciones horarias (UTC) de Open-Meteo cargadas por el pipeline ETL de la práctica.';
comment on column public.mediciones_meteorologicas.importado_en is
  'Momento de la primera inserción. Un upsert posterior actualiza las mediciones pero no este campo.';

-- Consultas habituales: por fecha y por ciudad + fecha (esta última ya la cubre el índice único).
create index if not exists mediciones_fecha_hora_idx
  on public.mediciones_meteorologicas (fecha_hora);

-- RLS activado y SIN políticas: ni anon ni authenticated pueden leer ni escribir.
-- La aplicación escribe y verifica desde el servidor con la clave secreta,
-- que usa el rol service_role (BYPASSRLS).
alter table public.mediciones_meteorologicas enable row level security;

-- Opcional (no se aplica): permitir LECTURA pública con la clave publicable.
-- create policy "lectura publica mediciones" on public.mediciones_meteorologicas
--   for select to anon, authenticated using (true);
