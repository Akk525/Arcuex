CREATE TRIGGER procurement_records_immutable_update BEFORE UPDATE ON procurement_records BEGIN SELECT RAISE(ABORT, 'Procurement records are immutable'); END;
CREATE TRIGGER procurement_records_immutable_delete BEFORE DELETE ON procurement_records BEGIN SELECT RAISE(ABORT, 'Procurement records are immutable'); END;
CREATE TRIGGER procurement_policy_immutable_terms BEFORE UPDATE OF id, owner, quote_id, payload ON procurement_policies BEGIN SELECT RAISE(ABORT, 'Policy terms are immutable'); END;
CREATE TRIGGER procurement_policy_immutable_receipt BEFORE UPDATE OF bind_tx, confirmed_at ON procurement_policies WHEN OLD.bind_tx IS NOT NULL BEGIN SELECT RAISE(ABORT, 'Confirmed receipt is immutable'); END;
CREATE TRIGGER procurement_policy_immutable_delete BEFORE DELETE ON procurement_policies BEGIN SELECT RAISE(ABORT, 'Policy records are immutable'); END;
