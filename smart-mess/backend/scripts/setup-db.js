const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = 3306,
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'smart_mess_db',
  ADMIN_NAME = 'Mess Administrator',
  ADMIN_EMAIL = 'admin@mess.local',
  ADMIN_PASSWORD,
  HOME_COLLEGE_NAME = 'National Institute of Technology'
} = process.env;

// Validate database name against SQL injection
function isValidDbName(name) {
  return /^[a-zA-Z0-9_]+$/.test(name);
}

// Validate admin password strength
function validateAdminPassword(password) {
  if (!password) {
    throw new Error('ADMIN_PASSWORD is required in .env');
  }
  const placeholders = ['password', 'admin123', 'admin', 'changeme', 'placeholder'];
  if (placeholders.includes(password.toLowerCase().trim())) {
    throw new Error('ADMIN_PASSWORD cannot be a trivial or placeholder password.');
  }
  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters long.');
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('ADMIN_PASSWORD must contain at least one letter and one number.');
  }
}

async function runSetup() {
  console.log('--- Starting Smart Mess Database Setup ---');

  if (!isValidDbName(DB_NAME)) {
    console.error(`Invalid database name: "${DB_NAME}". Database names must contain only alphanumeric characters and underscores.`);
    process.exit(1);
  }

  validateAdminPassword(ADMIN_PASSWORD);

  let initialConnection;
  try {
    console.log(`Connecting to MySQL server at ${DB_HOST}:${DB_PORT} as user "${DB_USER}"...`);
    initialConnection = await mysql.createConnection({
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASSWORD,
      multipleStatements: true
    });
  } catch (err) {
    console.error('Failed to connect to MySQL server. Please ensure MySQL is running and your .env credentials are correct.');
    console.error('Error detail:', err.message);
    process.exit(1);
  }

  try {
    // 1. Create database if it does not exist
    console.log(`Ensuring database "${DB_NAME}" exists...`);
    await initialConnection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await initialConnection.changeUser({ database: DB_NAME });

    // 2. Read and run schema.sql
    const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
    console.log(`Executing schema from: ${schemaPath}`);
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await initialConnection.query(schemaSql);
    console.log('Schema tables verified/created successfully.');

    // 2b. Safe migration: ensure uq_polls_date_type unique index exists on polls
    const [existingIndexes] = await initialConnection.query(
      "SELECT INDEX_NAME FROM information_schema.statistics WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'polls' AND INDEX_NAME = 'uq_polls_date_type'"
    );
    if (existingIndexes.length === 0) {
      console.log('Applying safe migration: adding uq_polls_date_type unique constraint...');
      await initialConnection.query('ALTER TABLE polls ADD CONSTRAINT uq_polls_date_type UNIQUE (meal_date, meal_type)');
      console.log('Migration applied: uq_polls_date_type added.');
    }

    // 3. Check if polls table already has records; run seed.sql if empty
    const [existingPolls] = await initialConnection.query('SELECT COUNT(*) AS count FROM polls');
    if (existingPolls[0].count === 0) {
      const seedPath = path.resolve(__dirname, '../../database/seed.sql');
      console.log(`Running seed data from: ${seedPath}`);
      const seedSql = fs.readFileSync(seedPath, 'utf8');
      await initialConnection.query(seedSql);
      console.log('Seed poll and menu options inserted successfully.');
    } else {
      console.log(`Found ${existingPolls[0].count} existing poll(s); skipping seed poll insertion.`);
    }

    // 4. Create or update the admin account safely
    console.log(`Ensuring admin account exists for email "${ADMIN_EMAIL}"...`);
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

    const [adminCheck] = await initialConnection.query(
      'SELECT id FROM users WHERE email = ?',
      [ADMIN_EMAIL]
    );

    if (adminCheck.length === 0) {
      await initialConnection.query(
        `INSERT INTO users (name, email, college_name, student_type, password_hash, role)
         VALUES (?, ?, ?, 'home', ?, 'admin')`,
        [ADMIN_NAME, ADMIN_EMAIL, HOME_COLLEGE_NAME, passwordHash]
      );
      console.log('Admin account created successfully.');
    } else {
      await initialConnection.query(
        `UPDATE users
         SET name = ?, college_name = ?, password_hash = ?, role = 'admin'
         WHERE email = ?`,
        [ADMIN_NAME, HOME_COLLEGE_NAME, passwordHash, ADMIN_EMAIL]
      );
      console.log('Admin account updated with current password from .env successfully.');
    }

    console.log('--- Database Setup Completed Successfully ---');
  } catch (err) {
    console.error('Error during database setup:', err.message);
    process.exit(1);
  } finally {
    if (initialConnection) {
      await initialConnection.end();
    }
  }
}

if (require.main === module) {
  runSetup();
}

module.exports = runSetup;
