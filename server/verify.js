require('dotenv').config();
const { driver, runQuery } = require('./neo4j');

(async () => {
  const rows = await runQuery(
    `MATCH (p:Person)-[r:HAS_SKILL]->(s:Skill)
     WHERE toLower(s.name) CONTAINS toLower('kubernetes')
     RETURN p.name AS name, r.level AS level`
  );
  console.log('Kubernetes matches:', rows);
  await driver.close();
})();
