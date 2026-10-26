-- =====================================================================
-- 0003 · Segurança (RLS)
-- Admin: tudo. RH da unidade: lê os dados da própria unidade e os
-- cadastros de configuração; grava apenas pelas funções de fluxo.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'business_units','legal_entities','sections','profiles','benefit_groups',
    'benefit_categories','operators','vt_fares','charter_contracts',
    'charter_subsidies','charter_routes','charter_schedules','employees',
    'employee_benefits','calendar_months','purchases','movements','waitlist',
    'purchase_items','audit_log'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Cadastros de configuração: todos leem, só o admin grava
do $$
declare t text;
begin
  foreach t in array array[
    'business_units','legal_entities','sections','benefit_groups','benefit_categories',
    'operators','vt_fares','charter_contracts','charter_subsidies','charter_routes',
    'charter_schedules','calendar_months'
  ] loop
    execute format('create policy leitura on %I for select to authenticated using (true)', t);
    execute format('create policy admin_grava on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- Perfis: cada um vê o seu; admin vê e edita todos
create policy leitura_propria on profiles for select to authenticated using (id = auth.uid() or is_admin());
create policy admin_grava on profiles for all to authenticated using (is_admin()) with check (is_admin());

-- Dados da operação: RH lê a própria unidade; escrita só do admin (o RH usa as funções)
create policy leitura_unidade on employees for select to authenticated
  using (is_admin() or business_unit_id = my_unit());
create policy admin_grava on employees for all to authenticated using (is_admin()) with check (is_admin());

create policy leitura_unidade on employee_benefits for select to authenticated
  using (is_admin() or exists (select 1 from employees e where e.id = employee_id and e.business_unit_id = my_unit()));
create policy admin_grava on employee_benefits for all to authenticated using (is_admin()) with check (is_admin());

create policy leitura_unidade on movements for select to authenticated
  using (is_admin() or business_unit_id = my_unit());
create policy admin_grava on movements for all to authenticated using (is_admin()) with check (is_admin());

create policy leitura_unidade on waitlist for select to authenticated
  using (is_admin() or business_unit_id = my_unit());
create policy admin_grava on waitlist for all to authenticated using (is_admin()) with check (is_admin());

-- Compras e auditoria: só o admin
create policy admin_tudo on purchases for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_tudo on purchase_items for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_le on audit_log for select to authenticated using (is_admin());
-- (audit_log não tem política de escrita: só as funções do sistema gravam)

-- Funções: nada para anônimos
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
