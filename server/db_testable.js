// db_testable.js — better-sqlite3 en mémoire pour les tests
// Schéma et seed partagés via db_schema.js (source unique de vérité)

const Database = require('better-sqlite3');
const { applySchema, applySeed } = require('./db_schema');

let db;

async function init() {
  const dbPath = process.env.PG_TEST_DB_PATH || ':memory:';
  db = new Database(dbPath);

  db.pragma('foreign_keys = ON');

  applySchema(db);
  applySeed(db);

  return db;
}

function queryAll(sql, params = []) {
  return db.prepare(sql).all(...params);
}

function queryOne(sql, params = []) {
  return db.prepare(sql).get(...params) || null;
}

function run(sql, params = []) {
  const info = db.prepare(sql).run(...params);
  return { lastInsertRowid: info.lastInsertRowid };
}

function transaction(fn) {
  db.transaction(fn)();
}

module.exports = { init, queryAll, queryOne, run, transaction };
