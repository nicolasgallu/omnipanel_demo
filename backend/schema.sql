-- ============================================================
-- Omnipanel — esquema completo de la base de datos
-- Para Cloud SQL MySQL 8 (instancia: nicoservertest:us-south1:new-test-2)
--
-- Un solo script idempotente: crea las 5 bases/schemas y todas las
-- tablas que usa el backend. Correr con:
--   mysql -h <ip> -u nicolas -p < backend/schema.sql
--
-- Fuente de verdad: backend/backend_tables.md + código en backend/app/.
-- ============================================================

-- ============================================================
-- SCHEMAS (en MySQL cada schema es una base de datos)
-- ============================================================
CREATE SCHEMA IF NOT EXISTS platform_accounts;
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS mercadolibre;
CREATE SCHEMA IF NOT EXISTS tiendanube;
CREATE SCHEMA IF NOT EXISTS ai;

-- ============================================================
-- SCHEMA: platform_accounts
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_accounts.businesses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    config JSON NULL,
    webhook_secret VARCHAR(64) NULL,
    -- Desactivación estricta (panel de plataforma): bloquea login, tokens y webhooks.
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_accounts.admins (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_accounts.employees (
    id INT PRIMARY KEY AUTO_INCREMENT,
    business_id INT NOT NULL,
    email VARCHAR(255) NULL,
    password VARCHAR(255) NULL,
    full_name VARCHAR(255) NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES platform_accounts.businesses(id) ON DELETE CASCADE,
    UNIQUE KEY uq_employee_email (business_id, email)
);

CREATE TABLE IF NOT EXISTS platform_accounts.accounts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    business_id INT NOT NULL,
    platform VARCHAR(100) NOT NULL,
    -- NULL hasta que se complete el OAuth (el panel de plataforma crea la
    -- cuenta "pendiente de conexión" antes de conocer el id/URL).
    external_account_id VARCHAR(100) NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES platform_accounts.businesses(id) ON DELETE CASCADE,
    UNIQUE KEY uq_account_platform_external (platform, external_account_id),
    -- Regla de negocio: UNA cuenta por plataforma por business.
    UNIQUE KEY uq_account_business_platform (business_id, platform),
    INDEX idx_business_id (business_id),
    CONSTRAINT chk_platform CHECK (platform IN ('mercadolibre', 'tiendanube'))
);

CREATE TABLE IF NOT EXISTS platform_accounts.credentials (
    id INT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    client_id VARCHAR(255) NULL,
    client_secret VARCHAR(255) NULL,
    access_token TEXT NULL,
    refresh_token TEXT NULL,
    code VARCHAR(255) NULL,
    url TEXT NULL,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES platform_accounts.accounts(id) ON DELETE CASCADE,
    UNIQUE KEY uq_credentials_account (account_id)
);

CREATE TABLE IF NOT EXISTS platform_accounts.events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    source VARCHAR(32) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    payload JSON NULL,
    -- quién hizo el cambio: businesses.id o employees.id según actor_role.
    -- NULL en eventos de sistema (orders, item status).
    actor_id INT NULL,
    actor_role VARCHAR(16) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES platform_accounts.accounts(id) ON DELETE CASCADE,
    UNIQUE KEY uq_event_dedup (account_id, source, event_type, external_id),
    CONSTRAINT chk_actor_role CHECK (actor_role IN ('business', 'employee'))
);

CREATE TABLE IF NOT EXISTS platform_accounts.support_tickets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    business_id INT NOT NULL,
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'open',
    priority VARCHAR(16) NOT NULL DEFAULT 'normal',
    closed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES platform_accounts.businesses(id) ON DELETE CASCADE,
    INDEX idx_tickets_business_status (business_id, status),
    CONSTRAINT chk_ticket_status CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    CONSTRAINT chk_ticket_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent'))
);

