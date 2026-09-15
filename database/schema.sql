-- AI Document Comparison Assistant — database schema
-- Run this once against an empty database, e.g.:
--   mysql -u root -p doccompare < database/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- A comparison run across N documents. Created once /api/comparisons
-- finishes; documents.comparison_id below links back to this row instead
-- of needing a separate join table, since in this app a document belongs
-- to at most one comparison.
CREATE TABLE IF NOT EXISTS comparisons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  documents_reviewed INT NOT NULL,
  fields_checked INT NOT NULL,
  matches INT NOT NULL,
  warnings INT NOT NULL,
  errors INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comparisons_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Metadata only — deliberately no column for raw file content or full
-- extracted text, per "do not store sensitive document content
-- unnecessarily." The parsed field values live in document_fields below.
CREATE TABLE IF NOT EXISTS documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  comparison_id INT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(150) NULL,
  extension VARCHAR(10) NULL,
  size_bytes INT NULL,
  extraction_status ENUM('ok', 'error', 'unsupported') NOT NULL DEFAULT 'ok',
  extraction_error TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_documents_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_documents_comparison
    FOREIGN KEY (comparison_id) REFERENCES comparisons(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- One row per extracted field. line_item_index is NULL for a document-level
-- field (invoice number, supplier, ...) and 0/1/2/... for a line item's
-- field (description, quantity, ...), matching StructuredDocument's shape.
CREATE TABLE IF NOT EXISTS document_fields (
  id INT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  line_item_index INT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_value TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_document_fields_document
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  INDEX idx_document_fields_document (document_id)
) ENGINE=InnoDB;

-- One row per compared field or calculation check within a comparison.
-- `values_json` holds one value per document (in document order) for
-- field comparisons; expected_value/actual_value are used instead for
-- calculation checks. This single flexible table covers both cases rather
-- than needing two near-identical tables.
CREATE TABLE IF NOT EXISTS comparison_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  comparison_id INT NOT NULL,
  scope ENUM('documentField', 'lineItem', 'calculation') NOT NULL,
  line_item_index INT NULL,
  field_name VARCHAR(150) NOT NULL,
  status ENUM('match', 'mismatch', 'semantic-match', 'warning') NOT NULL,
  values_json JSON NULL,
  difference VARCHAR(50) NULL,
  ai_explanation TEXT NULL,
  document_index INT NULL,
  expected_value DECIMAL(14, 2) NULL,
  actual_value DECIMAL(14, 2) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comparison_results_comparison
    FOREIGN KEY (comparison_id) REFERENCES comparisons(id) ON DELETE CASCADE,
  INDEX idx_comparison_results_comparison (comparison_id)
) ENGINE=InnoDB;
