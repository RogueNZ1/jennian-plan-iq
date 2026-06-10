-- Meeting-spec picker: coded client selections captured at job load.
-- Shape: { v: 2, answers: { spec_id: code }, updatedAt }
-- blank/absent = not answered, 0 = N/A, 1+ = selection (see src/lib/specs/spec-schema.ts)
alter table jobs add column if not exists specifications jsonb;
