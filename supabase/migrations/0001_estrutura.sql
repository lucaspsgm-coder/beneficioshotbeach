-- =====================================================================
-- Central de Benefícios · Módulo Mobilidade (VT e Fretado)
-- 0001 · Estrutura: tipos, tabelas, carimbo de autoria e trilha de auditoria
-- =====================================================================
-- Toda tabela tem created_at/created_by/updated_at/updated_by preenchidos
-- automaticamente, e toda inclusão, alteração ou exclusão gera uma linha em
-- audit_log com usuário, data/hora e o antes/depois do registro.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type user_role       as enum ('ADMIN', 'RH_UNIT');
create type entry_billing   as enum ('MES_CHEIO', 'PROPORCIONAL');
create type cost_model      as enum ('POR_ASSENTO', 'FECHADO', 'MISTO');
create type subsidy_type    as enum ('VALOR', 'PERCENTUAL');
create type movement_type   as enum (
  'INCLUSAO_ADMISSIONAL', 'INCLUSAO_MENSAL', 'EXCLUSAO_MENSAL',
  'PEDIDO_COMPLEMENTAR', 'ALTERACAO_CADASTRAL', 'MOVIMENTACAO_CATEGORIA',
  'TROCA_HORARIO'
);
create type movement_status as enum (
  'PENDENTE', 'AGUARDANDO_APROVACAO', 'FILA_ESPERA', 'APROVADO',
  'REJEITADO', 'CANCELADO', 'PROCESSADO'
);
create type exclusion_reason as enum ('DESLIGAMENTO', 'RENUNCIA', 'OUTRO');
create type purchase_kind   as enum ('MENSAL', 'ADMISSIONAL', 'COMPLEMENTAR');
create type purchase_status as enum ('ABERTA', 'FECHADA', 'PAGA');
create type waitlist_status as enum ('AGUARDANDO', 'APROVADO', 'CANCELADO');

-- ---------------------------------------------------------------------
-- Carimbo de autoria (quem criou / alterou e quando)
-- ---------------------------------------------------------------------
create or replace function public.tg_stamp()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    -- o usuário logado sempre prevalece; só rotinas do sistema (sem sessão) informam o autor
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Estrutura organizacional: Unidade → CNPJ (razão social) → Seção
-- ---------------------------------------------------------------------
create table business_units (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

create table legal_entities (
  id               uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references business_units(id),
  name             text not null,           -- ex.: COND HBS, HB Tour HBS
  cnpj             text,
  active           boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  unique (business_unit_id, name)
);

create table sections (
  id               uuid primary key default gen_random_uuid(),
  legal_entity_id  uuid not null references legal_entities(id),
  name             text not null,
  active           boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  unique (legal_entity_id, name)
);

-- ---------------------------------------------------------------------
-- Usuários do sistema (perfil ligado ao Supabase Auth)
-- ---------------------------------------------------------------------
create table profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  username         text not null unique,
  full_name        text not null,
  role             user_role not null default 'RH_UNIT',
  business_unit_id uuid references business_units(id),
  active           boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  constraint rh_tem_unidade check (role = 'ADMIN' or business_unit_id is not null)
);

