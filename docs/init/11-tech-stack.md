# Garment Design Platform — Finalized Technology Stack and Implementation Plan

**Document ID:** TECH-GDP-001  
**Version:** 1.0  
**Status:** Approved baseline for implementation planning  
**Project Type:** Web-based AI-powered garment design and development platform  
**Backend Runtime:** Node.js  
**Primary Language:** TypeScript  
**Deployment Model:** Self-hosted  
**Initial Development Team:** Solo developer  
**Cloud Provider:** Undecided  
**Initial 3D Scope:** Interactive 3D garment model viewer

---

## 1. Project Overview

We are building a web-based, AI-powered garment design and development platform for apparel industry users, including merchandisers, manufacturers, brand owners, and business users who have visual taste but may not be professional designers or prompt engineers.

The platform will enable users to:

- Create and manage garment design projects.
- Start designs from sketches, fabric images, or reference garment photographs.
- Edit garments using visual controls rather than manually writing AI prompts.
- Manage reusable garment components and design artifacts.
- Generate and refine AI-assisted garment designs.
- View supported garment models in 2D and 3D.
- Maintain structured garment design definitions and revision history.
- Generate validated, versioned tech packs and production specifications.
- Track AI usage, subscription entitlements, and billing.

The application must prioritize visual interaction, traceability, structured design data, and production reliability.

The technology stack should support a solo developer initially while providing a clear path to scale.

## 2. Architectural Principles

The following principles are mandatory:

1. Use TypeScript throughout the frontend and backend wherever practical.
2. Use PostgreSQL as the primary system of record.
3. Keep the initial backend as a modular monolith.
4. Run background processing in separate worker processes.
5. Store uploaded and generated files in object storage rather than database rows.
6. Maintain a structured canonical garment model independent of rendered images.
7. Route all AI provider requests through centralized backend orchestration.
8. Make important operations, design revisions, and billing events traceable.
9. Prefer deterministic software operations over AI generation when possible.
10. Avoid unnecessary infrastructure and dependencies during the initial release.
11. Self-host the application using Docker Compose initially.
12. Design subsystem interfaces so independently scalable services can be introduced later.

---

## 3. Finalized Technology Stack

### 3.1 Frontend

**Primary technologies**

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Lucide React
- TanStack Query
- React Hook Form
- Zod

**Responsibilities**

- Application routing and page rendering.
- Project dashboard and project management.
- Visual garment editor.
- Component hierarchy and property panels.
- Artifact library and asset selection.
- Revision history and visual comparison.
- AI generation controls and job progress.
- Tech pack review and approval interfaces.
- User, organization, subscription, and administration screens.

The interface should feel like professional design software rather than a conventional CRUD website.

The editor should emphasize visual selection, drawing, property controls, drag-and-drop interactions, reusable components, and explicit generation actions.

Avoid invoking AI generation automatically after every property change.

### 3.2 Backend

**Primary technologies**

- Node.js LTS
- TypeScript
- NestJS
- REST APIs
- OpenAPI/Swagger
- Server-Sent Events (SSE) initially for generation progress

**Responsibilities**

- Authentication and authorization.
- Organization and membership management.
- Project lifecycle management.
- Garment design model and revision management.
- Artifact registry.
- Design operation execution.
- Prompt compilation and AI provider orchestration.
- Background job coordination.
- Asset management.
- Usage metering and subscription entitlements.
- Billing records and reconciliation.
- Tech pack generation and validation.
- Audit logging and administrative functions.

The backend must enforce authorization, input validation, usage limits, and business invariants. Frontend validation is not a substitute for backend validation.

Use REST for standard application operations. Introduce WebSockets only if bidirectional real-time collaboration or other requirements justify them.

### 3.3 Primary Database

**Technology: PostgreSQL**

PostgreSQL is the authoritative data store.

It should contain:

- Users and organizations.
- Memberships, roles, and permissions.
- Projects and project metadata.
- Garment design definitions.
- Design revisions and approval records.
- Garment component relationships.
- Artifact metadata and artifact revision references.
- Design operation records.
- AI generation job records.
- Asset metadata and provenance.
- Usage events and ledger entries.
- Subscription plans and entitlements.
- Billing and reconciliation records.
- Tech pack definitions, versions, and approvals.
- Audit events.

Use relational tables for entities and relationships that require integrity, querying, and transactional updates.

Use PostgreSQL JSONB for appropriate flexible properties, provider metadata, operation parameters, and versioned configuration structures.

