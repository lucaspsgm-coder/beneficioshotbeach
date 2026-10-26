-- =====================================================================
-- 0006 · Visões de apoio (respeitam as regras de acesso de quem consulta)
-- =====================================================================
create view purchase_totals with (security_invoker = true) as
  select purchase_id, count(*)::int as items, coalesce(sum(total), 0)::numeric(14,2) as total
    from purchase_items
   group by purchase_id;

grant select on purchase_totals to authenticated;
