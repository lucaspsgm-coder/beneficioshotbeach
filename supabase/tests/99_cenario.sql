\set ON_ERROR_STOP 1
\set QUIET 1
-- usuários
insert into auth.users values ('00000000-0000-0000-0000-00000000000a','admin@x'),('00000000-0000-0000-0000-00000000000b','rh@x');
insert into business_units (id,name) values ('10000000-0000-0000-0000-000000000001','HBS'),('10000000-0000-0000-0000-000000000002','OUTRA');
insert into profiles (id,username,full_name,role) values ('00000000-0000-0000-0000-00000000000a','lucas.pereira','Lucas Pereira','ADMIN');
insert into profiles (id,username,full_name,role,business_unit_id) values ('00000000-0000-0000-0000-00000000000b','rh.hbs','RH HBS','RH_UNIT','10000000-0000-0000-0000-000000000001');

-- ===== como ADMIN: cadastros =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into legal_entities (id,business_unit_id,name) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','HB Tour HBS'),('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','OUTRA LTDA');
insert into sections (id,legal_entity_id,name) values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Recepção'),('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','Geral');
insert into operators (id,category_code,name) values ('40000000-0000-0000-0000-000000000001','VT','Viação VT'),('40000000-0000-0000-0000-000000000002','FRETADO','Fretado Um');
insert into vt_fares (id,operator_id,line_name,destination,fare) values ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Olímpia × Cidade F','Cidade B',8.50);
insert into charter_contracts (id,operator_id,name,cost_model,monthly_value) values ('60000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','Contrato X','FECHADO',30000);
insert into charter_routes (id,contract_id,name) values ('70000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','Cidade A × Cidade B');
insert into charter_schedules (id,route_id,arrival_time,departure_time,seats) values
 ('80000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','08h20','16h20',1),
 ('80000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001','10h20','18h40',5);
insert into calendar_months (reference_month,window_open,window_close,cutoff_date,approval_date)
 values (first_of_next_month(today_br()), today_br()-5, today_br()+5, today_br()+2, today_br()+2);
-- admin cria colaborador de outra unidade
insert into employees (registration,full_name,business_unit_id,legal_entity_id,section_id) values ('000001','Fulano Outra','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002');

-- ===== como RH =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
\echo '--- RH vê só a própria unidade (esperado 0 da OUTRA):'
select count(*) as outra from employees where business_unit_id='10000000-0000-0000-0000-000000000002';

\echo '--- RH não grava direto (esperado erro RLS):'
\set ON_ERROR_STOP 0
insert into employees (registration,full_name,business_unit_id,legal_entity_id,section_id) values ('9','x','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');
\set ON_ERROR_STOP 1

\echo '--- Admissão VT:'
select submit_inclusion(jsonb_build_object('type','INCLUSAO_ADMISSIONAL','category_code','VT','vt_fare_id','50000000-0000-0000-0000-000000000001',
 'employee', jsonb_build_object('registration','001420','full_name','Maria','admission_date',today_br()::text,'business_unit_id','10000000-0000-0000-0000-000000000001','legal_entity_id','20000000-0000-0000-0000-000000000001','section_id','30000000-0000-0000-0000-000000000001'))) is not null as ok;
select registration from employees where registration='001420';

\echo '--- Admissão fretado no horário de 1 assento:'
select submit_inclusion(jsonb_build_object('type','INCLUSAO_ADMISSIONAL','category_code','FRETADO','charter_schedule_id','80000000-0000-0000-0000-000000000001',
 'employee', jsonb_build_object('registration','002','full_name','João','admission_date',today_br()::text,'business_unit_id','10000000-0000-0000-0000-000000000001','legal_entity_id','20000000-0000-0000-0000-000000000001','section_id','30000000-0000-0000-0000-000000000001'))) is not null as ok;

\echo '--- Segunda pessoa no mesmo horário (esperado SEM_VAGA):'
\set ON_ERROR_STOP 0
select submit_inclusion(jsonb_build_object('type','INCLUSAO_ADMISSIONAL','category_code','FRETADO','charter_schedule_id','80000000-0000-0000-0000-000000000001',
 'employee', jsonb_build_object('registration','003','full_name','Ana','admission_date',today_br()::text,'business_unit_id','10000000-0000-0000-0000-000000000001','legal_entity_id','20000000-0000-0000-0000-000000000001','section_id','30000000-0000-0000-0000-000000000001')));
\set ON_ERROR_STOP 1
select count(*) as ana_nao_criada from employees where registration='003';