Do not store large image files, video files, textures, or geometry binaries directly in PostgreSQL.

**ORM:** Prisma.

Use Prisma schema migrations and version-controlled migration files. Review migrations before applying them to production.

PostgreSQL transactions should protect operations such as revision creation, entitlement reservations, usage-ledger updates, and other consistency-sensitive workflows.

### 3.4 MongoDB Decision

MongoDB will not be included in the initial technology stack.

PostgreSQL JSONB provides sufficient flexibility for the expected semi-structured garment attributes, provider metadata, and design properties.

A second database would introduce additional deployment, backup, monitoring, consistency, and maintenance work.

MongoDB may be reconsidered only when a demonstrated access pattern or workload justifies it.

### 3.5 Caching and Background Jobs

**Technologies**

- Redis
- BullMQ
- ioredis

**Redis responsibilities**

- Caching suitable read-heavy data.
- Rate limiting and short-lived coordination.
- BullMQ queue infrastructure.
- Temporary job coordination and distributed concurrency controls.

**BullMQ responsibilities**

- Asynchronous AI generation.
- Image processing.
- Preview generation.
- Rendering jobs.
- Tech pack exports.
- Retryable background operations.
- Delayed jobs and controlled worker concurrency.

PostgreSQL remains the authoritative store for business job records, billing records, and durable operation history.

Redis must not become the only record of an important business operation.

Every important background job must have a persistent record containing its identity, operation type, status, source revision, relevant configuration, and result references.

Use idempotency keys and reconciliation logic to prevent duplicate business effects when jobs are retried.

Retries must account for the possibility that an external AI provider executed a request even if the response was lost.

### 3.6 Object Storage

Use an S3-compatible object storage system.

For self-hosted deployment, MinIO or another actively maintained S3-compatible implementation may be evaluated against current licensing, maintenance, and operational requirements.

The storage abstraction should allow another S3-compatible service to be adopted later without changing the garment domain model.

**Store the following in object storage:**

- Original garment reference images.
- Uploaded sketches and fabric photographs.
- Generated design images.
- Thumbnails and previews.
- SVG exports and technical drawings.
- Textures and material maps.
- Supported 3D model files such as GLB/glTF.
- Tech pack exports.
- Versioned project packages.
- Other large derived assets.

PostgreSQL should store object keys, ownership, MIME type, size, checksums, revision associations, provenance, and other relevant metadata.

Requirements:

- Private storage by default.
- Controlled access through short-lived signed URLs or an authenticated download service.
- File type and size validation.
- Safe image decoding and processing.
- Upload authorization.
- Version-aware asset references.
- Retention and deletion policies.
- Backup and recovery procedures.
- Separation of original assets from derived assets.

### 3.7 2D Editing

**Primary representation: SVG**

Use SVG for editable vector representations of garment flats, outlines, seams, component boundaries, annotations, and suitable artwork placements.

Use standard browser SVG functionality for path rendering, selection, and editable vector structures.

Evaluate Konva and React Konva for canvas-based interactions where they offer practical advantages, such as freehand drawing, selection overlays, drag handles, and region annotation.

Do not force every editor operation into a single rendering technology. SVG and canvas may coexist where appropriate.

The editor must maintain structured semantic garment data independently of the displayed SVG.

### 3.8 3D Viewing

**Technologies**

- Three.js
- React Three Fiber
- React Three Drei
- glTF/GLB model format

The initial 3D scope is an interactive viewer for supported 3D garment models.

Initial capabilities:

- Load supported GLB/glTF models.
- Rotate, zoom, and pan the camera.
- Display supported materials and textures.
- Support loading and error states.
- Allow selection of supported model variants where available.
- Associate a displayed model with a specific design revision.
- Provide clear indications of model provenance and representation limitations.

The first release does not promise:

- Automatic conversion of every AI-generated image into accurate 3D geometry.
- Production-ready garment patterns.
- Physically accurate cloth simulation.
- Pattern-linked garment construction.
- Manufacturing validation from a 3D preview alone.

A 3D viewer is a visualization component, not a garment geometry-generation engine.

### 3.9 Image Processing

**Primary library: Sharp**

Use Sharp for common image-processing operations such as:

- Resizing.
- Thumbnail generation.
- Image format conversion.
- Basic image optimization.
- Preparing supported derived previews.

Run expensive operations in background workers rather than blocking normal API requests.

If advanced segmentation, computer vision, or specialized geometry processing requires libraries that are substantially better supported in Python, introduce a separate Python processing service only when justified by an actual requirement.