-- ---------------------------------------------------------------------
-- Parametrização: grupo → categoria → operadora
-- ---------------------------------------------------------------------
create table benefit_groups (
  code        text primary key,                 -- MOBILIDADE
  name        text not null,
  max_active  int  not null default 1 check (max_active >= 1),
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

create table benefit_categories (
  code                    text primary key,     -- VT, FRETADO
  name                    text not null,
  group_code              text not null references benefit_groups(code),
  base_days               int  not null default 26 check (base_days between 1 and 31),
  passes_per_day          int  not null default 2  check (passes_per_day >= 0),
  admission_proportional  boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

create table operators (
  id             uuid primary key default gen_random_uuid(),
  category_code  text not null references benefit_categories(code),
  name           text not null,
  entry_billing  entry_billing not null default 'MES_CHEIO',
  notes          text,
  active         boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  unique (category_code, name)
);

-- ---------------------------------------------------------------------
-- Vale-transporte: cada par origem → destino resolve linha, operadora e tarifa
-- ---------------------------------------------------------------------
create table vt_fares (
  id           uuid primary key default gen_random_uuid(),
  operator_id  uuid not null references operators(id),
  line_name    text not null,                  -- ex.: Olímpia × Cidade F
  origin       text not null default 'Olímpia',
  destination  text not null,                  -- ex.: Cidade B (parada da linha)
  fare         numeric(10,2) not null check (fare >= 0),
  active       boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create unique index vt_fares_par_ativo on vt_fares (lower(origin), lower(destination)) where active;

-- ---------------------------------------------------------------------
-- Fretado: contrato → rota → horário (assentos)
-- ---------------------------------------------------------------------
create table charter_contracts (
  id             uuid primary key default gen_random_uuid(),
  operator_id    uuid not null references operators(id),
  name           text not null,
  cost_model     cost_model not null default 'POR_ASSENTO',
  monthly_value  numeric(12,2) check (monthly_value >= 0),
  active         boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  constraint valor_do_contrato check (cost_model = 'POR_ASSENTO' or monthly_value is not null)
);

create table charter_subsidies (
  id                uuid primary key default gen_random_uuid(),
  contract_id       uuid not null references charter_contracts(id) on delete cascade,
  business_unit_id  uuid not null references business_units(id),
  subsidy_type      subsidy_type not null default 'VALOR',
  value             numeric(12,2) not null check (value >= 0),
  joins_rateio      boolean not null default true,   -- a unidade também entra no rateio do saldo?
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  unique (contract_id, business_unit_id)
);

create table charter_routes (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references charter_contracts(id),
  name         text not null,                 -- ex.: Cidade A × Cidade B
  seat_price   numeric(10,2) check (seat_price >= 0),  -- usado no modelo por assento
  active       boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  unique (contract_id, name)
);

create table charter_schedules (
  id              uuid primary key default gen_random_uuid(),
  route_id        uuid not null references charter_routes(id),
  arrival_time    text not null,   -- desembarque, ex.: 08h20
  departure_time  text not null,   -- embarque, ex.: 16h20
  seats           int check (seats > 0),       -- nulo = ilimitado
  active          boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  unique (route_id, arrival_time, departure_time)
);

-- ---------------------------------------------------------------------
-- Colaboradores
-- ---------------------------------------------------------------------
create table employees (
  id                uuid primary key default gen_random_uuid(),
  registration      text not null check (registration ~ '^\S+$'),  -- chapa: texto, preserva zeros
  full_name         text not null,
  birth_date        date,
  admission_date    date,
  mother_name       text,
  address           text,
  business_unit_id  uuid not null references business_units(id),
  legal_entity_id   uuid not null references legal_entities(id),
  section_id        uuid not null references sections(id),
  vt_card_number    text,
  active            boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  unique (registration, legal_entity_id)
);
create index employees_unit on employees (business_unit_id);
create index employees_name on employees (lower(full_name));

-- ---------------------------------------------------------------------
-- Benefício do colaborador (período de uso)
-- Ativo numa data D quando start_date <= D e (end_date nulo ou >= D).
-- ---------------------------------------------------------------------
create table employee_benefits (
  id                   uuid primary key default gen_random_uuid(),
  employee_id          uuid not null references employees(id),
  category_code        text not null references benefit_categories(code),
  group_code           text not null references benefit_groups(code),
  vt_fare_id           uuid references vt_fares(id),
  charter_schedule_id  uuid references charter_schedules(id),
  start_date           date not null,
  end_date             date,
  canceled             boolean not null default false,
  origin_movement_id   uuid,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  constraint opcao_coerente check (
    (vt_fare_id is not null and charter_schedule_id is null) or
    (charter_schedule_id is not null and vt_fare_id is null)
  ),
  constraint periodo_valido check (end_date is null or end_date >= start_date - 1)
);
create index employee_benefits_emp on employee_benefits (employee_id) where not canceled;
create index employee_benefits_sched on employee_benefits (charter_schedule_id) where not canceled;

-- ---------------------------------------------------------------------
-- Calendário operacional (definido mês a mês pelo admin)
-- reference_month = mês da compra (sempre dia 1)
-- ---------------------------------------------------------------------
create table calendar_months (
  id               uuid primary key default gen_random_uuid(),
  reference_month  date not null unique check (extract(day from reference_month) = 1),
  window_open      date not null,
  window_close     date not null,
  cutoff_date      date not null,   -- corte (dia 20 ou próximo dia útil)
  approval_date    date not null,   -- aprovação das trocas e da fila
  purchase_date    date,
  credit_date      date,
  notes            text,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  check (window_close >= window_open)
);

-- ---------------------------------------------------------------------
-- Compras (lotes)
-- ---------------------------------------------------------------------
create table purchases (
  id               uuid primary key default gen_random_uuid(),
  kind             purchase_kind not null,
  reference_month  date not null check (extract(day from reference_month) = 1),
  period_start     date,
  period_end       date,
  status           purchase_status not null default 'ABERTA',
  closed_at        timestamptz,
  closed_by        uuid references profiles(id),
  paid_at          timestamptz,
  paid_by          uuid references profiles(id),
  notes            text,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  check (kind = 'MENSAL' or (period_start is not null and period_end is not null and period_end >= period_start))
);
create unique index purchases_mensal_unica on purchases (reference_month) where kind = 'MENSAL';

-- ---------------------------------------------------------------------
-- Movimentações
-- ---------------------------------------------------------------------
create table movements (
  id                    uuid primary key default gen_random_uuid(),
  employee_id           uuid not null references employees(id),
  business_unit_id      uuid not null references business_units(id),
  type                  movement_type not null,
  status                movement_status not null,
  category_code         text references benefit_categories(code),
  vt_fare_id            uuid references vt_fares(id),
  charter_schedule_id   uuid references charter_schedules(id),
  waitlist_schedule_id  uuid references charter_schedules(id),
  effective_date        date,
  exclusion_reason      exclusion_reason,
  justification         text,
  changes               jsonb,          -- alteração cadastral: {campo: {de, para}}
  benefit_id            uuid references employee_benefits(id),
  previous_benefit_id   uuid references employee_benefits(id),
  purchase_id           uuid references purchases(id),
  decided_by            uuid references profiles(id),
  decided_at            timestamptz,
  decision_note         text,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  constraint justificativa_complementar check (type <> 'PEDIDO_COMPLEMENTAR' or length(trim(coalesce(justification,''))) > 0)
);
create index movements_unit_status on movements (business_unit_id, status);
create index movements_employee on movements (employee_id);

alter table employee_benefits
  add constraint employee_benefits_origin_fk foreign key (origin_movement_id) references movements(id);

-- ---------------------------------------------------------------------
-- Fila de espera do fretado (sem prazo; ordem do pedido)
-- ---------------------------------------------------------------------
create table waitlist (
  id                   uuid primary key default gen_random_uuid(),
  employee_id          uuid not null references employees(id),
  business_unit_id     uuid not null references business_units(id),
  charter_schedule_id  uuid not null references charter_schedules(id),
  movement_id          uuid references movements(id),
  requested_at         timestamptz not null default now(),
  status               waitlist_status not null default 'AGUARDANDO',
  decided_by           uuid references profiles(id),
  decided_at           timestamptz,
  decision_note        text,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create unique index waitlist_uma_por_colaborador on waitlist (employee_id) where status = 'AGUARDANDO';

-- ---------------------------------------------------------------------
-- Itens de compra (foto congelada no fechamento, com nomes desnormalizados)
-- ---------------------------------------------------------------------
create table purchase_items (
  id                  uuid primary key default gen_random_uuid(),
  purchase_id         uuid not null references purchases(id) on delete cascade,
  item_kind           text not null default 'NORMAL',  -- NORMAL, PROPORCIONAL, ACERTO, SUBSIDIO
  category_code       text not null,
  employee_id         uuid references employees(id),
  benefit_id          uuid references employee_benefits(id),
  movement_id         uuid references movements(id),
  registration        text,
  employee_name       text,
  vt_card_number      text,
  business_unit_id    uuid references business_units(id),
  business_unit_name  text,
  legal_entity_id     uuid references legal_entities(id),
  legal_entity_name   text,
  section_id          uuid references sections(id),
  section_name        text,
  operator_id         uuid references operators(id),
  operator_name       text,
  contract_id         uuid references charter_contracts(id),
  contract_name       text,
  cost_model          cost_model,
  description         text,          -- linha (VT) ou rota + horário (fretado)
  days                int,
  quantity            numeric(10,2),
  unit_value          numeric(12,4),
  total               numeric(12,2) not null default 0,
  notes               text,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create index purchase_items_purchase on purchase_items (purchase_id);

-- ---------------------------------------------------------------------
-- Trilha de auditoria
-- ---------------------------------------------------------------------
create table audit_log (
  id           bigserial primary key,
  occurred_at  timestamptz not null default now(),
  user_id      uuid,
  username     text,
  action       text not null,      -- INSERT, UPDATE, DELETE ou evento (LOGIN, EXPORTACAO...)
  table_name   text,
  record_id    text,
  changed      text[],
  old_data     jsonb,
  new_data     jsonb,
  details      jsonb
);
create index audit_log_when on audit_log (occurred_at desc);
create index audit_log_record on audit_log (table_name, record_id);
create index audit_log_user on audit_log (user_id, occurred_at desc);

create or replace function public.current_username()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select username from profiles where id = auth.uid()), 'sistema')
$$;

create or replace function public.tg_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_id text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  v_id := coalesce(v_new->>'id', v_old->>'id');

  if tg_op = 'UPDATE' then
    select array_agg(key order by key) into v_changed
    from jsonb_each(v_new) n
    where n.key not in ('updated_at', 'updated_by')
      and n.value is distinct from v_old->n.key;
    if v_changed is null then return null; end if;   -- nada mudou de fato
  end if;

  insert into audit_log (user_id, username, action, table_name, record_id, changed, old_data, new_data)
  values (auth.uid(), current_username(), tg_op, tg_table_name, v_id, v_changed, v_old, v_new);
  return null;
end $$;

-- Evento de aplicação (login, exportação, upload de planilha...)
create or replace function public.log_event(p_action text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into audit_log (user_id, username, action, details)
  values (auth.uid(), current_username(), p_action, p_details);
$$;

-- Aplica carimbo + auditoria em todas as tabelas de negócio
do $$
declare t text;
begin
  foreach t in array array[
    'business_units','legal_entities','sections','profiles','benefit_groups',
    'benefit_categories','operators','vt_fares','charter_contracts',
    'charter_subsidies','charter_routes','charter_schedules','employees',
    'employee_benefits','calendar_months','purchases','movements','waitlist',
    'purchase_items'
  ] loop
    execute format('create trigger stamp before insert or update on %I for each row execute function tg_stamp()', t);
    execute format('create trigger audit after insert or update or delete on %I for each row execute function tg_audit()', t);
  end loop;
end $$;