-- ============================================================
-- SCHEMA: inventory
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory.products (
    id INT PRIMARY KEY AUTO_INCREMENT,
    business_id INT NOT NULL,
    internal_code VARCHAR(255),
    sku VARCHAR(255),
    gtin VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    name_edited VARCHAR(255) NULL,
    description TEXT,
    category VARCHAR(255),
    brand VARCHAR(255),
    model VARCHAR(255),
    price DECIMAL(10,2) DEFAULT 0,
    cost DECIMAL(10,2) DEFAULT 0,
    stock INT DEFAULT 0,
    dimensions VARCHAR(50),
    drive_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES platform_accounts.businesses(id) ON DELETE CASCADE,
    UNIQUE KEY uq_business_internal_code (business_id, internal_code),
    UNIQUE KEY uq_business_sku (business_id, sku),
    UNIQUE KEY uq_business_gtin (business_id, gtin),
    INDEX idx_business_id (business_id)
);

CREATE TABLE IF NOT EXISTS inventory.product_images (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES inventory.products(id) ON DELETE CASCADE,
    INDEX idx_product_id (product_id)
);

CREATE TABLE IF NOT EXISTS inventory.product_variations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    sku VARCHAR(255) NULL,
    gtin VARCHAR(255) NULL,
    price DECIMAL(10,2) NULL,
    cost DECIMAL(10,2) NULL,
    stock INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES inventory.products(id) ON DELETE CASCADE,
    INDEX idx_product_id (product_id)
);

-- guard anti doble posteo: una fila por (order, product, direction)
CREATE TABLE IF NOT EXISTS inventory.stock_movements (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    order_id VARCHAR(255) NOT NULL,
    product_id INT NOT NULL,
    direction VARCHAR(8) NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(12,2) NULL,
    target_system VARCHAR(30) NULL,
    provider_doc_id VARCHAR(255) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'attempting',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES platform_accounts.accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES inventory.products(id) ON DELETE CASCADE,
    UNIQUE KEY uq_stock_dedup (account_id, order_id, product_id, direction),
    CONSTRAINT chk_target_system CHECK (target_system IN ('bitcram'))
);

-- ============================================================
-- SCHEMA: mercadolibre
-- ============================================================

CREATE TABLE IF NOT EXISTS mercadolibre.product_listings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    account_id INT NOT NULL,
    meli_id VARCHAR(50) NULL,
    price INT NULL,
    price_manually_changed BOOLEAN NULL,
    price_updated_at TIMESTAMP NULL,
    status VARCHAR(100) NULL,
    reason TEXT NULL,
    remedy VARCHAR(255) NULL,
    permalink TEXT NULL,
    -- Catálogo (opt-in/opt-out): producto estándar al que está atada la
    -- publicación + la publicación tradicional "sombra" (si existe).
    catalog_product_id VARCHAR(50) NULL,
    marketplace_item_id VARCHAR(50) NULL,
    marketplace_status VARCHAR(100) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES inventory.products(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES platform_accounts.accounts(id) ON DELETE CASCADE,
    UNIQUE KEY uq_listing_product (product_id),
    UNIQUE KEY uq_listing_meli_id (account_id, meli_id)
);

CREATE TABLE IF NOT EXISTS mercadolibre.selling_costs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_listing_id INT NOT NULL,
    price DECIMAL(12,2) NOT NULL,
    sale_fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    sale_fixed_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
    financing_add_on_fee DECIMAL(6,2) NOT NULL DEFAULT 0,
    meli_percentage_fee DECIMAL(6,2) NOT NULL DEFAULT 0,
    percentage_fee DECIMAL(6,2) NOT NULL DEFAULT 0,
    gross_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    listing_fixed_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
    listing_gross_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    fee_tax DECIMAL(6,2) NOT NULL DEFAULT 0,
    ship_list_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
    ship_discount_rate DECIMAL(6,2) NOT NULL DEFAULT 0,
    ship_promoted_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_selling_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_selling_cost_with_tax DECIMAL(12,2) NOT NULL DEFAULT 0,
    api_payload JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_listing_id) REFERENCES mercadolibre.product_listings(id) ON DELETE CASCADE,
    UNIQUE KEY uq_costs_listing (product_listing_id)
);

