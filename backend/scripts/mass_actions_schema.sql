-- Schema de "Acciones masivas" (jobs + job_items).
--
-- Aplicar en el MySQL local (docker compose) y en Cloud SQL:
--   mysql < backend/scripts/mass_actions_schema.sql
-- Idempotente (IF NOT EXISTS). Ver también backend_tables.md (§mass_actions).
--
-- Diseño (backend/docs/mass_actions_plan.md):
--   - Un job = una corrida = (negocio, plataforma, acción, cuenta).
--   - FIFO por cuenta: dispatch atómico inicia el job `queued` más viejo de
--     la cuenta solo si no hay otro `running` en esa cuenta.
--   - job_items = ledger ítem por ítem (pendiente/ok/error/salteado):
--     el progreso y el "reintentar sin duplicar" salen de acá.

CREATE DATABASE IF NOT EXISTS mass_actions
  DEFAULT CHARACTER SET utf8mb4;

USE mass_actions;

CREATE TABLE IF NOT EXISTS mass_actions.jobs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    business_id INT NOT NULL,
    platform VARCHAR(24) NOT NULL,              -- mercadolibre | tiendanube
    action_type VARCHAR(24) NOT NULL,           -- publish|update|pause|delete|link_catalog|unlink_catalog
    account_id INT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'queued', -- queued|running|completed|completed_with_errors|failed|cancelled
    total_items INT NOT NULL DEFAULT 0,
    succeeded INT NOT NULL DEFAULT 0,
    failed INT NOT NULL DEFAULT 0,
    skipped INT NOT NULL DEFAULT 0,
    payload JSON NULL,                          -- criterio de selección / opciones (auditoría)
    created_by INT NULL,                        -- actor (business/employee)
    created_by_role VARCHAR(16) NULL,
    event_id INT NULL,                          -- fila de auditoría en platform_accounts.events
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NULL,
    finished_at TIMESTAMP NULL,
    heartbeat_at TIMESTAMP NULL,                -- lease: lo refresca el worker mientras corre
    error VARCHAR(255) NULL,
    KEY idx_jobs_business (business_id, created_at),
    KEY idx_jobs_account_status (account_id, status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mass_actions.job_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    job_id INT NOT NULL,
    product_id INT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending|running|succeeded|failed|skipped
    attempts INT NOT NULL DEFAULT 0,
    external_id VARCHAR(50) NULL,               -- id en la plataforma tras la acción
    reason TEXT NULL,                           -- mensaje legible (JSON crudo va al log)
    remedy VARCHAR(255) NULL,
    claim_token VARCHAR(32) NULL,               -- lote que claimó el ítem (idempotencia de batches)
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_job_product (job_id, product_id),
    KEY idx_items_job_status (job_id, status),
    KEY idx_items_status_updated (status, updated_at),
    CONSTRAINT fk_jobitems_job FOREIGN KEY (job_id) REFERENCES mass_actions.jobs (id) ON DELETE CASCADE,
    CONSTRAINT fk_jobitems_product FOREIGN KEY (product_id) REFERENCES inventory.products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
