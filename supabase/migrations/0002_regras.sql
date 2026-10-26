-- =====================================================================
-- 0002 · Regras de negócio
-- Benefício único, controle de assentos, hierarquia, e todo o fluxo de
-- movimentações, aprovações, fila de espera e compras.
-- As funções de fluxo são SECURITY DEFINER: o RH não grava direto nas
-- tabelas (só lê), e cada função confere quem está pedindo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilidades de data (fuso de São Paulo)
-- ---------------------------------------------------------------------
create or replace function public.today_br()
returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create or replace function public.first_of_next_month(d date)
returns date language sql immutable as $$
  select (date_trunc('month', d) + interval '1 month')::date
$$;

-- ---------------------------------------------------------------------
-- Quem está logado
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'ADMIN' and active)
$$;

create or replace function public.my_unit()
returns uuid language sql stable security definer set search_path = public as $$
  select business_unit_id from profiles where id = auth.uid() and active
$$;

create or replace function public.assert_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Somente o administrador pode fazer isso.' using errcode = 'P0001', hint = 'SEM_PERMISSAO';
  end if;
end $$;

create or replace function public.assert_can_act_on_unit(p_unit uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare v profiles;
begin
  select * into v from profiles where id = auth.uid();
  if not found or not v.active then
    raise exception 'Sua sessão não tem acesso ao sistema.' using errcode = 'P0001', hint = 'SEM_PERMISSAO';
  end if;
  if v.role = 'RH_UNIT' and v.business_unit_id is distinct from p_unit then
    raise exception 'Você só pode movimentar colaboradores da sua unidade.' using errcode = 'P0001', hint = 'SEM_PERMISSAO';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Hierarquia do colaborador: seção ∈ razão social ∈ unidade
-- ---------------------------------------------------------------------
create or replace function public.tg_employee_hierarchy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.registration := trim(new.registration);
  new.full_name := trim(new.full_name);
  if not exists (select 1 from legal_entities where id = new.legal_entity_id and business_unit_id = new.business_unit_id) then
    raise exception 'A razão social escolhida não pertence à unidade.' using errcode = 'P0001', hint = 'HIERARQUIA';
  end if;
  if not exists (select 1 from sections where id = new.section_id and legal_entity_id = new.legal_entity_id) then
    raise exception 'A seção escolhida não pertence à razão social.' using errcode = 'P0001', hint = 'HIERARQUIA';
  end if;
  return new;
end $$;

create trigger hierarchy before insert or update on employees
for each row execute function tg_employee_hierarchy();

-- ---------------------------------------------------------------------
-- Categoria da opção escolhida (tarifa de VT ou horário de fretado)
-- ---------------------------------------------------------------------
create or replace function public.option_category(p_fare uuid, p_schedule uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select o.category_code from vt_fares f join operators o on o.id = f.operator_id where f.id = p_fare),
    (select o.category_code
       from charter_schedules s
       join charter_routes r    on r.id = s.route_id
       join charter_contracts c on c.id = r.contract_id
       join operators o         on o.id = c.operator_id
      where s.id = p_schedule)
  )
$$;

-- Assentos comprometidos num horário a partir de uma data (inclui reservas futuras)
create or replace function public.seats_taken(p_schedule uuid, p_from date, p_ignore uuid default null)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
    from employee_benefits b
   where b.charter_schedule_id = p_schedule
     and not b.canceled
     and b.id is distinct from p_ignore
     and (b.end_date is null or (b.end_date >= p_from and b.end_date >= b.start_date))
$$;

-- Disponibilidade para o formulário (qualquer usuário logado vê a contagem, não os nomes)
create or replace function public.schedule_availability(p_from date default null)
returns table (schedule_id uuid, seats int, taken int)
language sql stable security definer set search_path = public as $$
  select s.id, s.seats, seats_taken(s.id, coalesce(p_from, today_br()))
    from charter_schedules s
   where s.active
$$;

-- ---------------------------------------------------------------------
-- Regras do benefício: coerência, benefício único e assentos
-- ---------------------------------------------------------------------
create or replace function public.tg_benefit_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_group     text;
  v_max       int;
  v_count     int;
  v_seats     int;
  v_need_seat boolean;
