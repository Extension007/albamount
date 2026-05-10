require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

async function checkTables() {
  try {
    const tables = await sql`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns 
              WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    
    console.log('\n📋 Созданные таблицы в Neon:\n');
    tables.forEach((table, index) => {
      console.log(`   ${index + 1}. ${table.table_name} (${table.column_count} колонок)`);
    });
    console.log(`\n✅ Всего таблиц: ${tables.length}`);
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
}

checkTables();