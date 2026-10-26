-- =====================================================================
-- 0005 · Apoio: diretório de nomes e carga inicial
-- =====================================================================

-- Nomes dos usuários para exibir "quem fez" em qualquer tela (sem dados sensíveis)
create or replace function public.user_directory()
returns table (id uuid, username text, full_name text)
language sql stable security definer set search_path = public as $$
  select id, username, full_name from profiles
$$;

-- Carga inicial do go-live. Cada linha é gravada de forma independente:
-- as válidas entram, as inválidas voltam com o motivo.
create or replace function public.import_initial_load(p_rows jsonb, p_start date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r       jsonb;
  v_emp   uuid;
  v_mov   uuid;
  v_ben   uuid;
  v_out   jsonb := '[]'::jsonb;
begin
  perform assert_admin();
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      select id into v_emp from employees
       where registration = trim(r->>'registration') and legal_entity_id = (r->>'legal_entity_id')::uuid;

      if v_emp is null then
        insert into employees (registration, full_name, birth_date, admission_date, mother_name, address,
                               business_unit_id, legal_entity_id, section_id, vt_card_number)
        values (trim(r->>'registration'), trim(r->>'full_name'),
                nullif(r->>'birth_date', '')::date, nullif(r->>'admission_date', '')::date,
                nullif(trim(r->>'mother_name'), ''), nullif(trim(r->>'address'), ''),
                (r->>'business_unit_id')::uuid, (r->>'legal_entity_id')::uuid, (r->>'section_id')::uuid,
                nullif(trim(r->>'vt_card_number'), ''))
        returning id into v_emp;
      end if;

      insert into movements (employee_id, business_unit_id, type, status, category_code, vt_fare_id,
                             charter_schedule_id, effective_date, justification)
      values (v_emp, (r->>'business_unit_id')::uuid, 'INCLUSAO_MENSAL', 'PROCESSADO', r->>'category_code',
              nullif(r->>'vt_fare_id', '')::uuid, nullif(r->>'charter_schedule_id', '')::uuid, p_start, 'Carga inicial do go-live')
      returning id into v_mov;

      insert into employee_benefits (employee_id, category_code, group_code, vt_fare_id, charter_schedule_id, start_date, origin_movement_id)
      values (v_emp, r->>'category_code', 'MOBILIDADE', nullif(r->>'vt_fare_id', '')::uuid,
              nullif(r->>'charter_schedule_id', '')::uuid, p_start, v_mov)
      returning id into v_ben;
      update movements set benefit_id = v_ben where id = v_mov;

      v_out := v_out || jsonb_build_object('sheet', r->>'sheet', 'row', r->'row', 'ok', true);
    exception when others then
      v_out := v_out || jsonb_build_object('sheet', r->>'sheet', 'row', r->'row', 'ok', false,
        'error', case when sqlstate = '23505' then 'Registro duplicado.' else sqlerrm end);
    end;
    v_emp := null;
  end loop;

  perform log_event('CARGA_INICIAL', jsonb_build_object(
    'inicio', p_start,
    'linhas', jsonb_array_length(p_rows),
    'importadas', (select count(*) from jsonb_array_elements(v_out) x where (x->>'ok')::boolean)));
  return v_out;
end $$;

revoke execute on function public.user_directory() from public, anon;
revoke execute on function public.import_initial_load(jsonb, date) from public, anon;
grant execute on function public.user_directory() to authenticated;
grant execute on function public.import_initial_load(jsonb, date) to authenticated;
