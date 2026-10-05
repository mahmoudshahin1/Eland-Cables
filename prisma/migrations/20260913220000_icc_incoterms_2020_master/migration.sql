-- Load the complete ICC Incoterms 2020 catalog into the existing global Incoterm table.
-- Upserts by unique `code`. Does not delete. Does not recreate CIF/DAP row identity.
-- createdBy/createdAt/id are preserved on conflict; updatedBy is left unchanged for existing rows.

INSERT INTO "Incoterm" (
  "id", "code", "name", "description", "active", "createdAt", "updatedAt", "createdBy", "updatedBy"
) VALUES
  ('incoterm-icc-exw', 'EXW', 'Ex Works', 'ICC Incoterms 2020', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'icc-incoterms-2020-load', 'icc-incoterms-2020-load'),
  ('incoterm-icc-fca', 'FCA', 'Free Carrier', 'ICC Incoterms 2020', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'icc-incoterms-2020-load', 'icc-incoterms-2020-load'),
  ('incoterm-icc-cpt', 'CPT', 'Carriage Paid To', 'ICC Incoterms 2020', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'icc-incoterms-2020-load', 'icc-incoterms-2020-load'),
  ('incoterm-icc-cip', 'CIP', 'Carriage and Insurance Paid To', 'ICC Incoterms 2020', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'icc-incoterms-2020-load', 'icc-incoterms-2020-load'),
  ('incoterm-icc-dap', 'DAP', 'Delivered at Place', 'ICC Incoterms 2020', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'icc-incoterms-2020-load', 'icc-incoterms-2020-load'),
  ('incoterm-icc-dpu', 'DPU', 'Delivered at Place Unloaded', 'ICC Incoterms 2020', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'icc-incoterms-2020-load', 'icc-incoterms-2020-load'),
  ('incoterm-icc-ddp', 'DDP', 'Delivered Duty Paid', 'ICC Incoterms 2020', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'icc-incoterms-2020-load', 'icc-incoterms-2020-load'),
  ('incoterm-icc-fas', 'FAS', 'Free Alongside Ship', 'ICC Incoterms 2020', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'icc-incoterms-2020-load', 'icc-incoterms-2020-load'),
  ('incoterm-icc-fob', 'FOB', 'Free On Board', 'ICC Incoterms 2020', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'icc-incoterms-2020-load', 'icc-incoterms-2020-load'),
  ('incoterm-icc-cfr', 'CFR', 'Cost and Freight', 'ICC Incoterms 2020', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'icc-incoterms-2020-load', 'icc-incoterms-2020-load'),
  ('incoterm-icc-cif', 'CIF', 'Cost, Insurance and Freight', 'ICC Incoterms 2020', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'icc-incoterms-2020-load', 'icc-incoterms-2020-load')
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "active" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP;
