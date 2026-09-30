-- ============================================================
-- SCHEMAS
-- ============================================================

-- DROP SCHEMA platform_accounts;
-- DROP SCHEMA inventory;
-- DROP SCHEMA mercadolibre;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS
    tiendanube.orders,
    tiendanube.categories,
    tiendanube.attributes,
    tiendanube.variation_listings,
    tiendanube.product_listings,
    mercadolibre.orders,
    mercadolibre.messages,
    mercadolibre.price_suggestions,
    mercadolibre.shipments,
    mercadolibre.promotions,
    mercadolibre.claims,
    mercadolibre.payments,
    mercadolibre.invoices,
    mercadolibre.size_grid,
    mercadolibre.attributes,
    mercadolibre.variation_listings,
    mercadolibre.product_listings,
    inventory.stock_movements,
    inventory.product_images,
    inventory.product_variations,
    inventory.products,
    platform_accounts.events,
    platform_accounts.support_tickets,
    platform_accounts.credentials,
    platform_accounts.employees,
    platform_accounts.accounts,
    platform_accounts.businesses;

SET FOREIGN_KEY_CHECKS = 1;

```sql
CREATE SCHEMA IF NOT EXISTS platform_accounts;
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS mercadolibre;
CREATE SCHEMA IF NOT EXISTS tiendanube;
```

-- ============================================================
-- SCHEMA: platform_accounts
-- ============================================================