begin
  select c.group_code, g.max_active into v_group, v_max
    from benefit_categories c join benefit_groups g on g.code = c.group_code
   where c.code = new.category_code;
  new.group_code := v_group;

  if option_category(new.vt_fare_id, new.charter_schedule_id) is distinct from new.category_code then
    raise exception 'A opção escolhida não pertence à categoria %.', new.category_code
      using errcode = 'P0001', hint = 'OPCAO_INVALIDA';
  end if;

  -- benefício cancelado ou período vazio não ocupa nada
  if new.canceled or (new.end_date is not null and new.end_date < new.start_date) then
    return new;
  end if;

  -- trava o colaborador para evitar duas inclusões simultâneas
  perform 1 from employees where id = new.employee_id for update;

  -- benefício único (limite parametrizado no grupo)
  select count(*) into v_count
    from employee_benefits b
   where b.employee_id = new.employee_id
     and b.group_code = v_group
     and not b.canceled
     and b.id <> new.id
     and (b.end_date is null or b.end_date >= b.start_date)
     and (b.end_date is null or b.end_date >= new.start_date)
     and (new.end_date is null or b.start_date <= new.end_date);
  if v_count >= v_max then
    raise exception 'O colaborador já tem um benefício de mobilidade nesse período (limite: % por vez).', v_max
      using errcode = 'P0001', hint = 'BENEFICIO_UNICO';
  end if;

  -- assentos do fretado
  if new.charter_schedule_id is not null then
    v_need_seat := tg_op = 'INSERT'
      or old.canceled
      or old.charter_schedule_id is distinct from new.charter_schedule_id
      or new.start_date < old.start_date
      or (old.end_date is not null and (new.end_date is null or new.end_date > old.end_date));
    if v_need_seat then
      select seats into v_seats from charter_schedules where id = new.charter_schedule_id for update;
      if v_seats is not null then
        select count(*) into v_count
          from employee_benefits b
         where b.charter_schedule_id = new.charter_schedule_id
           and not b.canceled
           and b.id <> new.id
           and (b.end_date is null or b.end_date >= b.start_date)
           and (b.end_date is null or b.end_date >= new.start_date)
           and (new.end_date is null or b.start_date <= new.end_date);
        if v_count >= v_seats then
          raise exception 'Não há assento livre nesse horário.' using errcode = 'P0001', hint = 'SEM_VAGA';
        end if;
      end if;
    end if;
  end if;

  return new;
end $$;

create trigger rules before insert or update on employee_benefits
for each row execute function tg_benefit_rules();

-- ---------------------------------------------------------------------
-- Apoio: benefício em aberto e janela vigente
-- ---------------------------------------------------------------------
create or replace function public.open_benefit(p_employee uuid)
returns employee_benefits language sql stable security definer set search_path = public as $$
  select * from employee_benefits
   where employee_id = p_employee and not canceled and end_date is null
   order by start_date desc
   limit 1
$$;

create or replace function public.current_window()
returns calendar_months language plpgsql stable security definer set search_path = public as $$
declare v calendar_months;
begin
  select * into v from calendar_months
   where today_br() between window_open and window_close
   order by reference_month
   limit 1;
  if not found then
    raise exception 'A janela de movimentação mensal está fechada. Use um pedido complementar ou aguarde a próxima janela.'
      using errcode = 'P0001', hint = 'JANELA_FECHADA';
  end if;
  return v;
end $$;

create or replace function public.has_pending_change(p_employee uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from movements
     where employee_id = p_employee
       and type in ('MOVIMENTACAO_CATEGORIA', 'TROCA_HORARIO', 'PEDIDO_COMPLEMENTAR')
       and status in ('AGUARDANDO_APROVACAO', 'FILA_ESPERA')
  )
$$;

-- =====================================================================
-- FLUXO DO RH
-- =====================================================================

