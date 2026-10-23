-- Record initial snapshots explicitly, including observations collected before the flag existed.
UPDATE observations o SET payload=jsonb_set(o.payload,'{baseline}','true'::jsonb)
WHERE o.observed_at <= (SELECT min(c.checked_at) FROM collection_checks c WHERE c.company_id=o.company_id AND c.source=o.source AND c.board_slug=o.board_slug AND c.status='success');
