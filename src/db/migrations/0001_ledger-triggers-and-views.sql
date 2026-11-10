-- "today" in the business timezone
CREATE FUNCTION business_today() RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE (SELECT timezone FROM settings WHERE id = 1))::date
$$;
--> statement-breakpoint

-- the ledger is append-only
CREATE FUNCTION forbid_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is append-only';
END $$;
--> statement-breakpoint

CREATE TRIGGER stock_movements_no_update_delete
BEFORE UPDATE OR DELETE ON stock_movements
FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();
--> statement-breakpoint

-- safety net: a batch can never end a transaction below zero
CREATE FUNCTION assert_batch_non_negative() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE total numeric(14,3);
BEGIN
  SELECT coalesce(sum(quantity), 0) INTO total
  FROM stock_movements WHERE batch_id = new.batch_id;
  IF total < 0 THEN
    RAISE EXCEPTION 'batch % would go negative (%)', new.batch_id, total;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER stock_movements_non_negative
AFTER INSERT ON stock_movements
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_batch_non_negative();
--> statement-breakpoint

-- derived stock
CREATE VIEW batch_stock AS
SELECT b.id AS batch_id, b.product_id, b.expiry_date, b.received_at, b.unit_cost,
       coalesce(sum(m.quantity), 0)::numeric(14,3) AS quantity_on_hand
FROM batches b
LEFT JOIN stock_movements m ON m.batch_id = b.id
GROUP BY b.id;
--> statement-breakpoint

CREATE VIEW product_stock AS
SELECT p.id AS product_id,
       coalesce(sum(bs.quantity_on_hand)
         FILTER (WHERE bs.expiry_date IS NULL OR bs.expiry_date >= business_today()), 0) AS usable_quantity,
       coalesce(sum(bs.quantity_on_hand)
         FILTER (WHERE bs.expiry_date < business_today()), 0) AS expired_quantity
FROM products p
LEFT JOIN batch_stock bs ON bs.product_id = p.id AND bs.quantity_on_hand > 0
GROUP BY p.id;
