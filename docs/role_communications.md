# Role-to-Role Communications (Handoff Contracts)

Each handoff = an interface/contract: the next role only needs the previous role's *output*, not its internals. Clean contracts = swappable layers.

| # | From -> To | Hands off (the contract) |
|---|------------|--------------------------|
| 1 | Product Owner -> Business Analyst | Product Vision/Charter + prioritized backlog (epics). The WHAT & WHY, in priority order. |
| 2 | Business Analyst -> Data Analyst | Detailed functional + non-functional requirements, acceptance criteria, target/label definition. The spec + "done" criteria. |
| 3 | Data Analyst -> Data Engineer | EDA findings, data dictionary, cleaned/joined dataset definition, feature candidates, target/proxy-label rule. What data + features + label to pipeline. |
| 4 | Data Engineer -> Data Scientist | Reproducible ETL pipeline + analysis-ready feature table in Postgres. A clean, versioned feature set to model. |
| 5 | Data Scientist/ML -> MLOps | Trained + validated model artifact, eval metrics (vs baseline), inference signature. A working model + how to call it. |
| 6 | MLOps -> AI Engineer | Deployed model API (endpoint + Pydantic schema), monitored, in Docker. Model-as-a-tool the agent can invoke. |
| 7 | AI Engineer -> Full-stack | AI/agent services API (copilot/RAG endpoints) + prediction endpoints. Backend services + schemas the UI binds to. |
| 8 | Full-stack -> Deploy/DevOps | Web app + all services containerized. A deployable build -> live URL. |

## Core principle
The "communication" between roles is always a **defined artifact or API contract** — not a conversation. Upstream roles define *what* and *why*; downstream roles execute *how*. Each role consumes only the previous role's deliverable, which is why the layers stay decoupled and any one of them can be swapped or upgraded independently.
