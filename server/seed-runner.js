require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { driver } = require('./neo4j');

async function runFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const statements = text
    .split(';')
    .map((s) => s.replace(/^\/\/.*$/gm, '').trim())
    .filter((s) => s.length);

  const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
  try {
    for (const stmt of statements) {
      await session.run(stmt);
    }
  } finally {
    await session.close();
  }
}

(async () => {
  try {
    await runFile(path.join(__dirname, '..', 'neo4j', 'schema.cypher'));
    console.log('Schema applied.');
    await runFile(path.join(__dirname, '..', 'neo4j', 'seed.cypher'));
    console.log('Seed data loaded.');
  } catch (e) {
    console.error('Seed failed:', e.message);
    process.exitCode = 1;
  } finally {
    await driver.close();
  }
})();