```sql
CREATE TABLE platform_accounts.businesses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    config json,
    webhook_secret VARCHAR(64) NULL,
    -- Desactivación estricta (panel de plataforma): bloquea login, tokens y webhooks.
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

```sql
-- Admins de plataforma (panel /api/platform): gestionan businesses y cuentas.
-- Token con salt propio (omnipanel-admin-auth-v1); NO comparte el de negocios.
CREATE TABLE platform_accounts.admins (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

```sql
CREATE TABLE platform_accounts.employees (
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
```


```sql
CREATE TABLE platform_accounts.accounts (
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
```

```sql
CREATE TABLE platform_accounts.credentials (
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
```

```sql
CREATE TABLE platform_accounts.events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    source VARCHAR(32) NOT NULL,     
    event_type VARCHAR(64) NOT NULL,  
    external_id VARCHAR(255) NOT NULL,
    payload JSON NULL,
    -- who made the change: businesses.id or employees.id per actor_role.
    -- NULL on system-driven events (orders, item status webhooks).
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
```

```sql
CREATE TABLE platform_accounts.support_tickets (
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
```

-- ============================================================
-- SCHEMA: inventory
-- ============================================================


```sql
CREATE TABLE inventory.products (
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
    INDEX  idx_business_id (business_id)
);
```

```sql
CREATE TABLE inventory.product_images (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_product_id (product_id),
    UNIQUE KEY uq_product_url (product_id, url(255))
);
```

```sql
CREATE TABLE inventory.product_variations (
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
``` 

-- double-post guard: one row per (order, product, direction)
```sql
CREATE TABLE inventory.stock_movements (
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
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY uq_stock_dedup (account_id, order_id, product_id, direction),
    CONSTRAINT chk_target_system CHECK (target_system IN ('bitcram'))    
    
);
```





-- ============================================================
-- SCHEMA: mercadolibre
-- ============================================================

```sql
CREATE TABLE mercadolibre.product_listings (
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
    -- Catálogo (opt-in/opt-out): la fila sigue siendo UNA por producto.
    -- meli_id = publicación principal (la de catálogo cuando está vinculada).
    -- marketplace_* = publicación tradicional "sombra" (id + estado).
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
```

```sql
CREATE TABLE mercadolibre.selling_costs (
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
```

```sql
  CREATE TABLE mercadolibre.performance (    
  id INT PRIMARY KEY AUTO_INCREMENT,
  product_listing_id INT NOT NULL,
  entity_type varchar(50) DEFAULT NULL,
  score tinyint DEFAULT NULL,
  level varchar(50) DEFAULT NULL,
  level_wording varchar(50) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  buckets json DEFAULT NULL,
  FOREIGN KEY (product_listing_id) REFERENCES mercadolibre.product_listings(id) ON DELETE CASCADE,
  UNIQUE KEY uq_performance_listing (product_listing_id)
)
```

```sql
CREATE TABLE mercadolibre.variation_listings (
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
```


```sql
CREATE TABLE mercadolibre.attributes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_listing_id INT NOT NULL,
    category_id VARCHAR(50) DEFAULT NULL,
    empty_gtin_reason_required TINYINT(1) DEFAULT 0,
    empty_gtin_reason INT DEFAULT 17055160,
    buying_mode VARCHAR(50) DEFAULT 'buy_it_now',
    condition_type VARCHAR(50) DEFAULT 'new',
    currency_id VARCHAR(5) DEFAULT 'ARS',
    -- DEPRECADA 28/09: solo la escriben/leen los flujos webhook deprecados
    -- (prepublish -> _generate_category_options y create_template en grid_size).
    -- El dashboard busca categorías en vivo (GET /api/mercadolibre/categories).
    -- Se dropea junto con la eliminación de esos flujos.
    category_options JSON DEFAULT NULL,
    settings JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_listing_id) REFERENCES product_listings(id) ON DELETE CASCADE,
    UNIQUE KEY uq_attributes_listing (product_listing_id)
);
```

```sql
CREATE TABLE mercadolibre.size_grid (
    id INT PRIMARY KEY AUTO_INCREMENT,
    attribute_id INT NOT NULL,
    size_grid_id BIGINT DEFAULT NULL,
    settings JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (attribute_id) REFERENCES attributes(id) ON DELETE CASCADE,
    UNIQUE KEY uq_size_grid_attribute (attribute_id)
);
```

```sql
CREATE TABLE mercadolibre.orders (
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
```

-- ============================================================
-- Webhook events de MercadoLibre (proyecciones planas)
-- El stream crudo vive en platform_accounts.events con
-- source='mercadolibre', event_type=topic, external_id=_id de la
-- notificación. Estas tablas guardan el estado ACTUAL por entidad
-- (upsert idempotente por unique key) para el front.
-- ============================================================

```sql
CREATE TABLE mercadolibre.messages (
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
```

```sql
CREATE TABLE mercadolibre.price_suggestions (
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
```

```sql
CREATE TABLE mercadolibre.shipments (
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
```

```sql
CREATE TABLE mercadolibre.promotions (
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
```

```sql
CREATE TABLE mercadolibre.claims (
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
```

```sql
CREATE TABLE mercadolibre.payments (
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
```

```sql
CREATE TABLE mercadolibre.invoices (
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
```

-- ============================================================
-- SCHEMA: tiendanube
-- ============================================================


```sql
CREATE TABLE tiendanube.product_listings (
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
    UNIQUE KEY uq_listing_meli_id (account_id, tnube_id)  
);
```

```sql
CREATE TABLE tiendanube.variation_listings (
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
```


```sql
CREATE TABLE tiendanube.attributes (

    id INT PRIMARY KEY AUTO_INCREMENT,
    product_listing_id INT NOT NULL,
    category_id INT NULL,
    settings JSON DEFAULT (
        '{
            "SEO_TITLE": {
                "DEFAULT_VALUE": null,
                "USER_INPUT_VALUE": null
            },
            "SEO_DESCRIPTION": {
                "DEFAULT_VALUE": null,
                "USER_INPUT_VALUE": null
            },
            "BARCODE": {
                "DEFAULT_VALUE": null,
                "USER_INPUT_VALUE": null
            },
            "VIDEO_URL": {
                "DEFAULT_VALUE": null,
                "USER_INPUT_VALUE": null
            },
            "TAGS": {
                "DEFAULT_VALUE": [null],
                "USER_INPUT_VALUE": null
            },
            "PROMOTIONAL_PRICE": {
                "DEFAULT_VALUE": null,
                "USER_INPUT_VALUE": null
            },
            "MPN": {
                "DEFAULT_VALUE": null,
                "USER_INPUT_VALUE": null
            },
            "AGE_GROUP": {
                "DEFAULT_VALUE": null,
                "USER_INPUT_VALUE": null
            },
            "GENDER": {
                "DEFAULT_VALUE": null,
                "USER_INPUT_VALUE": null
            },
            "FREE_SHIPPING": {
                "DEFAULT_VALUE": null,
                "USER_INPUT_VALUE": null
            }
        }'
    ),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_listing_id) REFERENCES tiendanube.product_listings(id) ON DELETE CASCADE,
    UNIQUE KEY uq_attributes_listing (product_listing_id)

);
```


```sql
CREATE TABLE tiendanube.categories (
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
```

    


```sql
CREATE TABLE tiendanube.orders (
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
```

-- ============================================================
-- SCHEMA: ai
-- ============================================================

```sql
CREATE TABLE ai.prompts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    business_id INT NOT NULL,
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_prompts_business (business_id),
    FOREIGN KEY (business_id) REFERENCES platform_accounts.businesses(id) ON DELETE CASCADE
);
```