'use strict';
const { getDB, initDB } = require('../db/db');

try {
  const db = getDB();
  console.log('Dropping old tables...');
  db.exec(`
    DROP TABLE IF EXISTS properties;
    DROP TABLE IF EXISTS enquiries;
    DROP TABLE IF EXISTS testimonials;
  `);
  console.log('Re-initializing and seeding database...');
  initDB();
  console.log('Database successfully re-seeded with 24 properties!');
} catch (err) {
  console.error('Error during database reseed:', err);
}
