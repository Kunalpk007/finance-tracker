-- Event expenses: custom category label, per-expense split and multi-payer breakdown.
alter table trip_expenses
  add column category_label text,
  add column split_among jsonb,
  add column payments jsonb;
