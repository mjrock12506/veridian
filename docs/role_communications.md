# Role-to-Role Handoff Contracts

Each handoff is an interface: the next discipline needs only the previous one's
output, not its internals. Clean contracts keep the layers swappable.

| # | From → To | Handoff (the contract) |
|---|------------|--------------------------|
| 1 | Product → Business Analysis | Product vision/charter and prioritized backlog (epics) — the *what* and *why*, in priority order. |
| 2 | Business Analysis → Data Analysis | Functional and non-functional requirements, acceptance criteria, and target/label definitions — the spec and "done" criteria. |
| 3 | Data Analysis → Data Engineering | EDA findings, data dictionary, cleaned/joined dataset definition, feature candidates, and the target/proxy-label rule. |
| 4 | Data Engineering → Data Science | A reproducible ETL pipeline and an analysis-ready feature table in the warehouse — a clean, versioned feature set to model. |
| 5 | Data Science / ML → MLOps | A trained, validated model artifact, evaluation metrics (vs. baseline), and an inference signature — a working model and how to call it. |
| 6 | MLOps → AI Engineering | A deployed, monitored, containerized model API (endpoint plus Pydantic schema) — the model as a tool the AI layer can invoke. |
| 7 | AI Engineering → Full-stack | AI/agent service endpoints (copilot/RAG) plus the prediction endpoints — backend services and schemas the UI binds to. |
| 8 | Full-stack → Deployment | The web app and all services containerized — a deployable build that yields a live URL. |

## Core principle

The communication between disciplines is always a defined artifact or API
contract, not a conversation. Upstream disciplines define *what* and *why*;
downstream disciplines implement *how*. Each consumes only the previous
deliverable, which keeps the layers decoupled and independently replaceable.