CREATE TABLE IF NOT EXISTS mercadolibre.performance (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_listing_id INT NOT NULL,
    entity_type VARCHAR(50) DEFAULT NULL,
    score TINYINT DEFAULT NULL,
    level VARCHAR(50) DEFAULT NULL,
    level_wording VARCHAR(50) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    buckets JSON DEFAULT NULL,
    FOREIGN KEY (product_listing_id) REFERENCES mercadolibre.product_listings(id) ON DELETE CASCADE,
    UNIQUE KEY uq_performance_listing (product_listing_id)
);

CREATE TABLE IF NOT EXISTS mercadolibre.variation_listings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_variation_id INT NOT NULL,
    product_listing_id INT NOT NULL,
    meli_id VARCHAR(50) NULL,
    price DECIMAL(10,2) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_variation_id) REFERENCES inventory.product_variations(id) ON DELETE CASCADE,
    FOREIGN KEY (product_listing_id) REFERENCES mercadolibre.product_listings(id) ON DELETE CASCADE,
    UNIQUE KEY uq_product_variation_listing (product_variation_id, product_listing_id),
    INDEX idx_product_listing_id (product_listing_id),
    INDEX idx_product_variation_id (product_variation_id)
);

CREATE TABLE IF NOT EXISTS mercadolibre.attributes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_listing_id INT NOT NULL,
    category_id VARCHAR(50) DEFAULT NULL,
    empty_gtin_reason_required TINYINT(1) DEFAULT 0,
    empty_gtin_reason INT DEFAULT 17055160,
    buying_mode VARCHAR(50) DEFAULT 'buy_it_now',
    condition_type VARCHAR(50) DEFAULT 'new',
    currency_id VARCHAR(5) DEFAULT 'ARS',
    category_options JSON DEFAULT NULL,
    settings JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_listing_id) REFERENCES mercadolibre.product_listings(id) ON DELETE CASCADE,
    UNIQUE KEY uq_attributes_listing (product_listing_id)
);

CREATE TABLE IF NOT EXISTS mercadolibre.size_grid (
    id INT PRIMARY KEY AUTO_INCREMENT,
    attribute_id INT NOT NULL,
    size_grid_id BIGINT DEFAULT NULL,
    settings JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (attribute_id) REFERENCES mercadolibre.attributes(id) ON DELETE CASCADE,
    UNIQUE KEY uq_size_grid_attribute (attribute_id)
);

CREATE TABLE IF NOT EXISTS mercadolibre.orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id VARCHAR(255) NOT NULL,
    account_id INT NOT NULL,
    status VARCHAR(50) NULL,
    data JSON DEFAULT NULL,
    pack_id VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES platform_accounts.accounts(id) ON DELETE CASCADE,
    UNIQUE KEY uq_order_account (account_id, order_id)
);

-- ============================================================
-- Webhook events de MercadoLibre (proyecciones planas).
-- El stream crudo vive en platform_accounts.events con
-- source='mercadolibre', event_type=topic, external_id=_id de la
-- notificación. Estas tablas guardan el estado ACTUAL por entidad
-- (upsert idempotente por unique key) para el front.
-- ============================================================

CREATE TABLE IF NOT EXISTS mercadolibre.messages (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    kind VARCHAR(16) NOT NULL,                 -- 'question' | 'message'
    external_id VARCHAR(255) NOT NULL,         -- message id / question id
    item_id VARCHAR(50) NULL,
    order_id VARCHAR(255) NULL,
    from_user_id VARCHAR(20) NULL,
    to_user_id VARCHAR(20) NULL,
    status VARCHAR(50) NULL,
    data JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES platform_accounts.accounts(id) ON DELETE CASCADE,
    UNIQUE KEY uq_messages_account_kind_external (account_id, kind, external_id),
    INDEX idx_messages_account_created (account_id, created_at)
);

CREATE TABLE IF NOT EXISTS mercadolibre.price_suggestions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    item_id VARCHAR(50) NOT NULL,              -- meli_id (link a product_listings)
    current_price DECIMAL(12,2) NULL,
    suggested_price DECIMAL(12,2) NULL,
    status VARCHAR(50) NULL,
    data JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES platform_accounts.accounts(id) ON DELETE CASCADE,
    UNIQUE KEY uq_price_suggestions_account_item (account_id, item_id)
);

