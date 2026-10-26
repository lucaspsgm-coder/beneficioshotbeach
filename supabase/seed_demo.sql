-- =====================================================================
-- Dados de exemplo (opcional) para testar o sistema antes do go-live.
-- Rode DEPOIS das migrations, no SQL Editor do Supabase.
-- Apague depois com o bloco "LIMPEZA" no fim do arquivo.
-- =====================================================================
insert into business_units (id, name) values
  ('a0000000-0000-0000-0000-000000000001', 'HBS'),
  ('a0000000-0000-0000-0000-000000000002', 'Hot Beach Parques');
insert into legal_entities (id, business_unit_id, name, cnpj) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'COND HBS', null),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'HB Tour HBS', null),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'FIBRA HB TOUR', null);
insert into sections (legal_entity_id, name) values
  ('b0000000-0000-0000-0000-000000000001', 'Recepção'),
  ('b0000000-0000-0000-0000-000000000001', 'Governança'),
  ('b0000000-0000-0000-0000-000000000002', 'Operações'),
  ('b0000000-0000-0000-0000-000000000003', 'Operações'),
  ('b0000000-0000-0000-0000-000000000003', 'Alimentos e bebidas');

insert into operators (id, category_code, name) values
  ('c0000000-0000-0000-0000-000000000001', 'VT', 'Viação Exemplo 1'),
  ('c0000000-0000-0000-0000-000000000002', 'VT', 'Viação Exemplo 2');
insert into operators (id, category_code, name, entry_billing) values
  ('c0000000-0000-0000-0000-000000000003', 'FRETADO', 'Fretado Exemplo A', 'MES_CHEIO'),
  ('c0000000-0000-0000-0000-000000000004', 'FRETADO', 'Fretado Exemplo B', 'PROPORCIONAL');

insert into vt_fares (operator_id, line_name, origin, destination, fare) values
  ('c0000000-0000-0000-0000-000000000001', 'Olímpia × Cidade F', 'Olímpia', 'Cidade B', 8.50),
  ('c0000000-0000-0000-0000-000000000001', 'Olímpia × Cidade F', 'Olímpia', 'Cidade F', 12.40),
  ('c0000000-0000-0000-0000-000000000002', 'Olímpia × Cidade C', 'Olímpia', 'Cidade C', 6.90);

insert into charter_contracts (id, operator_id, name, cost_model, monthly_value) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'Contrato fechado 4 rotas', 'MISTO', 30000),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004', 'Por assento 2026', 'POR_ASSENTO', null);
insert into charter_subsidies (contract_id, business_unit_id, subsidy_type, value, joins_rateio) values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'VALOR', 10000, true);
insert into charter_routes (id, contract_id, name, seat_price) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Cidade A × Cidade B', null),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'Cidade D × Olímpia', null),
  ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', 'Cidade E × Olímpia', 380.00);
insert into charter_schedules (route_id, arrival_time, departure_time, seats) values
  ('e0000000-0000-0000-0000-000000000001', '08h20', '16h20', 40),
  ('e0000000-0000-0000-0000-000000000001', '10h20', '18h40', 4),
  ('e0000000-0000-0000-0000-000000000002', '06h50', '15h10', 30),
  ('e0000000-0000-0000-0000-000000000003', '07h30', '17h30', null);

-- Calendário: janela aberta agora, para a compra do mês que vem
insert into calendar_months (reference_month, window_open, window_close, cutoff_date, approval_date)
values (first_of_next_month(today_br()), date_trunc('month', today_br())::date, first_of_next_month(today_br()) - 1,
        least(date_trunc('month', today_br())::date + 19, first_of_next_month(today_br()) - 1),
        least(date_trunc('month', today_br())::date + 19, first_of_next_month(today_br()) - 1));

-- LIMPEZA (descomente para apagar os dados de exemplo)
-- delete from calendar_months; delete from charter_schedules; delete from charter_routes; delete from charter_subsidies;
-- delete from charter_contracts; delete from vt_fares; delete from operators;
-- delete from sections; delete from legal_entities; delete from business_units;