\echo '--- Ana entra no VT + fila do horário lotado:'
select submit_inclusion(jsonb_build_object('type','INCLUSAO_ADMISSIONAL','category_code','VT','vt_fare_id','50000000-0000-0000-0000-000000000001','waitlist_schedule_id','80000000-0000-0000-0000-000000000001',
 'employee', jsonb_build_object('registration','003','full_name','Ana','admission_date',today_br()::text,'business_unit_id','10000000-0000-0000-0000-000000000001','legal_entity_id','20000000-0000-0000-0000-000000000001','section_id','30000000-0000-0000-0000-000000000001'))) is not null as ok;
select w.status, p.queue_position from waitlist w join waitlist_positions() p on p.waitlist_id=w.id;

\echo '--- Benefício único: inclusão mensal para quem já tem (esperado erro):'
\set ON_ERROR_STOP 0
select submit_inclusion(jsonb_build_object('type','INCLUSAO_MENSAL','category_code','FRETADO','charter_schedule_id','80000000-0000-0000-0000-000000000002','employee_id',(select id from employees where registration='001420')::text));
\set ON_ERROR_STOP 1

\echo '--- Maria pede troca para horário 10h20 (vaga):'
select submit_category_change((select id from employees where registration='001420'),'FRETADO',null,'80000000-0000-0000-0000-000000000002','turno') is not null as ok;
select type,status from movements where employee_id=(select id from employees where registration='001420') order by created_at;

\echo '--- Troca de horário mesma rota (João 08h20 -> 10h20):'
select submit_schedule_swap((select id from employees where registration='002'),'80000000-0000-0000-0000-000000000002','turno noite') is not null as ok;

\echo '--- RH tenta aprovar (esperado SEM_PERMISSAO):'
\set ON_ERROR_STOP 0
select approve_movement((select id from movements where type='TROCA_HORARIO'));
\set ON_ERROR_STOP 1

-- ===== ADMIN aprova =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
\echo '--- Admin aprova troca de horário (vale hoje) e a de categoria (vale mês que vem):'
select approve_movement((select id from movements where type='TROCA_HORARIO'),'ok');
select approve_movement((select id from movements where type='MOVIMENTACAO_CATEGORIA'),'ok');
select e.registration, b.category_code, b.start_date - today_br() as inicio_rel, b.end_date - today_br() as fim_rel, b.canceled
  from employee_benefits b join employees e on e.id=b.employee_id order by e.registration, b.created_at;

\echo '--- Agora horário 08h20 está livre a partir de hoje: aprovar fila da Ana:'
select approve_waitlist((select id from waitlist where status='AGUARDANDO'),'vaga liberada');
select e.registration, b.category_code, b.start_date - today_br() as inicio_rel, b.end_date - today_br() as fim_rel from employee_benefits b join employees e on e.id=b.employee_id where e.registration='003' order by b.created_at;

-- ===== RH exclui por desligamento e cancela =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
\echo '--- Exclusão (desligamento) do João e cancelamento:'
select submit_exclusion((select id from employees where registration='002'),'DESLIGAMENTO','saiu') is not null as ok;
select end_date - today_br() as fim_rel from employee_benefits where employee_id=(select id from employees where registration='002') and not canceled order by created_at desc limit 1;
select cancel_movement((select id from movements where type='EXCLUSAO_MENSAL'),'erro');
select end_date from employee_benefits where employee_id=(select id from employees where registration='002') and not canceled order by created_at desc limit 1;

\echo '--- Alteração cadastral:'
select submit_employee_update((select id from employees where registration='001420'),'{"address":"Rua Nova, 10","full_name":"Maria Silva"}'::jsonb,'mudou') is not null as ok;
select changes from movements where type='ALTERACAO_CADASTRAL';

-- ===== auditoria =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
\echo '--- Auditoria por usuário:'
select username, action, count(*) from audit_log group by 1,2 order by 1,2;
\echo '--- Disponibilidade:'
select a.seats, a.taken from schedule_availability() a order by seats;
\echo '--- Fechar compra vazia e reabrir:'
insert into purchases (id,kind,reference_month) values ('90000000-0000-0000-0000-000000000001','MENSAL',first_of_next_month(today_br()));
select close_purchase('90000000-0000-0000-0000-000000000001','[{"item_kind":"NORMAL","category_code":"VT","total":10.555,"quantity":2,"cost_model":null}]'::jsonb, array(select id from movements where status in ('PENDENTE','APROVADO')));
select status, closed_by is not null as quem from purchases;
select count(*) processados from movements where purchase_id is not null;
select reopen_purchase('90000000-0000-0000-0000-000000000001','teste');
select status, (select count(*) from purchase_items) itens from purchases;
