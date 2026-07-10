// Constraints & indexes for the Expertise Finder graph
CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT team_id IF NOT EXISTS FOR (t:Team) REQUIRE t.id IS UNIQUE;
CREATE CONSTRAINT project_id IF NOT EXISTS FOR (pr:Project) REQUIRE pr.id IS UNIQUE;
CREATE CONSTRAINT skill_name IF NOT EXISTS FOR (s:Skill) REQUIRE s.name IS UNIQUE;

CREATE INDEX person_name IF NOT EXISTS FOR (p:Person) ON (p.name);