CREATE TABLE IF NOT EXISTS mercadolibre.shipments (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    external_id VARCHAR(255) NOT NULL,         -- shipment id
    order_id VARCHAR(255) NULL,
    status VARCHAR(50) NULL,
    data JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES platform_accounts.accounts(id) ON DELETE CASCADE,
    UNIQUE KEY uq_shipments_account_external (account_id, external_id),
    INDEX idx_shipments_account_order (account_id, order_id)
);

CREATE TABLE IF NOT EXISTS mercadolibre.promotions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    kind VARCHAR(16) NOT NULL,                 -- 'offer' | 'candidate'
    external_id VARCHAR(255) NOT NULL,
    item_id VARCHAR(50) NULL,
    status VARCHAR(50) NULL,
    data JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES platform_accounts.accounts(id) ON DELETE CASCADE,
    UNIQUE KEY uq_promotions_account_kind_external (account_id, kind, external_id)
);

CREATE TABLE IF NOT EXISTS mercadolibre.claims (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    external_id VARCHAR(255) NOT NULL,         -- post-purchase claim id
    order_id VARCHAR(255) NULL,
    status VARCHAR(50) NULL,
    data JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES platform_accounts.accounts(id) ON DELETE CASCADE,
    UNIQUE KEY uq_claims_account_external (account_id, external_id)
);

CREATE TABLE IF NOT EXISTS mercadolibre.payments (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    external_id VARCHAR(255) NOT NULL,         -- collection id
    order_id VARCHAR(255) NULL,
    status VARCHAR(50) NULL,
    amount DECIMAL(12,2) NULL,
    currency_id VARCHAR(5) NULL,
    data JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES platform_accounts.accounts(id) ON DELETE CASCADE,
    UNIQUE KEY uq_payments_account_external (account_id, external_id),
    INDEX idx_payments_account_order (account_id, order_id)
);

CREATE TABLE IF NOT EXISTS mercadolibre.invoices (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    order_id VARCHAR(255) NULL,
    status VARCHAR(50) NULL,
    data JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES platform_accounts.accounts(id) ON DELETE CASCADE,
    UNIQUE KEY uq_invoices_account_external (account_id, external_id)
);

-- ============================================================
-- SCHEMA: tiendanube
-- ============================================================

CREATE TABLE IF NOT EXISTS tiendanube.product_listings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    account_id INT NOT NULL,
    tnube_id INT NULL,
    variant_id INT NULL,
    price INT NULL,
    price_manually_changed BOOLEAN NULL,
    price_updated_at TIMESTAMP NULL,
    status VARCHAR(100) NULL,
    reason TEXT NULL,
    remedy VARCHAR(255) NULL,
    permalink TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES inventory.products(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES platform_accounts.accounts(id) ON DELETE CASCADE,
    UNIQUE KEY uq_listing_product (product_id),
    UNIQUE KEY uq_listing_tnube_id (account_id, tnube_id)
);

CREATE TABLE IF NOT EXISTS tiendanube.variation_listings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_variation_id INT NOT NULL,
    product_listing_id INT NOT NULL,
    variant_id INT NULL,
    price DECIMAL(10,2) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_variation_id) REFERENCES inventory.product_variations(id) ON DELETE CASCADE,
    FOREIGN KEY (product_listing_id) REFERENCES tiendanube.product_listings(id) ON DELETE CASCADE,
    UNIQUE KEY uq_product_variation_listing (product_variation_id, product_listing_id),
    INDEX idx_product_listing_id (product_listing_id),
    INDEX idx_product_variation_id (product_variation_id)
);

