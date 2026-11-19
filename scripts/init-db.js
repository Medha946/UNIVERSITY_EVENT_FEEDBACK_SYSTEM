// Creates the MySQL schema, procedures and triggers, and the Mongo indexes.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD,
    multipleStatements: true,
  });
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'sql', f), 'utf8');

  await conn.query(read('schema.sql'));
  console.log('schema.sql applied');

  // procedures.sql uses DELIMITER $$ for the mysql CLI; split it here instead
  const parts = read('procedures.sql')
    .split('\n').filter((l) => !/^\s*DELIMITER/i.test(l)).join('\n')
    .split('$$').map((s) => s.trim()).filter(Boolean);
  for (const stmt of parts) await conn.query(stmt);
  console.log('procedures.sql applied (' + parts.length + ' statements)');
  await conn.end();

  const mongo = await new MongoClient(process.env.MONGODB_URI).connect();
  const fb = mongo.db(process.env.MONGODB_DB).collection('feedback');
  await fb.createIndex({ eventId: 1, userId: 1 }, { unique: true });
  await fb.createIndex({ eventId: 1, submittedAt: -1 });
  await fb.createIndex({ comment: 'text' });
  console.log('MongoDB indexes created');
  await mongo.close();
})().catch((e) => { console.error(e); process.exit(1); });