The primary application backend remains Node.js and TypeScript.

### 3.10 Testing and Code Quality

**Recommended tools**

- Vitest or Jest for unit tests.
- Playwright for browser end-to-end tests.
- ESLint.
- Prettier.
- TypeScript strict mode.
- OpenAPI contract checks.
- Database integration tests.
- Docker-based development and test environments.

Testing must cover business rules, authorization, revision integrity, background jobs, billing idempotency, file access, and tech pack validation—not just UI rendering.

### 3.11 Logging and Observability

Use structured JSON logging and OpenTelemetry-compatible tracing and metrics.

Capture:

- API latency and error rates.
- Database query performance.
- Queue depth and job duration.
- AI provider latency and failures.
- AI usage and provider cost.
- Rendering and export failures.
- Storage errors.
- Authentication and authorization failures.
- Billing reconciliation discrepancies.

Never log passwords, authentication tokens, API keys, private file contents, or unnecessary personal data.

---

## 4. Monorepo Structure

Use pnpm and Turborepo for a TypeScript monorepo.

Recommended initial structure:

```text
garment-platform/
├── apps/
│   ├── web/
│   │   └── Next.js frontend
│   ├── api/
│   │   └── NestJS application
│   └── worker/
│       └── Background job consumers
│
├── packages/
│   ├── contracts/
│   │   └── Shared API schemas and contracts
│   ├── garment-model/
│   │   └── Canonical garment domain model
│   ├── design-operations/
│   │   └── Typed design operation definitions
│   ├── editor-core/
│   │   └── Shared editor logic
│   ├── render-contracts/
│   │   └── Rendering request and result contracts
│   ├── config/
│   │   └── Shared tooling configuration
│   └── test-utils/
│       └── Shared testing utilities
│
├── infra/
│   ├── docker/
│   ├── compose/
│   ├── proxy/
│   ├── scripts/
│   └── monitoring/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   └── deployment/
│
├── tests/
│   ├── integration/
│   └── end-to-end/
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

Do not create every package on the first day. Create the root structure and add packages when a real shared contract or domain boundary exists.

Avoid circular dependencies between packages.

The canonical garment model must not depend on React, NestJS, Prisma-specific runtime objects, or a particular AI provider.

---

## 5. Backend Module Boundaries

Implement the backend as a modular monolith with explicit module ownership.

Recommended logical modules:

1. Identity and Access.
2. Organization Management.
3. Project Lifecycle.
4. Garment Design Model.
5. Editor Operation API.
6. Artifact Registry.
7. Design Operation Router.
8. Prompt and Request Compilation.
9. AI Provider Orchestration.
10. Generation Job Management.
11. Rendering and Visualization.
12. Asset and Storage Management.
13. Validation and Quality.
14. Usage Metering.
15. Subscription and Billing.
16. Tech Pack and Production Specification.
17. Notifications.
18. Audit and Observability.
19. Platform Administration.

These are logical modules, not mandatory independent deployments.

Initially, most modules should execute in one NestJS application. Background processing should run in a separate worker process using shared domain and application contracts.

Extract a module into a separate service only when operational scaling, isolation, reliability, or team ownership provides a concrete benefit.

---

## 6. Canonical Garment Model and Revision Strategy

The structured garment design model is the canonical representation of the design.

Do not treat a PNG, JPEG, SVG preview, or 3D render as the only source of truth.

The model should represent, as appropriate:

- Garment identity and type.
- Design revision.
- Component hierarchy.
- Component properties.
- Component relationships.
- Artifact references.
- Material and trim references.
- Artwork placements.
- Geometric or visual references.
- Validation status.
- Provenance and confirmation state.
- Change history.

Use immutable design revisions or an equivalent revision-safe model.

Every generated preview or 3D representation must be associated with the source design revision and relevant processing configuration.

A change to an artifact must not silently alter previously approved designs that reference an earlier artifact revision.

The platform must distinguish among:

1. Structured design definition.
2. Rendered visual output.
3. Editable vector or 3D representation.
4. Production specifications.

AI-generated visual output must not automatically be treated as manufacturing-accurate geometry or a validated tech pack.

---

## 7. AI Execution Architecture

All AI requests must pass through the backend's central execution pipeline.

Recommended workflow:

1. Receive a user operation.
2. Validate authentication, authorization, and input.
3. Identify the target component or region.
4. Load the source design revision.
5. Build a structured design operation.
6. Validate compatibility, constraints, and dependencies.
7. Determine whether the operation can be completed by deterministic software.
8. If AI is required, compile a provider-specific request.
9. Check entitlements, budgets, and applicable usage limits.
10. Create a durable job and usage reservation where required.
11. Execute through the appropriate provider adapter.
12. Validate the result.
13. Store output assets and provenance.
14. Create or update the appropriate design revision.
15. Record usage and billing outcomes.
16. Notify the frontend of the job result.

AI provider credentials must remain server-side and must never be exposed to the browser or included in logs.

Support platform-managed credentials and customer-provided API credentials as distinct usage and billing modes.

Retries, unknown provider outcomes, and partial failures must be reconciled without silently creating duplicate charges.

---

## 8. Self-Hosted Deployment Architecture

Use Docker Compose for the initial deployment on a Linux server.

Recommended deployment components:

- Reverse proxy: Caddy or Nginx.
- Web application: Next.js.
- API: NestJS.
- Worker: BullMQ consumers.
- Database: PostgreSQL.
- Cache and queue: Redis.
- Object storage: S3-compatible service.
- Optional monitoring stack as operational needs grow.

Only the reverse proxy should be publicly accessible.

PostgreSQL, Redis, and object storage should be isolated on an internal network, with only the required service connections allowed.

Use:

- HTTPS.
- Persistent data volumes.
- Environment-specific configuration.
- Secrets supplied through a secure deployment mechanism.
- Database migrations.
- Health checks.
- Restart policies.
- Resource limits where appropriate.
- Off-server backups.
- Tested database and file restoration.
- Log rotation and disk monitoring.

Do not expose database ports or Redis ports to the public internet.

Do not store production secrets in Git.

A single server is acceptable for the initial deployment, but the design must permit the worker to be moved to another machine later.

The cloud provider remains undecided. The storage, database, and deployment abstractions should avoid unnecessary provider-specific dependencies.

---

## 9. Optimization Strategy

### 9.1 Database

- Add indexes based on query patterns.
- Use pagination for project, asset, and job listings.
- Avoid N+1 queries.
- Use transactions for consistency-sensitive operations.
- Monitor query latency.
- Avoid loading large JSONB documents when only a few fields are needed.
- Add read replicas only when measured workload requires them.

### 9.2 Cache

- Cache appropriate read-heavy data.
- Version or invalidate caches when source records change.
- Use immutable asset references for CDN or browser caching where applicable.
- Never rely on cached data as the final authority for permissions, entitlements, or billing.
- Establish cache size and expiration policies.

### 9.3 Editor

- Use thumbnails for gallery and project-list views.
- Load full-resolution assets only when necessary.
- Avoid unnecessarily rerendering the whole editor.
- Keep pointer interaction responsive.
- Use workers or background processing for expensive browser-side computation when justified.
- Preserve unchanged garment components during edits where the underlying representation permits it.

### 9.4 AI and Background Jobs

- Prefer deterministic operations over AI when feasible.
- Limit concurrent jobs per user, organization, and provider.
- Use timeouts and controlled retry policies.
- Deduplicate equivalent requests where safe.
- Cache only when inputs, model configuration, and permissions permit reuse.
- Track latency, failures, provider cost, and customer usage separately.

### 9.5 Initial Performance Targets

These are initial targets to validate with benchmarks, not guaranteed service levels:

| Operation | Initial target |
|---|---|
| Typical API response excluding heavy processing | p95 below 300 ms |
| Editor interaction feedback | p95 below 100 ms |
| Project initial load excluding large media transfer | p95 below 2.5 seconds |
| Job status update visibility | Usually below 2 seconds |
| AI generation | Asynchronous, with operation-specific targets |

Benchmark with realistic garment assets, concurrent users, long revision histories, and representative background workloads.

---

## 10. Security and Reliability Requirements

The implementation must include:

- Secure authentication and account recovery.
- Organization-level authorization.
- Server-side permission enforcement.
- Secure session management.
- Private file storage.
- Upload validation and processing safeguards.
- Rate limiting.
- Protection against unauthorized object access.
- Audit logging for security-sensitive operations.
- Credential isolation.
- Database backup and recovery.
- Durable job records.
- Idempotent billing and usage operations.
- Provider outcome reconciliation.
- Revision integrity.
- Export access controls.
- Explicit confirmation of unverified production specifications.

Security must be implemented across the application rather than delegated entirely to the frontend or reverse proxy.
