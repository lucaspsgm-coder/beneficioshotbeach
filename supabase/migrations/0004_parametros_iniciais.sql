-- =====================================================================
-- 0004 · Parâmetros iniciais (editáveis depois na tela de Parâmetros)
-- =====================================================================
insert into benefit_groups (code, name, max_active)
values ('MOBILIDADE', 'Mobilidade', 1);

insert into benefit_categories (code, name, group_code, base_days, passes_per_day, admission_proportional)
values
  ('VT',      'Vale-transporte', 'MOBILIDADE', 26, 2, true),
  ('FRETADO', 'Fretado',         'MOBILIDADE', 26, 0, false);
