# 09 — Backlog (post-I49 and deferred items)

Items deliberately left out of the 49 iterations, with the spec references that ask for them. Each becomes one or more new iterations (I50+) when prioritized. Iterations may append deferred work here (with date and source iteration).

| ID   | Item                                                                                                                       | Spec refs                                                          | Why deferred / prerequisite                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| B-01 | Branch creation, branch isolation & merge with conflict detection                                                          | SPEC-006 FR-PRJ-035…038, Phase 4; SPEC-003 open decision 10        | OD-PRJ-003 recommends deferral; ADR-018 single working copy |
| B-02 | Real-time multi-user co-editing (presence, CRDT/OT)                                                                        | SPEC-007 Phase 4, FR-EDT-085; SPEC-010 §14.3                       | Needs WebSockets (T-03 justification)                       |
| B-03 | Editable 3D geometry (3D-L2 / G4, S3 sync)                                                                                 | SPEC-007 §16.2; SPEC-010 §10.2, §14.2                              | ADR-019 viewer-only first release                           |
| B-04 | Pattern-linked 3D (G5, S4), pattern-engine integration, external grading software import                                   | SPEC-010 Phase 4; SPEC-008 FR-TP-069                               | Needs pattern engine decision                               |
| B-05 | Cloth simulation with physical material parameters (3D-L4)                                                                 | SPEC-010 §13; SPEC-007 FR-EDT-115                                  | Needs validated material data                               |
| B-06 | AI geometry generation / image-to-vector reconstruction pipeline                                                           | SPEC-004 §8.1 `geometry_generation`; SPEC-010 FR-RV-043, FR-RV-069 | Separate capability with own validation                     |
| B-07 | Enterprise SSO (OIDC/SAML), SCIM provisioning, conditional access                                                          | SPEC-009 Phase 3, FR-SEC-029                                       | Confirm enterprise demand (OD-SEC-009)                      |
| B-08 | Custom roles UI (beyond predefined roles)                                                                                  | SPEC-009 FR-SEC-092, OD-SEC-005                                    | After baseline model proven                                 |
| B-09 | PLM / ERP / supplier-system integrations, versioned integration APIs                                                       | SPEC-008 FR-TP-171…173, Phase 4                                    | Customer-driven                                             |
| B-10 | Structured supplier change requests & substitution workflow                                                                | SPEC-008 FR-TP-174…175, OD-TP-007                                  | Start with comments (I43)                                   |
| B-11 | Multi-currency pricing & FX                                                                                                | SPEC-005 PRICE-007/008, Phase 3                                    | Launch single currency                                      |
| B-12 | Advanced pricing tiers, per-model pricing, profitability reporting, cost anomaly detection                                 | SPEC-005 Phase 3                                                   | After commercial beta data                                  |
| B-13 | Project-level and user-level budgets, spend approval workflows                                                             | SPEC-005 §18.1, Phase 3                                            | Org budgets first (I30)                                     |
| B-14 | Accounting-system integration / financial exports                                                                          | SPEC-005 §2.2                                                      | Out of scope v1                                             |
| B-15 | Artifact marketplace / cross-organization sharing                                                                          | SPEC-003 open decision 6, FR-SEC-118/221                           | Needs licensing policy                                      |
| B-16 | Data residency per organization                                                                                            | SPEC-004 §30.11, OD-SEC-014                                        | Infra-dependent                                             |
| B-17 | Model quality evaluation datasets, controlled rollouts, adaptive cost/quality routing                                      | SPEC-004 §27.4, Phase 4                                            | Needs usage data                                            |
| B-18 | Python processing service (segmentation, advanced CV)                                                                      | TECH §3.9                                                          | Only when a concrete requirement proves it                  |
| B-19 | Multi-stage / configurable approval workflows (sample-order gate)                                                          | SPEC-006 Phase 4, OD-PRJ-012                                       | Basic review first (I28)                                    |
| B-20 | Legal hold & enterprise retention policies UI                                                                              | SPEC-006 FR-PRJ-090, Phase 4                                       | Basic retention in I47                                      |
| B-21 | Mobile/tablet-optimized editor                                                                                             | SPEC-007 FR-EDT-007                                                | Desktop-first                                               |
| B-22 | Additional garment categories (dresses, trousers, kurta, outerwear…) with templates, POM libraries, construction templates | SPEC-003 §8.2; SPEC-008 OD-TP-001                                  | Template-driven; add per demand after ADR-008 set           |

## Deferred during the build

_(Append: date — source iteration — item — reason)_

- none yet
