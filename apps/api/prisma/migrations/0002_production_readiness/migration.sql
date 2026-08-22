ALTER TABLE doctor_documents
  ADD COLUMN file_name text,
  ADD COLUMN content_type text,
  ADD COLUMN size_bytes integer,
  ADD COLUMN uploaded_at timestamptz;

CREATE UNIQUE INDEX doctor_documents_storage_key_unique ON doctor_documents(storage_key);

ALTER TABLE doctor_documents
  ADD CONSTRAINT doctor_documents_size_positive CHECK (size_bytes IS NULL OR size_bytes > 0);

ALTER TABLE appointment_status_history ADD COLUMN request_key text;
CREATE UNIQUE INDEX appointment_status_history_request_key_unique ON appointment_status_history(request_key);
