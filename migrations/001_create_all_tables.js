require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

async function createTables() {
  try {
    console.log('🚀 Начало создания таблиц...\n');

    // 1. Таблица users
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
        email_verified BOOLEAN DEFAULT false,
        verification_token TEXT,
        verification_token_expires TIMESTAMP,
        verified_at TIMESTAMP,
        last_verification_sent TIMESTAMP,
        slots_total INTEGER DEFAULT 2,
        slots_used INTEGER DEFAULT 0,
        alba_balance DECIMAL(10, 2) DEFAULT 0,
        ref_code VARCHAR(20) UNIQUE,
        referred_by INTEGER REFERENCES users(id),
        ref_bonus_granted BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✓ Таблица users создана');

    // 2. Таблица categories
    await sql`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        parent_id INTEGER REFERENCES categories(id),
        type VARCHAR(50) DEFAULT 'all' CHECK (type IN ('product', 'service', 'banner', 'all')),
        icon VARCHAR(50) DEFAULT '',
        description VARCHAR(500) DEFAULT '',
        "order" INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✓ Таблица categories создана');

    await sql`CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type)`;

    // 3. Таблица products
    await sql`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT '',
        price VARCHAR(255) NOT NULL,
        link TEXT,
        images JSONB DEFAULT '[]'::jsonb,
        image_url TEXT,
        video_url TEXT DEFAULT '',
        contacts JSONB DEFAULT '{}'::jsonb,
        owner_id INTEGER REFERENCES users(id),
        category_id INTEGER REFERENCES categories(id),
        category VARCHAR(200) DEFAULT '',
        type VARCHAR(50) DEFAULT 'product' CHECK (type IN ('product', 'service')),
        likes INTEGER DEFAULT 0,
        dislikes INTEGER DEFAULT 0,
        voters INTEGER[] DEFAULT ARRAY[]::INTEGER[],
        rating_updated_at TIMESTAMP DEFAULT NOW(),
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        rejection_reason TEXT DEFAULT '',
        tier VARCHAR(50) DEFAULT 'free' CHECK (tier IN ('free', 'paid')),
        tier_requested VARCHAR(50) DEFAULT 'free',
        edit_count INTEGER DEFAULT 0,
        admin_comment TEXT DEFAULT '',
        payment_status VARCHAR(50) DEFAULT 'none',
        activation_code_id INTEGER,
        deleted BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✓ Таблица products создана');

    await sql`CREATE INDEX IF NOT EXISTS idx_products_status ON products(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_products_owner ON products(owner_id)`;

    // 4. Таблица banners
    await sql`
      CREATE TABLE IF NOT EXISTS banners (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT DEFAULT '',
        link TEXT DEFAULT '',
        video_url TEXT DEFAULT '',
        owner_id INTEGER REFERENCES users(id),
        category_id INTEGER REFERENCES categories(id),
        category VARCHAR(200) DEFAULT '',
        price VARCHAR(255) DEFAULT '',
        images JSONB DEFAULT '[]'::jsonb,
        image_url TEXT,
        status VARCHAR(50) DEFAULT 'published',
        rejection_reason TEXT DEFAULT '',
        tier VARCHAR(50) DEFAULT 'free',
        tier_requested VARCHAR(50) DEFAULT 'free',
        edit_count INTEGER DEFAULT 0,
        admin_comment TEXT DEFAULT '',
        payment_status VARCHAR(50) DEFAULT 'none',
        activation_code_id INTEGER,
        rating_up INTEGER DEFAULT 0,
        rating_down INTEGER DEFAULT 0,
        voters INTEGER[] DEFAULT ARRAY[]::INTEGER[],
        rating_updated_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✓ Таблица banners создана');

    // 5. Таблица codes
    await sql`
      CREATE TABLE IF NOT EXISTS codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(255) NOT NULL UNIQUE,
        kind VARCHAR(50) NOT NULL CHECK (kind IN ('slot', 'payment_activation')),
        type VARCHAR(50) NOT NULL CHECK (type IN ('product', 'service', 'banner')),
        status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired')),
        expires_at TIMESTAMP,
        created_by INTEGER REFERENCES users(id),
        used_by INTEGER REFERENCES users(id),
        used_at TIMESTAMP,
        reserved_for_user_id INTEGER REFERENCES users(id),
        card_id INTEGER,
        meta JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✓ Таблица codes создана');

    // 6. Таблица code_usage
    await sql`
      CREATE TABLE IF NOT EXISTS code_usage (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        code_id INTEGER NOT NULL REFERENCES codes(id),
        kind VARCHAR(50) NOT NULL,
        type VARCHAR(50) NOT NULL,
        ip VARCHAR(45),
        user_agent TEXT,
        card_id INTEGER,
        used_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, code_id)
      )
    `;
    console.log('✓ Таблица code_usage создана');

    // 7. Таблица alba_transactions
    await sql`
      CREATE TABLE IF NOT EXISTS alba_transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        amount DECIMAL(10, 2) NOT NULL,
        type VARCHAR(50) NOT NULL,
        reason VARCHAR(100) NOT NULL,
        related_user_id INTEGER REFERENCES users(id),
        related_code_id INTEGER REFERENCES codes(id),
        related_card_type VARCHAR(50),
        related_card_id INTEGER,
        comment TEXT DEFAULT '',
        meta JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✓ Таблица alba_transactions создана');

    // 8. Таблица entitlements
    await sql`
      CREATE TABLE IF NOT EXISTS entitlements (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER NOT NULL REFERENCES users(id),
        type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'available',
        source VARCHAR(100) DEFAULT 'purchase',
        idempotency_key VARCHAR(255),
        event_id VARCHAR(255) NOT NULL UNIQUE,
        related_transaction_id INTEGER REFERENCES alba_transactions(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✓ Таблица entitlements создана');

    // 9. Таблица audit_logs
    await sql`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        action VARCHAR(255) NOT NULL,
        user_id INTEGER REFERENCES users(id),
        target_user_id INTEGER REFERENCES users(id),
        admin_id INTEGER REFERENCES users(id),
        amount DECIMAL(10, 2),
        reason TEXT,
        details JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✓ Таблица audit_logs создана');

    // 10. Таблица comments
    await sql`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        card_id INTEGER NOT NULL,
        card_type VARCHAR(50) NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id),
        text TEXT NOT NULL,
        deleted BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✓ Таблица comments создана');

    // 11. Таблица video_posts
    await sql`
      CREATE TABLE IF NOT EXISTS video_posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        nickname VARCHAR(255) DEFAULT '',
        video_url TEXT NOT NULL,
        platform VARCHAR(100) DEFAULT '',
        title VARCHAR(500) DEFAULT '',
        description TEXT DEFAULT '',
        genres TEXT[] DEFAULT ARRAY[]::TEXT[],
        status VARCHAR(50) DEFAULT 'pending',
        admin_comment TEXT DEFAULT '',
        rejection_reason TEXT DEFAULT '',
        rating_up INTEGER DEFAULT 0,
        rating_down INTEGER DEFAULT 0,
        voters JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✓ Таблица video_posts создана');

    // 12. Таблица contact_info
    await sql`
      CREATE TABLE IF NOT EXISTS contact_info (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✓ Таблица contact_info создана');

    // 13. Таблица statistics
    await sql`
      CREATE TABLE IF NOT EXISTS statistics (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) NOT NULL UNIQUE,
        value DECIMAL(20, 2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✓ Таблица statistics создана');

    console.log('\n✅ Все таблицы успешно созданы!');

  } catch (error) {
    console.error('❌ Ошибка:', error);
    throw error;
  }
}

createTables()
  .then(() => {
    console.log('\n🎉 Миграция завершена!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Ошибка:', error);
    process.exit(1);
  });