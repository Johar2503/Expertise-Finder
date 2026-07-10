// Seed data: a small fictional org so the graph is demo-ready immediately.
// Model: (Person)-[:MEMBER_OF]->(Team), (Person)-[:HAS_SKILL]->(Skill),
//        (Person)-[:WORKS_ON]->(Project), (Project)-[:REQUIRES_SKILL]->(Skill),
//        (Person)-[:KNOWS]->(Person)  (org connections, for path-based "who can introduce me" queries)

MERGE (teamPlatform:Team {id: 'team-platform'}) SET teamPlatform.name = 'Platform Engineering';
MERGE (teamData:Team {id: 'team-data'}) SET teamData.name = 'Data & ML';
MERGE (teamFrontend:Team {id: 'team-frontend'}) SET teamFrontend.name = 'Frontend';
MERGE (teamSec:Team {id: 'team-security'}) SET teamSec.name = 'Security';

MERGE (s1:Skill {name: 'Kubernetes'});
MERGE (s2:Skill {name: 'GraphQL'});
MERGE (s3:Skill {name: 'Neo4j'});
MERGE (s4:Skill {name: 'PyTorch'});
MERGE (s5:Skill {name: 'React'});
MERGE (s6:Skill {name: 'Rust'});
MERGE (s7:Skill {name: 'Threat Modeling'});
MERGE (s8:Skill {name: 'LLM Fine-tuning'});
MERGE (s9:Skill {name: 'Postgres'});
MERGE (s10:Skill {name: 'Terraform'});

MERGE (p1:Project {id: 'proj-atlas'}) SET p1.name = 'Atlas Migration';
MERGE (p2:Project {id: 'proj-nimbus'}) SET p2.name = 'Nimbus ML Platform';
MERGE (p3:Project {id: 'proj-shield'}) SET p3.name = 'Shield Security Audit';

WITH 1 AS x
MERGE (alice:Person {id: 'alice'}) SET alice.name = 'Alice Chen', alice.title = 'Staff Engineer';
MERGE (bob:Person {id: 'bob'}) SET bob.name = 'Bob Ibarra', bob.title = 'Senior Engineer';
MERGE (carla:Person {id: 'carla'}) SET carla.name = 'Carla Osei', carla.title = 'ML Engineer';
MERGE (dev:Person {id: 'dev'}) SET dev.name = 'Dev Kapoor', dev.title = 'Frontend Lead';
MERGE (elena:Person {id: 'elena'}) SET elena.name = 'Elena Petrova', elena.title = 'Security Engineer';
MERGE (farid:Person {id: 'farid'}) SET farid.name = 'Farid Haidari', farid.title = 'Platform Engineer';
MERGE (grace:Person {id: 'grace'}) SET grace.name = 'Grace Lin', grace.title = 'Data Scientist';
MERGE (hiro:Person {id: 'hiro'}) SET hiro.name = 'Hiro Tanaka', hiro.title = 'Backend Engineer';

// Team membership
MATCH (alice:Person {id:'alice'}), (t:Team {id:'team-platform'}) MERGE (alice)-[:MEMBER_OF]->(t);
MATCH (bob:Person {id:'bob'}), (t:Team {id:'team-platform'}) MERGE (bob)-[:MEMBER_OF]->(t);
MATCH (farid:Person {id:'farid'}), (t:Team {id:'team-platform'}) MERGE (farid)-[:MEMBER_OF]->(t);
MATCH (carla:Person {id:'carla'}), (t:Team {id:'team-data'}) MERGE (carla)-[:MEMBER_OF]->(t);
MATCH (grace:Person {id:'grace'}), (t:Team {id:'team-data'}) MERGE (grace)-[:MEMBER_OF]->(t);
MATCH (dev:Person {id:'dev'}), (t:Team {id:'team-frontend'}) MERGE (dev)-[:MEMBER_OF]->(t);
MATCH (elena:Person {id:'elena'}), (t:Team {id:'team-security'}) MERGE (elena)-[:MEMBER_OF]->(t);
MATCH (hiro:Person {id:'hiro'}), (t:Team {id:'team-platform'}) MERGE (hiro)-[:MEMBER_OF]->(t);

