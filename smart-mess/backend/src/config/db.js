const mysql = require('mysql2/promise');
require('dotenv').config();

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = 3306,
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'smart_mess_db',
} = process.env;

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      dateStrings: true, // Returns DATE columns as 'YYYY-MM-DD' strings
      decimalNumbers: true
    });
  }
  return pool;
}

module.exports = {
  getPool,
  query: async (sql, params) => {
    const p = getPool();
    return p.query(sql, params);
  },
  execute: async (sql, params) => {
    const p = getPool();
    return p.execute(sql, params);
  }
};
