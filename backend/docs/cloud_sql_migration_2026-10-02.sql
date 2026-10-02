-- Migración Cloud SQL (instance: nicoservertest:us-south1:new-test-2)
-- Generada el 02/10/2026 comparando el esquema REAL de Cloud SQL contra
-- backend/backend_tables.md (esquema esperado del repo).
-- Verificado: sin filas en mercadolibre.size_grid y sin duplicados en
-- platform_accounts.accounts(business_id, platform) antes de aplicar.

-- 1) Guía de talles: nueva tabla de cache (reemplaza a la vieja size_grid)
CREATE TABLE mercadolibre.size_grids (
    id INT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    domain_id VARCHAR(50) NOT NULL,
    brand VARCHAR(255) NOT NULL,
    gender VARCHAR(50) NOT NULL,
    meli_grid_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES platform_accounts.accounts(id) ON DELETE CASCADE,
    UNIQUE KEY uq_size_grids (account_id, domain_id, brand, gender)
);

-- 2) La tabla vieja ya no se usa (0 filas verificadas en cloud)
DROP TABLE mercadolibre.size_grid;

-- 3) attributes.category_options quedó deprecado (se eliminó del código)
ALTER TABLE mercadolibre.attributes DROP COLUMN category_options;

-- 4) Panel de ventas: columnas normalizadas de órdenes (ML)
ALTER TABLE mercadolibre.orders
    ADD COLUMN channel_status VARCHAR(50) NULL,
    ADD COLUMN status_history JSON NULL,
    ADD COLUMN buyer_name VARCHAR(255) NULL,
    ADD COLUMN buyer_external_id VARCHAR(50) NULL,
    ADD COLUMN total DECIMAL(12,2) NULL,
    ADD COLUMN currency VARCHAR(5) NULL,
    ADD COLUMN date_created TIMESTAMP NULL,
    ADD COLUMN link TEXT NULL;

-- 5) Panel de ventas: columnas normalizadas de órdenes (Tienda Nube)
ALTER TABLE tiendanube.orders
    ADD COLUMN channel_status VARCHAR(50) NULL,
    ADD COLUMN payment_status VARCHAR(50) NULL,
    ADD COLUMN status_history JSON NULL,
    ADD COLUMN buyer_name VARCHAR(255) NULL,
    ADD COLUMN buyer_external_id VARCHAR(50) NULL,
    ADD COLUMN total DECIMAL(12,2) NULL,
    ADD COLUMN currency VARCHAR(5) NULL,
    ADD COLUMN date_created TIMESTAMP NULL,
    ADD COLUMN link TEXT NULL;

-- 6) Cuentas: única por (business_id, platform) — documentada en el repo,
--    sin duplicados hoy (verificado), segura de aplicar.
ALTER TABLE platform_accounts.accounts
    ADD UNIQUE KEY uq_account_business_platform (business_id, platform);