CREATE TABLE IF NOT EXISTS tiendanube.attributes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_listing_id INT NOT NULL,
    category_id INT NULL,
    settings JSON DEFAULT (
        JSON_OBJECT(
            'SEO_TITLE', JSON_OBJECT('DEFAULT_VALUE', NULL, 'USER_INPUT_VALUE', NULL),
            'SEO_DESCRIPTION', JSON_OBJECT('DEFAULT_VALUE', NULL, 'USER_INPUT_VALUE', NULL),
            'BARCODE', JSON_OBJECT('DEFAULT_VALUE', NULL, 'USER_INPUT_VALUE', NULL),
            'VIDEO_URL', JSON_OBJECT('DEFAULT_VALUE', NULL, 'USER_INPUT_VALUE', NULL),
            'TAGS', JSON_OBJECT('DEFAULT_VALUE', JSON_ARRAY(NULL), 'USER_INPUT_VALUE', NULL),
            'PROMOTIONAL_PRICE', JSON_OBJECT('DEFAULT_VALUE', NULL, 'USER_INPUT_VALUE', NULL),
            'MPN', JSON_OBJECT('DEFAULT_VALUE', NULL, 'USER_INPUT_VALUE', NULL),
            'AGE_GROUP', JSON_OBJECT('DEFAULT_VALUE', NULL, 'USER_INPUT_VALUE', NULL),
            'GENDER', JSON_OBJECT('DEFAULT_VALUE', NULL, 'USER_INPUT_VALUE', NULL),
            'FREE_SHIPPING', JSON_OBJECT('DEFAULT_VALUE', NULL, 'USER_INPUT_VALUE', NULL)
        )
    ),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_listing_id) REFERENCES tiendanube.product_listings(id) ON DELETE CASCADE,
    UNIQUE KEY uq_attributes_listing (product_listing_id)
);

CREATE TABLE IF NOT EXISTS tiendanube.categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    external_category_id INT NOT NULL,
    name VARCHAR(255),
    data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES platform_accounts.accounts(id) ON DELETE CASCADE,
    UNIQUE KEY uq_account_external_category (account_id, external_category_id)
);

CREATE TABLE IF NOT EXISTS tiendanube.orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id VARCHAR(255) NOT NULL,
    account_id INT NOT NULL,
    status VARCHAR(50) NULL,
    data JSON DEFAULT NULL,
    pack_id VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES platform_accounts.accounts(id) ON DELETE CASCADE,
    UNIQUE KEY uq_order_account (account_id, order_id)
);

-- ============================================================
-- SCHEMA: ai (prompts de IA)
-- ============================================================

CREATE TABLE IF NOT EXISTS ai.prompts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    ai_generate_title TEXT NULL,
    ai_generate_description TEXT NULL,
    ai_generate_brand TEXT NULL,
    ai_generate_model TEXT NULL,
    ai_category TEXT NULL,
    ai_auditor TEXT NULL,
    ai_improving_human_reply TEXT NULL,
    ai_inventory_search TEXT NULL,
    ai_general TEXT NULL,
    rules TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- SEED OPCIONAL — datos mínimos que esperan los tests
-- (AGENTS.md: business 1 Nicolas, productos 95530/96744, empleados 1/2/3).
-- Ajustá los valores (emails, secret) a los que usen tus agentes.
-- ============================================================

INSERT IGNORE INTO platform_accounts.businesses
    (id, email, password, full_name, webhook_secret)
VALUES
    (1, 'nicolas@guiaslocales.com', 'test123', 'Nicolas', 'test-webhook-secret-change-me');

INSERT IGNORE INTO platform_accounts.accounts
    (id, business_id, platform, external_account_id, name)
VALUES
    (1, 1, 'mercadolibre', 'ml-test', 'MercadoLibre Nicolas'),
    (2, 1, 'tiendanube',  'tn-test', 'TiendaNube Nicolas');

INSERT IGNORE INTO platform_accounts.employees
    (id, business_id, email, password, full_name, active)
VALUES
    (1, 1, 'employee1@test.com', 'test123', 'Empleado 1', 1),
    (2, 1, 'employee2@test.com', 'test123', 'Empleado 2', 1),
    (3, 1, 'inactive@test.com',  'test123', 'Empleado 3', 0);

INSERT IGNORE INTO platform_accounts.credentials (account_id) VALUES (1), (2);

INSERT IGNORE INTO inventory.products
    (id, business_id, internal_code, sku, name)
VALUES
    (95530, 1, 'CODE-95530', 'SKU-95530', 'Producto 95530'),
    (96744, 1, 'CODE-96744', 'SKU-96744', 'Producto 96744');

INSERT IGNORE INTO ai.prompts (id) VALUES (1);
