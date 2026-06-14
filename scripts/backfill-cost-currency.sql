-- Backfill walutowych kolumn dla istniejących kosztów (PLN brutto)
UPDATE "ImportOrderCost"
SET "amount" = "amountPln",
    "exchangeRate" = 1,
    "isNetto" = false
WHERE "amount" IS NULL;