// Skills (with proficiency + provenance so the ingestion pipeline can add more later)
MATCH (alice:Person {id:'alice'}), (s:Skill {name:'Kubernetes'}) MERGE (alice)-[:HAS_SKILL {level:'expert', source:'seed'}]->(s);
MATCH (alice:Person {id:'alice'}), (s:Skill {name:'Terraform'}) MERGE (alice)-[:HAS_SKILL {level:'expert', source:'seed'}]->(s);
MATCH (bob:Person {id:'bob'}), (s:Skill {name:'Rust'}) MERGE (bob)-[:HAS_SKILL {level:'expert', source:'seed'}]->(s);
MATCH (bob:Person {id:'bob'}), (s:Skill {name:'Kubernetes'}) MERGE (bob)-[:HAS_SKILL {level:'intermediate', source:'seed'}]->(s);
MATCH (carla:Person {id:'carla'}), (s:Skill {name:'PyTorch'}) MERGE (carla)-[:HAS_SKILL {level:'expert', source:'seed'}]->(s);
MATCH (carla:Person {id:'carla'}), (s:Skill {name:'LLM Fine-tuning'}) MERGE (carla)-[:HAS_SKILL {level:'expert', source:'seed'}]->(s);
MATCH (dev:Person {id:'dev'}), (s:Skill {name:'React'}) MERGE (dev)-[:HAS_SKILL {level:'expert', source:'seed'}]->(s);
MATCH (dev:Person {id:'dev'}), (s:Skill {name:'GraphQL'}) MERGE (dev)-[:HAS_SKILL {level:'intermediate', source:'seed'}]->(s);
MATCH (elena:Person {id:'elena'}), (s:Skill {name:'Threat Modeling'}) MERGE (elena)-[:HAS_SKILL {level:'expert', source:'seed'}]->(s);
MATCH (farid:Person {id:'farid'}), (s:Skill {name:'Kubernetes'}) MERGE (farid)-[:HAS_SKILL {level:'expert', source:'seed'}]->(s);
MATCH (farid:Person {id:'farid'}), (s:Skill {name:'Terraform'}) MERGE (farid)-[:HAS_SKILL {level:'intermediate', source:'seed'}]->(s);
MATCH (grace:Person {id:'grace'}), (s:Skill {name:'PyTorch'}) MERGE (grace)-[:HAS_SKILL {level:'intermediate', source:'seed'}]->(s);
MATCH (grace:Person {id:'grace'}), (s:Skill {name:'Postgres'}) MERGE (grace)-[:HAS_SKILL {level:'expert', source:'seed'}]->(s);
MATCH (hiro:Person {id:'hiro'}), (s:Skill {name:'Postgres'}) MERGE (hiro)-[:HAS_SKILL {level:'expert', source:'seed'}]->(s);
MATCH (hiro:Person {id:'hiro'}), (s:Skill {name:'Neo4j'}) MERGE (hiro)-[:HAS_SKILL {level:'intermediate', source:'seed'}]->(s);

// Projects
MATCH (p:Project {id:'proj-atlas'}), (s:Skill {name:'Kubernetes'}) MERGE (p)-[:REQUIRES_SKILL]->(s);
MATCH (p:Project {id:'proj-atlas'}), (s:Skill {name:'Terraform'}) MERGE (p)-[:REQUIRES_SKILL]->(s);
MATCH (p:Project {id:'proj-nimbus'}), (s:Skill {name:'PyTorch'}) MERGE (p)-[:REQUIRES_SKILL]->(s);
MATCH (p:Project {id:'proj-nimbus'}), (s:Skill {name:'LLM Fine-tuning'}) MERGE (p)-[:REQUIRES_SKILL]->(s);
MATCH (p:Project {id:'proj-shield'}), (s:Skill {name:'Threat Modeling'}) MERGE (p)-[:REQUIRES_SKILL]->(s);

MATCH (alice:Person {id:'alice'}), (p:Project {id:'proj-atlas'}) MERGE (alice)-[:WORKS_ON]->(p);
MATCH (farid:Person {id:'farid'}), (p:Project {id:'proj-atlas'}) MERGE (farid)-[:WORKS_ON]->(p);
MATCH (carla:Person {id:'carla'}), (p:Project {id:'proj-nimbus'}) MERGE (carla)-[:WORKS_ON]->(p);
MATCH (grace:Person {id:'grace'}), (p:Project {id:'proj-nimbus'}) MERGE (grace)-[:WORKS_ON]->(p);
MATCH (elena:Person {id:'elena'}), (p:Project {id:'proj-shield'}) MERGE (elena)-[:WORKS_ON]->(p);

// Social/org graph edges so multi-hop "who can introduce me" queries return interesting paths
MATCH (a:Person {id:'alice'}), (b:Person {id:'hiro'}) MERGE (a)-[:KNOWS]->(b);
MATCH (a:Person {id:'hiro'}), (b:Person {id:'grace'}) MERGE (a)-[:KNOWS]->(b);
MATCH (a:Person {id:'bob'}), (b:Person {id:'farid'}) MERGE (a)-[:KNOWS]->(b);
MATCH (a:Person {id:'dev'}), (b:Person {id:'elena'}) MERGE (a)-[:KNOWS]->(b);
MATCH (a:Person {id:'carla'}), (b:Person {id:'elena'}) MERGE (a)-[:KNOWS]->(b);