-- Inclusão admissional, inclusão mensal ou pedido complementar.
-- p: { type, employee_id | employee{...}, category_code, vt_fare_id,
--      charter_schedule_id, waitlist_schedule_id, start_date, justification }
create or replace function public.submit_inclusion(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_type   movement_type := (p->>'type')::movement_type;
  v_emp_id uuid := nullif(p->>'employee_id', '')::uuid;
  e        jsonb := coalesce(p->'employee', '{}'::jsonb);
  v_cat    text := p->>'category_code';
  v_fare   uuid := nullif(p->>'vt_fare_id', '')::uuid;
  v_sched  uuid := nullif(p->>'charter_schedule_id', '')::uuid;
  v_wait   uuid := nullif(p->>'waitlist_schedule_id', '')::uuid;
  v_emp    employees;
  v_win    calendar_months;
  v_start  date;
  v_status movement_status;
  v_mov    uuid;
  v_ben    uuid;
begin
  if v_type not in ('INCLUSAO_ADMISSIONAL', 'INCLUSAO_MENSAL', 'PEDIDO_COMPLEMENTAR') then
    raise exception 'Tipo de inclusão inválido.' using errcode = 'P0001';
  end if;
  if option_category(v_fare, v_sched) is distinct from v_cat then
    raise exception 'Escolha um destino de VT ou um horário de fretado válido.' using errcode = 'P0001', hint = 'OPCAO_INVALIDA';
  end if;

  if v_emp_id is null then
    perform assert_can_act_on_unit(nullif(e->>'business_unit_id', '')::uuid);
    if coalesce(trim(e->>'registration'), '') = '' or coalesce(trim(e->>'full_name'), '') = '' then
      raise exception 'Informe nome completo e chapa.' using errcode = 'P0001';
    end if;
    if exists (select 1 from employees where registration = trim(e->>'registration')
                 and legal_entity_id = nullif(e->>'legal_entity_id', '')::uuid) then
      raise exception 'Já existe um colaborador com a chapa % nessa razão social. Selecione-o na busca.', trim(e->>'registration')
        using errcode = 'P0001', hint = 'CHAPA_DUPLICADA';
    end if;
    insert into employees (registration, full_name, birth_date, admission_date, mother_name, address,
                           business_unit_id, legal_entity_id, section_id, vt_card_number)
    values (trim(e->>'registration'), trim(e->>'full_name'),
            nullif(e->>'birth_date', '')::date, nullif(e->>'admission_date', '')::date,
            nullif(trim(e->>'mother_name'), ''), nullif(trim(e->>'address'), ''),
            (e->>'business_unit_id')::uuid, (e->>'legal_entity_id')::uuid, (e->>'section_id')::uuid,
            nullif(trim(e->>'vt_card_number'), ''))
    returning * into v_emp;
  else
    select * into v_emp from employees where id = v_emp_id;
    if not found then raise exception 'Colaborador não encontrado.' using errcode = 'P0001'; end if;
    perform assert_can_act_on_unit(v_emp.business_unit_id);
    if not v_emp.active then
      update employees set active = true where id = v_emp.id;
    end if;
  end if;

  if has_pending_change(v_emp.id) then
    raise exception 'Este colaborador já tem uma solicitação aguardando aprovação.' using errcode = 'P0001', hint = 'PENDENTE';
  end if;

  if v_type = 'INCLUSAO_MENSAL' then
    v_win := current_window();
    v_start := v_win.reference_month;
    v_status := 'PENDENTE';
  elsif v_type = 'INCLUSAO_ADMISSIONAL' then
    v_start := v_emp.admission_date;
    if v_start is null then
      raise exception 'Informe a data de admissão.' using errcode = 'P0001';
    end if;
    v_status := 'PENDENTE';
  else
    v_start := coalesce(nullif(p->>'start_date', '')::date, today_br());
    v_status := 'AGUARDANDO_APROVACAO';
    if coalesce(trim(p->>'justification'), '') = '' then
      raise exception 'Informe a justificativa do pedido complementar.' using errcode = 'P0001';
    end if;
    if (open_benefit(v_emp.id)).id is not null then
      raise exception 'O colaborador já tem benefício ativo. Pedido complementar não serve para trocar de benefício: use uma movimentação de categoria.'
        using errcode = 'P0001', hint = 'BENEFICIO_UNICO';
    end if;
  end if;

  if v_wait is not null then
    if v_type <> 'INCLUSAO_ADMISSIONAL' then
      raise exception 'A fila de espera junto com a inclusão só vale para admissões.' using errcode = 'P0001';
    end if;
    if option_category(null, v_wait) <> 'FRETADO' or v_wait = v_sched then
      raise exception 'Escolha um horário de fretado diferente para a fila de espera.' using errcode = 'P0001';
    end if;
  end if;

  insert into movements (employee_id, business_unit_id, type, status, category_code, vt_fare_id,
                         charter_schedule_id, waitlist_schedule_id, effective_date, justification)
  values (v_emp.id, v_emp.business_unit_id, v_type, v_status, v_cat, v_fare,
          v_sched, v_wait, v_start, nullif(trim(p->>'justification'), ''))
  returning id into v_mov;

  if v_type <> 'PEDIDO_COMPLEMENTAR' then
    insert into employee_benefits (employee_id, category_code, group_code, vt_fare_id, charter_schedule_id, start_date, origin_movement_id)
    values (v_emp.id, v_cat, 'MOBILIDADE', v_fare, v_sched, v_start, v_mov)
    returning id into v_ben;
    update movements set benefit_id = v_ben where id = v_mov;

    if v_wait is not null then
      insert into waitlist (employee_id, business_unit_id, charter_schedule_id, movement_id)
      values (v_emp.id, v_emp.business_unit_id, v_wait, v_mov);
    end if;
  end if;

  return v_mov;
end $$;

-- Exclusão mensal: o colaborador sai da próxima compra
create or replace function public.submit_exclusion(p_employee uuid, p_reason exclusion_reason, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_emp    employees;
  v_win    calendar_months;
  v_ben    employee_benefits;
  v_action text;
  v_mov    uuid;
begin
  select * into v_emp from employees where id = p_employee;
  if not found then raise exception 'Colaborador não encontrado.' using errcode = 'P0001'; end if;
  perform assert_can_act_on_unit(v_emp.business_unit_id);
  v_win := current_window();

  if exists (select 1 from movements where employee_id = p_employee and type = 'EXCLUSAO_MENSAL' and status = 'PENDENTE') then
    raise exception 'Já existe uma exclusão pendente para este colaborador.' using errcode = 'P0001', hint = 'PENDENTE';
  end if;

  v_ben := open_benefit(p_employee);
  if v_ben.id is null then
    raise exception 'O colaborador não tem benefício ativo para excluir.' using errcode = 'P0001';
  end if;

  if v_ben.start_date >= v_win.reference_month then
    update employee_benefits set canceled = true where id = v_ben.id;
    v_action := 'canceled';
  else
    update employee_benefits set end_date = v_win.reference_month - 1 where id = v_ben.id;
    v_action := 'ended';
  end if;

  insert into movements (employee_id, business_unit_id, type, status, category_code, effective_date,
                         exclusion_reason, justification, benefit_id, changes)
  values (p_employee, v_emp.business_unit_id, 'EXCLUSAO_MENSAL', 'PENDENTE', v_ben.category_code,
          v_win.reference_month, p_reason, nullif(trim(p_note), ''), v_ben.id,
          jsonb_build_object('benefit_action', v_action))
  returning id into v_mov;

  if p_reason = 'DESLIGAMENTO' then
    update waitlist set status = 'CANCELADO', decision_note = 'Saída automática: colaborador desligado', decided_at = now()
     where employee_id = p_employee and status = 'AGUARDANDO';
    update movements set status = 'CANCELADO', decision_note = 'Cancelado automaticamente pelo desligamento', decided_at = now()
     where employee_id = p_employee and status in ('AGUARDANDO_APROVACAO', 'FILA_ESPERA');
  end if;

  return v_mov;
end $$;

-- Movimentação de categoria (troca de rota/horário ou VT ↔ fretado): só vale no mês seguinte
create or replace function public.submit_category_change(
  p_employee uuid, p_category text, p_fare uuid, p_schedule uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_emp    employees;
  v_ben    employee_benefits;
  v_eff    date := first_of_next_month(today_br());
  v_status movement_status := 'AGUARDANDO_APROVACAO';
  v_seats  int;
  v_mov    uuid;
begin
  select * into v_emp from employees where id = p_employee;
  if not found then raise exception 'Colaborador não encontrado.' using errcode = 'P0001'; end if;
  perform assert_can_act_on_unit(v_emp.business_unit_id);

  if option_category(p_fare, p_schedule) is distinct from p_category then
    raise exception 'Escolha um destino de VT ou um horário de fretado válido.' using errcode = 'P0001', hint = 'OPCAO_INVALIDA';
  end if;
  if has_pending_change(p_employee) then
    raise exception 'Já existe uma troca aguardando aprovação para este colaborador.' using errcode = 'P0001', hint = 'PENDENTE';
  end if;

  v_ben := open_benefit(p_employee);
  if v_ben.id is null then
    raise exception 'O colaborador não tem benefício ativo. Use uma inclusão.' using errcode = 'P0001';
  end if;
  if v_ben.start_date > today_br() and exists (
       select 1 from movements where id = v_ben.origin_movement_id and type = 'MOVIMENTACAO_CATEGORIA') then
    raise exception 'Já existe uma troca aprovada para começar em %.', to_char(v_ben.start_date, 'DD/MM/YYYY')
      using errcode = 'P0001', hint = 'PENDENTE';
  end if;
  if v_ben.vt_fare_id is not distinct from p_fare and v_ben.charter_schedule_id is not distinct from p_schedule then
    raise exception 'A opção escolhida é a mesma do benefício atual.' using errcode = 'P0001';
  end if;

  if p_schedule is not null then
    select seats into v_seats from charter_schedules where id = p_schedule;
    if v_seats is not null and seats_taken(p_schedule, v_eff) >= v_seats then
      v_status := 'FILA_ESPERA';
    end if;
  end if;

  insert into movements (employee_id, business_unit_id, type, status, category_code, vt_fare_id,
                         charter_schedule_id, previous_benefit_id, justification)
  values (p_employee, v_emp.business_unit_id, 'MOVIMENTACAO_CATEGORIA', v_status, p_category, p_fare,
          p_schedule, v_ben.id, nullif(trim(p_note), ''))
  returning id into v_mov;

  if v_status = 'FILA_ESPERA' then
    insert into waitlist (employee_id, business_unit_id, charter_schedule_id, movement_id)
    values (p_employee, v_emp.business_unit_id, p_schedule, v_mov);
  end if;

  return v_mov;
end $$;

-- Troca de horário por mudança de turno: mesma rota e operadora, pode ser no meio do mês
create or replace function public.submit_schedule_swap(p_employee uuid, p_schedule uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_emp employees;
  v_ben employee_benefits;
  v_mov uuid;
begin
  select * into v_emp from employees where id = p_employee;
  if not found then raise exception 'Colaborador não encontrado.' using errcode = 'P0001'; end if;
  perform assert_can_act_on_unit(v_emp.business_unit_id);
  if has_pending_change(p_employee) then
    raise exception 'Já existe uma troca aguardando aprovação para este colaborador.' using errcode = 'P0001', hint = 'PENDENTE';
  end if;

  v_ben := open_benefit(p_employee);
  if v_ben.id is null or v_ben.charter_schedule_id is null then
    raise exception 'A troca de horário só vale para quem já usa fretado.' using errcode = 'P0001';
  end if;
  if v_ben.charter_schedule_id = p_schedule then
    raise exception 'O horário escolhido é o mesmo do benefício atual.' using errcode = 'P0001';
  end if;
  if (select route_id from charter_schedules where id = p_schedule)
     is distinct from (select route_id from charter_schedules where id = v_ben.charter_schedule_id) then
    raise exception 'A troca no meio do mês só vale na mesma rota e operadora. Para mudar de rota, use uma movimentação de categoria.'
      using errcode = 'P0001', hint = 'ROTA_DIFERENTE';
  end if;

  insert into movements (employee_id, business_unit_id, type, status, category_code,
                         charter_schedule_id, previous_benefit_id, justification)
  values (p_employee, v_emp.business_unit_id, 'TROCA_HORARIO', 'AGUARDANDO_APROVACAO', 'FRETADO',
          p_schedule, v_ben.id, nullif(trim(p_note), ''))
  returning id into v_mov;
  return v_mov;
end $$;

-- Alteração cadastral: aplica na hora e registra o antes/depois
create or replace function public.submit_employee_update(p_employee uuid, p_fields jsonb, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_old     employees;
  v_new     employees;
  v_allowed text[] := array['registration','full_name','birth_date','admission_date','mother_name','address',
                            'business_unit_id','legal_entity_id','section_id','vt_card_number'];
  v_fields  jsonb;
  v_changes jsonb;
  v_mov     uuid;
begin
  select * into v_old from employees where id = p_employee;
  if not found then raise exception 'Colaborador não encontrado.' using errcode = 'P0001'; end if;
  perform assert_can_act_on_unit(v_old.business_unit_id);
  perform current_window();

  select coalesce(jsonb_object_agg(key, case when jsonb_typeof(value) = 'string' and trim(value #>> '{}') = '' then 'null'::jsonb else value end), '{}'::jsonb)
    into v_fields
    from jsonb_each(p_fields) where key = any(v_allowed);

  v_new := jsonb_populate_record(v_old, v_fields);

  select jsonb_object_agg(n.key, jsonb_build_object('de', to_jsonb(v_old)->n.key, 'para', n.value))
    into v_changes
    from jsonb_each(to_jsonb(v_new)) n
   where n.key = any(v_allowed) and n.value is distinct from to_jsonb(v_old)->n.key;

  if v_changes is null then
    raise exception 'Nada foi alterado.' using errcode = 'P0001';
  end if;

  update employees set
    registration = v_new.registration, full_name = v_new.full_name, birth_date = v_new.birth_date,
    admission_date = v_new.admission_date, mother_name = v_new.mother_name, address = v_new.address,
    business_unit_id = v_new.business_unit_id, legal_entity_id = v_new.legal_entity_id,
    section_id = v_new.section_id, vt_card_number = v_new.vt_card_number
  where id = p_employee;

  -- a movimentação fica registrada na unidade de origem
  insert into movements (employee_id, business_unit_id, type, status, effective_date, justification, changes)
  values (p_employee, v_old.business_unit_id, 'ALTERACAO_CADASTRAL', 'PROCESSADO', today_br(),
          nullif(trim(p_note), ''), v_changes)
  returning id into v_mov;

  -- mudou de unidade: pedidos e fila acompanham a nova unidade
  if v_new.business_unit_id <> v_old.business_unit_id then
    update waitlist set business_unit_id = v_new.business_unit_id where employee_id = p_employee and status = 'AGUARDANDO';
    update movements set business_unit_id = v_new.business_unit_id
     where employee_id = p_employee and status in ('PENDENTE', 'AGUARDANDO_APROVACAO', 'FILA_ESPERA', 'APROVADO');
  end if;
  return v_mov;
end $$;

-- =====================================================================
-- FLUXO DO ADMIN
-- =====================================================================

-- Encerra o benefício atual e abre o novo a partir de p_eff
create or replace function public.apply_switch(p_mov movements, p_eff date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_prev   employee_benefits;
  v_action text;
  v_new    uuid;
begin
  select * into v_prev from employee_benefits where id = p_mov.previous_benefit_id for update;
  if not found or v_prev.canceled or (v_prev.end_date is not null and v_prev.end_date < p_eff) then
    raise exception 'O benefício atual do colaborador mudou desde o pedido. Rejeite e peça uma nova solicitação.'
      using errcode = 'P0001', hint = 'DESATUALIZADO';
  end if;

  if v_prev.start_date >= p_eff then
    update employee_benefits set canceled = true where id = v_prev.id;
    v_action := 'canceled';
  else
    update employee_benefits set end_date = p_eff - 1 where id = v_prev.id;
    v_action := 'ended';
  end if;

  insert into employee_benefits (employee_id, category_code, group_code, vt_fare_id, charter_schedule_id, start_date, origin_movement_id)
  values (p_mov.employee_id, p_mov.category_code, 'MOBILIDADE', p_mov.vt_fare_id, p_mov.charter_schedule_id, p_eff, p_mov.id)
  returning id into v_new;

  update movements
     set benefit_id = v_new,
         changes = coalesce(changes, '{}'::jsonb) || jsonb_build_object('prev_action', v_action, 'prev_end_date', v_prev.end_date)
   where id = p_mov.id;
  return v_new;
end $$;

create or replace function public.approve_movement(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  m     movements;
  v_eff date;
  v_ben uuid;
begin
  perform assert_admin();
  select * into m from movements where id = p_id for update;
  if not found then raise exception 'Solicitação não encontrada.' using errcode = 'P0001'; end if;
  if m.status not in ('AGUARDANDO_APROVACAO', 'FILA_ESPERA') then
    raise exception 'Esta solicitação já foi decidida.' using errcode = 'P0001';
  end if;

  if m.type = 'PEDIDO_COMPLEMENTAR' then
    insert into employee_benefits (employee_id, category_code, group_code, vt_fare_id, charter_schedule_id, start_date, origin_movement_id)
    values (m.employee_id, m.category_code, 'MOBILIDADE', m.vt_fare_id, m.charter_schedule_id, m.effective_date, m.id)
    returning id into v_ben;
    update movements set status = 'APROVADO', benefit_id = v_ben where id = p_id;

  elsif m.type = 'MOVIMENTACAO_CATEGORIA' then
    v_eff := first_of_next_month(today_br());
    perform apply_switch(m, v_eff);
    update movements set status = 'APROVADO', effective_date = v_eff where id = p_id;

  elsif m.type = 'TROCA_HORARIO' then
    v_eff := today_br();
    perform apply_switch(m, v_eff);
    update movements set status = 'PROCESSADO', effective_date = v_eff where id = p_id;

  else
    raise exception 'Este tipo de movimentação não passa por aprovação.' using errcode = 'P0001';
  end if;

  update movements set decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '')
   where id = p_id;
  update waitlist set status = 'APROVADO', decided_by = auth.uid(), decided_at = now()
   where movement_id = p_id and status = 'AGUARDANDO';
end $$;

create or replace function public.reject_movement(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare m movements;
begin
  perform assert_admin();
  if coalesce(trim(p_note), '') = '' then
    raise exception 'Informe o motivo da rejeição. O RH vai ver esse texto.' using errcode = 'P0001';
  end if;
  select * into m from movements where id = p_id for update;
  if not found or m.status not in ('AGUARDANDO_APROVACAO', 'FILA_ESPERA') then
    raise exception 'Esta solicitação já foi decidida.' using errcode = 'P0001';
  end if;
  update movements set status = 'REJEITADO', decided_by = auth.uid(), decided_at = now(), decision_note = trim(p_note)
   where id = p_id;
  update waitlist set status = 'CANCELADO', decided_by = auth.uid(), decided_at = now(), decision_note = 'Solicitação rejeitada: ' || trim(p_note)
   where movement_id = p_id and status = 'AGUARDANDO';
end $$;

-- Cancelamento (RH da unidade ou admin), antes de entrar numa compra fechada
create or replace function public.cancel_movement(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare m movements;
begin
  select * into m from movements where id = p_id for update;
  if not found then raise exception 'Solicitação não encontrada.' using errcode = 'P0001'; end if;
  perform assert_can_act_on_unit(m.business_unit_id);
  if m.purchase_id is not null then
    raise exception 'Esta movimentação já entrou numa compra fechada. Peça ao admin para reabrir a compra.' using errcode = 'P0001';
  end if;

  if m.status = 'PENDENTE' then
    if m.type in ('INCLUSAO_ADMISSIONAL', 'INCLUSAO_MENSAL') then
      update employee_benefits set canceled = true where id = m.benefit_id;
    elsif m.type = 'EXCLUSAO_MENSAL' then
      if m.changes->>'benefit_action' = 'canceled' then
        update employee_benefits set canceled = false where id = m.benefit_id;
      else
        update employee_benefits set end_date = null where id = m.benefit_id;
      end if;
    end if;
  elsif m.status = 'APROVADO' then
    perform assert_admin();
    if m.type = 'PEDIDO_COMPLEMENTAR' then
      update employee_benefits set canceled = true where id = m.benefit_id;
    elsif m.type = 'MOVIMENTACAO_CATEGORIA' then
      update employee_benefits set canceled = true where id = m.benefit_id;
      if m.changes->>'prev_action' = 'canceled' then
        update employee_benefits set canceled = false where id = m.previous_benefit_id;
      else
        update employee_benefits set end_date = nullif(m.changes->>'prev_end_date', '')::date where id = m.previous_benefit_id;
      end if;
    end if;
  elsif m.status not in ('AGUARDANDO_APROVACAO', 'FILA_ESPERA') then
    raise exception 'Esta movimentação não pode mais ser cancelada.' using errcode = 'P0001';
  end if;

  update movements set status = 'CANCELADO', decided_by = auth.uid(), decided_at = now(),
         decision_note = coalesce(nullif(trim(p_note), ''), 'Cancelado por ' || current_username())
   where id = p_id;
  update waitlist set status = 'CANCELADO', decided_by = auth.uid(), decided_at = now(), decision_note = 'Solicitação cancelada'
   where movement_id = p_id and status = 'AGUARDANDO';
end $$;

-- Aprovar a saída da fila: gera e aprova a troca para o mês seguinte
create or replace function public.approve_waitlist(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  w     waitlist;
  m     movements;
  v_ben employee_benefits;
  v_mov uuid;
begin
  perform assert_admin();
  select * into w from waitlist where id = p_id for update;
  if not found or w.status <> 'AGUARDANDO' then
    raise exception 'Este pedido já saiu da fila.' using errcode = 'P0001';
  end if;
  select * into m from movements where id = w.movement_id;

  if m.type = 'MOVIMENTACAO_CATEGORIA' then
    perform approve_movement(m.id, p_note);
  else
    v_ben := open_benefit(w.employee_id);
    if v_ben.id is null then
      raise exception 'O colaborador não tem benefício ativo para trocar.' using errcode = 'P0001';
    end if;
    insert into movements (employee_id, business_unit_id, type, status, category_code, charter_schedule_id,
                           previous_benefit_id, justification)
    values (w.employee_id, w.business_unit_id, 'MOVIMENTACAO_CATEGORIA', 'FILA_ESPERA', 'FRETADO',
            w.charter_schedule_id, v_ben.id, 'Saída da fila de espera')
    returning id into v_mov;
    perform approve_movement(v_mov, p_note);
  end if;

  update waitlist set status = 'APROVADO', decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(trim(p_note), '')
   where id = p_id;
end $$;

create or replace function public.cancel_waitlist(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare w waitlist;
begin
  select * into w from waitlist where id = p_id for update;
  if not found or w.status <> 'AGUARDANDO' then
    raise exception 'Este pedido já saiu da fila.' using errcode = 'P0001';
  end if;
  perform assert_can_act_on_unit(w.business_unit_id);
  update waitlist set status = 'CANCELADO', decided_by = auth.uid(), decided_at = now(),
         decision_note = coalesce(nullif(trim(p_note), ''), 'Retirado da fila')
   where id = p_id;
  update movements set status = 'CANCELADO', decided_by = auth.uid(), decided_at = now(),
         decision_note = 'Retirado da fila de espera'
   where id = w.movement_id and status = 'FILA_ESPERA';
end $$;

-- Posição na fila (por horário, ordem do pedido)
create or replace function public.waitlist_positions()
returns table (waitlist_id uuid, queue_position int)
language sql stable security definer set search_path = public as $$
  select id, (row_number() over (partition by charter_schedule_id order by requested_at))::int
    from waitlist where status = 'AGUARDANDO'
$$;

-- =====================================================================
-- COMPRAS
-- =====================================================================

-- Fecha a compra gravando a foto calculada pelo sistema
create or replace function public.close_purchase(p_id uuid, p_items jsonb, p_movement_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v purchases;
begin
  perform assert_admin();
  select * into v from purchases where id = p_id for update;
  if not found or v.status <> 'ABERTA' then
    raise exception 'Só é possível fechar uma compra aberta.' using errcode = 'P0001';
  end if;

  insert into purchase_items (
    purchase_id, item_kind, category_code, employee_id, benefit_id, movement_id, registration, employee_name,
    vt_card_number, business_unit_id, business_unit_name, legal_entity_id, legal_entity_name, section_id,
    section_name, operator_id, operator_name, contract_id, contract_name, cost_model, description, days,
    quantity, unit_value, total, notes)
  select p_id, x.item_kind, x.category_code, x.employee_id, x.benefit_id, x.movement_id, x.registration, x.employee_name,
         x.vt_card_number, x.business_unit_id, x.business_unit_name, x.legal_entity_id, x.legal_entity_name, x.section_id,
         x.section_name, x.operator_id, x.operator_name, x.contract_id, x.contract_name, x.cost_model, x.description, x.days,
         x.quantity, x.unit_value, round(x.total, 2), x.notes
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(
      item_kind text, category_code text, employee_id uuid, benefit_id uuid, movement_id uuid, registration text,
      employee_name text, vt_card_number text, business_unit_id uuid, business_unit_name text, legal_entity_id uuid,
      legal_entity_name text, section_id uuid, section_name text, operator_id uuid, operator_name text,
      contract_id uuid, contract_name text, cost_model cost_model, description text, days int,
      quantity numeric, unit_value numeric, total numeric, notes text);

  update movements set status = 'PROCESSADO', purchase_id = p_id
   where id = any(p_movement_ids) and status in ('PENDENTE', 'APROVADO');

  update employees set active = false
   where id in (select employee_id from movements
                 where purchase_id = p_id and type = 'EXCLUSAO_MENSAL' and exclusion_reason = 'DESLIGAMENTO');

  update purchases set status = 'FECHADA', closed_at = now(), closed_by = auth.uid() where id = p_id;
end $$;

create or replace function public.reopen_purchase(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v purchases;
begin
  perform assert_admin();
  if coalesce(trim(p_note), '') = '' then
    raise exception 'Informe o motivo da reabertura.' using errcode = 'P0001';
  end if;
  select * into v from purchases where id = p_id for update;
  if not found or v.status <> 'FECHADA' then
    raise exception 'Só é possível reabrir uma compra fechada e ainda não paga.' using errcode = 'P0001';
  end if;

  update employees set active = true
   where id in (select employee_id from movements
                 where purchase_id = p_id and type = 'EXCLUSAO_MENSAL' and exclusion_reason = 'DESLIGAMENTO');
  update movements
     set status = case when type in ('PEDIDO_COMPLEMENTAR', 'MOVIMENTACAO_CATEGORIA') then 'APROVADO'::movement_status
                       else 'PENDENTE'::movement_status end,
         purchase_id = null
   where purchase_id = p_id;
  delete from purchase_items where purchase_id = p_id;
  update purchases set status = 'ABERTA', closed_at = null, closed_by = null,
         notes = concat_ws(E'\n', notes, 'Reaberta em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ' por ' || current_username() || ': ' || trim(p_note))
   where id = p_id;
end $$;

create or replace function public.mark_purchase_paid(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v purchases;
begin
  perform assert_admin();
  select * into v from purchases where id = p_id for update;
  if not found or v.status <> 'FECHADA' then
    raise exception 'Só uma compra fechada pode ser marcada como paga.' using errcode = 'P0001';
  end if;
  update purchases set status = 'PAGA', paid_at = now(), paid_by = auth.uid() where id = p_id;
end $$;
