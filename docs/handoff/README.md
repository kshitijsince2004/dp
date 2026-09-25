# PHAROS Handoff Documentation

| Document | Audience | Description |
|---|---|---|
| [01-PRD.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/01-PRD.md) | Stakeholders, Product, Police Leadership | What PHAROS does and why |
| [02-FRD.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/02-FRD.md) | Analysts, QA, Developers | Testable functional requirements |
| [03-TECHNICAL-ARCHITECTURE.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/03-TECHNICAL-ARCHITECTURE.md) | Architects, Senior Engineers | System architecture, stack, design rulings |
| [04-DATABASE-SCHEMA.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/04-DATABASE-SCHEMA.md) | Backend Engineers, DBAs | Complete database schema reference |
| [05-API-REFERENCE.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/05-API-REFERENCE.md) | Frontend Developers, QA, Integrators | Complete REST API endpoint surface |
| [06-DIARY-ENGINE.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/06-DIARY-ENGINE.md) | Report & Analytics Engineers | Diary compilation formulas & architecture |
| [07-RBAC.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/07-RBAC.md) | Security Engineers, Developers | Roles, permissions, data scoping & guards |
| [08-WORKFLOW.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/08-WORKFLOW.md) | Engineers, QA | Config-driven state machine documentation |
| [09-DEPENDENCIES.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/09-DEPENDENCIES.md) | DevOps, Engineers | Complete runtime & build dependency inventory |
| [10-SETUP-GUIDE.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/10-SETUP-GUIDE.md) | All Developers | Step-by-step local development setup |
| [11-DEPLOYMENT-GUIDE.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/11-DEPLOYMENT-GUIDE.md) | DevOps, System Administrators | Production deployment, security, operations |
| [12-KNOWN-ISSUES.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/12-KNOWN-ISSUES.md) | All Engineers, QA, PMs | Audit of technical debt, bugs, and blockers |
| [13-ROADMAP.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/13-ROADMAP.md) | Product, Leadership, Team Leads | Development timeline, completed & next phases |
| [14-GLOSSARY.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/14-GLOSSARY.md) | All Team Members | Delhi Police and PHAROS domain terminology |

---

## Quick Orientation for New Engineers

1. **Read [14-GLOSSARY.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/14-GLOSSARY.md) first** — the Delhi Police domain terms (Kalandra, BNS, DD, Zero FIR) are foundational.
2. **Read [01-PRD.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/01-PRD.md)** to understand the operational context and value proposition.
3. **Follow [10-SETUP-GUIDE.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/10-SETUP-GUIDE.md)** to bring up Docker infrastructure and run the application locally.
4. **Study [03-TECHNICAL-ARCHITECTURE.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/03-TECHNICAL-ARCHITECTURE.md)** to understand the spine pattern, config-driven state machine, and dual worker architecture.
5. **Review [12-KNOWN-ISSUES.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/12-KNOWN-ISSUES.md)** before designing new features.
6. **Consult [04-DATABASE-SCHEMA.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/04-DATABASE-SCHEMA.md)** before any backend database work.
7. **Consult [06-DIARY-ENGINE.md](file:///d:/DPI/FIR/pharos-prototype/docs/handoff/06-DIARY-ENGINE.md)** before modifying any report or Fortnightly / PHQ diary generation code.

---

## Source of Truth Hierarchy

1. **Database Migrations (`backend/migrations/`)**: Authoritative schema definition.
2. **Workflow Transitions (`workflow_transitions_config` table)**: Authoritative state machine definition.
3. **Field Registry (`field_registry` table / `config/fields/*.json`)**: Dynamic form schema definition.
4. **Context Bundle (`context-bundle/`)**: Verified codebase audits and technical findings.
5. **Handoff Documentation (`docs/handoff/`)**: Structured system reference.
