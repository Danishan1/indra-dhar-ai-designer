# 03 — Consolidated Domain Model

Logical entity catalog merged from SPEC-GDP-003, 004, 005, 006, 008, 009, 010. It tells each iteration **which module owns which table** and which vocabularies to use. Field lists are the minimum; iterations may add fields. All tenant tables include `id (uuidv7)`, `organization_id`, `created_at`, `created_by`, `updated_at`, `updated_by`, and `schema_version` where they hold versioned JSON.

---

## 1. Shared vocabularies (put in `packages/contracts` / `garment-model`)

| Vocabulary                 | Values                                                                                                                                                                                                                                           | Source                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| Value status               | `confirmed`, `inferred`, `proposed`, `missing`, `needs_review`, `not_applicable`                                                                                                                                                                 | SPEC-003 §9.2                     |
| Value source type          | `user_input`, `user_confirmation`, `uploaded_image`, `uploaded_document`, `artifact_revision`, `ai_job`, `imported_data`, `measurement_record`, `external_system`, `template`, `formula`, `none`                                                 | SPEC-003 §9.3, SPEC-008 §13       |
| Validation finding outcome | `valid`, `warning`, `error`, `not_evaluated`, `requires_manual_review`                                                                                                                                                                           | SPEC-003 §15.3                    |
| Finding severity           | `blocking`, `warning`, `info`                                                                                                                                                                                                                    | SPEC-006 FR-PRJ-067, SPEC-008 §21 |
| Project status             | `ACTIVE`, `ON_HOLD`, `COMPLETED`, `ARCHIVED`, `DELETED`                                                                                                                                                                                          | SPEC-006 §7.1                     |
| Design status              | `DRAFT`, `IN_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `SUPERSEDED`, `CANCELLED`                                                                                                                                                                 | SPEC-006 §7.2                     |
| Readiness (derived)        | `NOT_CHECKED`, `BLOCKED`, `READY_WITH_WARNINGS`, `READY`                                                                                                                                                                                         | SPEC-006 FR-PRJ-072               |
| Review decision            | `APPROVE`, `REQUEST_CHANGES`, `REJECT`                                                                                                                                                                                                           | SPEC-006 FR-PRJ-054               |
| Approval type              | `design_review`, `sample_review`, `production_spec_review`, `production_release`                                                                                                                                                                 | SPEC-006 §6.5                     |
| Operation status           | `requested`, `running`, `completed`, `failed`, `cancelled`                                                                                                                                                                                       | SPEC-003 OPR-003                  |
| Execution strategy         | `deterministic_model_update`, `vector_operation`, `rule_based_composition`, `render_only`, `image_interpretation`, `text_to_image`, `image_to_image`, `targeted_image_edit`, `multimodal_reasoning`, `geometry_generation`, `composite_pipeline` | SPEC-004 §8.1                     |
| AI job state               | `queued`, `preparing`, `submitted`, `running`, `awaiting_provider`, `normalizing`, `validating`, `awaiting_review`, `succeeded`, `failed`, `cancel_requested`, `cancelled`, `outcome_unknown`                                                    | SPEC-004 §14.3                    |
| Result application mode    | `candidate_only`, `apply_structured_changes`, `attach_representation`, `require_user_approval`, `reject_result`                                                                                                                                  | SPEC-004 §16.2                    |
| Credential ownership mode  | `platform_managed`, `customer_provided`, `not_applicable`                                                                                                                                                                                        | SPEC-004 §18, SPEC-005 §7         |
| Usage lifecycle            | `reserved`, `observed`, `pending_reconciliation`, `settled`, `adjusted`, `released`, `disputed`                                                                                                                                                  | SPEC-005 §8.2                     |
| Measurement source         | `provider_reported`, `internally_measured`, `estimated`, `derived`                                                                                                                                                                               | SPEC-005 §7.1                     |
| Cost status                | `estimated`, `provider_reported`, `reconciled`, `adjusted`, `unknown`                                                                                                                                                                            | SPEC-005 §13.2                    |
| Subscription status        | `trial`, `active`, `renewal_pending`, `past_due`, `suspended`, `cancelled`, `expired`, `pending_plan_change`                                                                                                                                     | SPEC-005 §9.3                     |
| Payment status             | `pending`, `processing`, `succeeded`, `failed`, `requires_action`, `partially_refunded`, `refunded`, `disputed`                                                                                                                                  | SPEC-005 §17.2                    |
| Account status             | `pending_verification`, `active`, `suspended`, `locked`, `deletion_pending`, `deleted_or_anonymized`                                                                                                                                             | SPEC-009 FR-SEC-004               |
| Membership status          | `invited`, `active`, `suspended`, `revoked`, `expired`                                                                                                                                                                                           | SPEC-009 §10.2                    |
| Spec lifecycle             | `not_created`, `draft`, `in_progress`, `needs_review`, `changes_requested`, `validated`, `approved`, `released`, `superseded`, `withdrawn`                                                                                                       | SPEC-008 §7.1                     |
| Tech-pack export status    | `DRAFT`, `GENERATING`, `VALIDATION_FAILED`, `READY_FOR_REVIEW`, `APPROVED_FOR_RELEASE`, `RELEASED`, `SUPERSEDED`, `CANCELLED`                                                                                                                    | SPEC-006 §7.4                     |
| Render job state           | `created`, `queued`, `resolving_inputs`, `building_geometry`, `rendering`, `validating`, `completed`, `completed_with_warnings`, `failed`, `cancel_requested`, `cancelled`, `expired`                                                            | SPEC-010 §16.1                    |
| Representation fidelity    | `F0`…`F4`                                                                                                                                                                                                                                        | SPEC-003 §13.2                    |
| Geometry capability        | `G0`…`G6`                                                                                                                                                                                                                                        | SPEC-010 §10.2                    |
| 3D capability level        | `3D-L0`…`3D-L4`                                                                                                                                                                                                                                  | SPEC-007 §16.2                    |
| Sync level                 | `S0`…`S4`                                                                                                                                                                                                                                        | SPEC-010 §14.2                    |
| Data classification        | `public`, `internal`, `confidential`, `restricted`                                                                                                                                                                                               | SPEC-009 §14.3                    |

> **Note:** SPEC-006 uses UPPERCASE states while SPEC-004/005/008 use lowercase. Keep each vocabulary exactly as its spec writes it (see `02-conventions.md` §2).

## 2. Entities by owning module

### identity / organizations / authorization (SS-01) — I05–I08, I47

| Entity                             | Key fields                                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `User`                             | email (normalized, unique), display_name, status, email_verified_at, last_login_at                                            |
| `IdentityCredential`               | user_id, type (`password`,`passkey`,`totp`,`oidc`), provider, secret material (hashed), status                                |
| `Session`                          | user_id, token_hash, issued_at, last_seen_at, idle_expires_at, absolute_expires_at, revoked_at, auth_assurance, ip/ua summary |
| `VerificationToken`                | purpose (`email_verify`,`password_reset`,`invitation`,`mfa_recovery`), token_hash, expires_at, consumed_at                    |
| `Organization`                     | display_id, name, slug, status, owner_policy, settings JSONB                                                                  |
| `Workspace`                        | organization_id, name, status (optional scope, ADR-017)                                                                       |
| `Membership`                       | organization_id, user_id, status, invited_by, joined_at                                                                       |
| `Invitation`                       | organization_id, email, proposed_role_ids, token_hash, expires_at, accepted_at, cancelled_at                                  |
| `Role`                             | name, scope_type, is_system_role, organization_id (null for system)                                                           |
| `Permission`                       | key (`project.edit`), resource_type, action                                                                                   |
| `RolePermission`, `MembershipRole` | joins (MembershipRole has scope_id)                                                                                           |
| `ResourceGrant`                    | resource_type, resource_id, recipient (user/external), actions[], grantor, expires_at, revoked_at                             |
| `ApiToken`                         | principal_id, token_hash, scopes, expires_at, revoked_at, last_used_at (I47)                                                  |
| `ServiceIdentity`                  | name, owner_id, scopes, status (I47)                                                                                          |
| `SecurityPolicy`                   | organization_id, version, config JSONB (MFA required, session timeouts, SoD rules)                                            |

### audit (SS-17) — I03, I46

| `AuditEvent` | event_type, actor_type, actor_id, organization_id, resource_type, resource_id, action, outcome, reason_code, request_id, policy_version, metadata JSONB (redacted), occurred_at — **append-only** |

### platform (cross-cutting) — I03

| `OutboxEvent` | type, schema_version, payload JSONB, organization_id, correlation_id, causation_id, available_at, published_at, attempts |
| `ProcessedEvent` | consumer, event_id (unique pair) |
| `IdempotencyKey` | key, principal_id, route, request_hash, status, response_snapshot, expires_at |
| `IdSequence` | organization_id, entity_prefix, next_value |

### assets (SS-11) — I09

| `Asset` | display_id, asset_type, storage_key, media_type, size_bytes, checksum_sha256, dimensions JSONB, provenance JSONB (`source_type`, `source_entity_id`, job/attempt refs), is_derived, parent_asset_id, classification, status (`pending_upload`,`quarantined`,`ready`,`rejected`,`deleted`), retention_until |

### projects / reviews (SS-02) — I10, I12, I28

| `Project` | display_id, name, status, metadata JSONB (season, brand, category, market), default_design_id, archived_at, deleted_at, version |
| `ProjectMember` (optional, if project-level grants) | via `ResourceGrant` |
| `ReviewRequest` | design_id, revision_id, purpose/approval_type, status, submitted_by, policy_version |
| `ReviewDecision` / `ApprovalRecord` | review_request_id, revision_id, approval_type, decision, decided_by, comments, policy_version, revoked_at, revoked_by, revocation_reason |
| `ReviewComment` | review_request_id, target (component_id / region / general), body, author |
| `LifecycleEvent` | via `AuditEvent` + outbox |

### designs (SS-03) — I11, I12

| `Design` | project_id, display_id, name, garment_type, status, head_revision_id, approved_revision_id, working_copy_id |
| `WorkingCopy` | design_id, base_revision_id, state JSONB (canonical garment state), version (int), last_modified_by, pending_ops JSONB |
| `DesignRevision` | design_id, display_id (`DSN-…-R003`), revision_number, parent_revision_ids uuid[], snapshot JSONB (immutable), content_hash, artifact_revision_refs uuid[], source_asset_refs uuid[], change_summary, validation_summary JSONB, operation_ids uuid[], schema_version |
| `Representation` | design_revision_id (or working copy version), representation_type, format, asset_id, generation_method, fidelity (`F0`…), geometry_capability, is_authoritative_design_state=false, render_manifest_id |
| `Annotation` | design_id, revision_id?, component_id?, kind (`design`,`review`,`guide`), geometry JSONB with coordinate_space, body |

The **canonical garment state** (inside `WorkingCopy.state` and `DesignRevision.snapshot`) is defined by zod schemas in `packages/garment-model`: `GarmentDesignState { schemaVersion, garmentType, components[], relationships[], artifactBindings[], placements[], metadata, provenance }` with `DesignComponent { componentId, componentType, displayName, parentComponentId, side, properties: Record<key, PropertyValue>, geometryRefs, assetRefs, tags, locked, visible }` and `DesignRelationship { relationshipId, type, source, target, placement, constraints, status, provenanceRefs }`.

### artifacts (SS-05) — I13

| `Artifact` | display_id (`SLV-0007`), artifact_type, category, name, owner_scope (`platform`,`organization`,`user`,`project`), owner_id, current_revision_id, lifecycle_status (`active`,`deprecated`,`deactivated`), tags |
| `ArtifactRevision` | artifact_id, display_id (`SLV-0007-R004`), revision_number, parent_revision_id, definition JSONB (compatible targets, placement regions, geometry refs, preview refs, 3D refs), properties JSONB (PropertyValue envelopes; visual vs physical separated), validation_status, geometry_capability — **immutable** |
| `CompatibilityRule` / `Constraint` | scope JSONB, rule JSONB, severity, version |

### operations (SS-06) — I14, I25

| `DesignOperation` | display_id (`OPR-…`), operation_type, design_id, base_revision_id, base_working_copy_version, target_entities JSONB, requested_changes JSONB, preservation_constraints JSONB, source_refs, execution_policy, execution_strategy, strategy_rationale, status, result_revision_id, result_working_copy_version, job_id, idempotency_key, requested_by |

### jobs (SS-09) — I21

| `Job` | display_id (`JOB-…`), kind (`ai_generation`,`render`,`export`,`interpretation`,`reconciliation`…), operation_id, design_id, base_revision_id/base_working_copy_version, status, substatus, credential_ownership_mode, provider_id, model_id, compilation_record_id, output_asset_ids, validation JSONB, review_required, correlation_id, failure JSONB, timestamps (queued/submitted/started/completed) |
| `JobAttempt` | job_id, attempt_number, provider_request_id, provider_job_id, idempotency_key, status, outcome (`success`,`failure`,`unknown`), error_category, started_at, ended_at, usage_ref |
| `Candidate` | job_id, operation_id, output_asset_id, source_revision_id / working_copy_version, status (`available`,`applied`,`rejected`,`stale`), application_mode, applied_by, applied_at |

### ai-providers / compilation (SS-07, SS-08) — I22, I23, I33

| `AiProvider` | key, name, integration_type, status, data_handling JSONB, error_mappings JSONB |
| `AiModelProfile` | provider_id, model_key, provider_model_identifier, task_types[], input/output modalities, constraints JSONB, capabilities JSONB (with support status: verified/documented/configured/unknown), cost_metadata JSONB, availability_status, profile_version — **versioned rows** |
| `RoutingPolicy` | scope (platform/org), rules JSONB, version |
| `ProviderCredential` | owner_scope (`platform`,`organization`), organization_id?, provider_id, secret_ref, masked_hint, status (`active`,`invalid`,`revoked`), last_validated_at |
| `SecretRecord` | ciphertext, wrapped_dek, key_version, created_at (accessible only by secrets service) |
| `PromptTemplate` | task_type, version, template body, output schema, status |
| `CompilationRecord` | operation_id, job_id, task_type, template_version, mapping_version, profile_version, intermediate_request JSONB (redacted per policy), input_asset_refs with roles, created_at — **immutable** |

### metering (SS-13) — I24, I34

| `UsageEvent` | idempotency_key (unique), organization_id, actor_id, project_id, operation_id, job_id, attempt_id, usage_category, quantity, unit, credential_ownership_mode, provider_id, model_id, measurement_source, raw_metrics JSONB, occurred_at, recorded_at — **append-only** |
| `UsageReservation` | operation/job ref, category, quantity/credits, amount_minor?, status (`active`,`settled`,`released`,`expired`), expires_at |
| `UsageLedgerEntry` | entry_type (`reserve`,`release`,`observe`,`settle`,`adjust`,`dispute`), reservation_id?, usage_event_id?, quantity, credits, references original entry for adjustments — **append-only** |
| `ProviderCostRecord` | attempt_id, provider_id, model_id, ownership_mode, metrics, amount (Decimal), currency, cost_status, pricing_source |
| `AllowanceBalance` (projection) | organization_id, period, category/credits, granted, consumed, reserved — rebuildable from ledger |

### billing (SS-14) — I24 (lite), I30–I32

| `Plan` / `PlanVersion` | plan key; version: price, interval, entitlements JSONB (features, allowances, concurrency, models, overage policy), effective_from — **immutable versions** |
| `Subscription` | organization_id, plan_version_id, status, current_period_start/end, trial_ends_at, cancel_at, pending_plan_version_id |
| `BillingAccount` | organization_id, currency, billing email, tax info ref, payment_customer_ref |
| `CreditConversionSchedule` | version, mapping (operation class → credits) |
| `PricingEntry` | pricing_version, provider/model?, usage_category, unit, currency, rate/method JSONB, ownership_mode, effective_from/to, rounding |
| `Budget` | scope (org/project/user), currency, period, hard_limit, soft_threshold, policy JSONB |
| `Charge` | billing_account_id, category, basis refs (usage settlement ids / subscription), pricing_version, amount_minor, currency, status |
| `Invoice` / `InvoiceLine` | number, period, status (`draft`,`issued`,`paid`,`void`), totals; lines reference charges — **issued invoices immutable** |
| `CreditNote` / `Adjustment` | type, reason, original refs, amount, authorized_by |
| `PaymentAttempt` | invoice_id, provider_ref, status, amount, webhook_event_ids |
| `PaymentWebhookEvent` | provider_event_id (unique), payload hash, processed_at |

### validation (SS-12) — I20, I41

| `ConstraintSet` | key, version, rules JSONB, applies_to (garment types) |
| `ValidationRun` | target_type (`working_copy`,`revision`,`spec_revision`), target_id/version, rule_set_version, status, started/completed, is_stale |
| `ValidationFinding` | run_id, rule_id, severity, outcome, entity refs, message, recommended_resolution, blocking, resolution_status, resolved_by, exception_id |
| `ValidationException` | finding ref, reason, scope, approved_by, expires_at |

### rendering (SS-10) — I16, I35–I37

| `RenderProfile` | key, version, purpose, params JSONB, fidelity limitations — **versioned** |
| `RenderJob` | via `Job` (kind=`render`) + render-specific fields |
| `RenderManifest` | source_design_id, source_revision_id / working_copy_version, representation_type, geometry_capability, sync_level, profile id+version, render_method, artifact_revision_refs, outputs [{format, asset_id}], validation_status, cache_key |
| `Model3DAsset` | design_id/artifact_revision_id, asset_id (GLB), capability level, component node mapping JSONB |

### techpack (SS-15) — I38–I44

| `ProductionSpecification` | display_id (`TPS-…`), project_id, design_id, style identity JSONB, lifecycle status, current_revision_id, released_revision_id |
| `SpecificationRevision` | spec_id, display_id (`TPS-…-R03`), revision_number, source_design_revision_id, template_revision_id, schema_version, content JSONB (sections), validation_status, validation_run_id, status — editable while `draft`/`in_progress`; frozen at `approved` |
| `SpecTemplate` / `SpecTemplateRevision` | category, sections, field definitions, rule-set ref, export layout — **versioned** |
| Section records (inside revision JSONB or normalized tables): `Colorway`, `BOMItem`, `MaterialSpecification`, `MeasurementPoint` (POM), `MeasurementValue`, `ToleranceRule`, `GradeRule`, `ConstructionInstruction`, `ArtworkPlacement`, `LabelSpecification`, `PackagingSpecification`, `QualityRequirement`, `EvidenceReference` — each value uses the `PropertyValue` envelope |
| `PomLibrary` | category, POM definitions (id, name, definition, method, diagram ref), version |
| `ReviewDecision` (spec) | reuse reviews module with `approval_type=production_spec_review` |
| `ReleaseRecord` | spec_revision_id, manifest JSONB (design rev, artifact revs, rule-set version, template version, export ids), released_by, released_at, superseded_by, withdrawn_at, withdrawal_reason |
| `ExportArtifact` | spec_revision_id, format, template_version, asset_id, checksum, status, watermark, generated_by, generated_at — **released exports immutable** |
| `DistributionGrant` | release_record_id, recipient, scope, expires_at, revoked_at, access log |

### notifications (SS-16) — I29

| `Notification` | recipient_user_id, organization_id, type, payload (no secrets), source_event_id (unique per recipient), read_at |
| `NotificationDelivery` | notification_id, channel (`in_app`,`email`), status, attempts, last_error |
| `NotificationPreference` | user_id, type, channels |

### admin (SS-18) — I45

| `FeatureFlag`, `PlatformSetting` (versioned), `PlatformOperatorAccessGrant` (break-glass: operator, org, scope, justification, expires_at, approved_by) |

## 3. Ownership rule of thumb

If you need data owned by another module, **call its service** (synchronous read) or **subscribe to its events** (asynchronous projection). Projections you build (e.g. `AllowanceBalance`) must be rebuildable from the owner's authoritative records.

## 4. Permission catalog — planned master list (ADR-033)

Implemented in `packages/contracts/src/permissions.ts` starting in I07. Iterations add keys when they add endpoints; keep this list in sync (it is the planning view, the code is authoritative once written).

| Resource                                                       | Actions                                                                                                                                                                                                                                                                                                                                                   | Introduced in                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `organization`                                                 | `view`, `update`, `transfer_ownership`, `export`, `delete`                                                                                                                                                                                                                                                                                                | I06/I07 (`export`, `delete` used in I47) |
| `members`                                                      | `view`, `invite`, `manage`, `manage_roles`                                                                                                                                                                                                                                                                                                                | I06/I07                                  |
| `roles`                                                        | `view`, `manage`                                                                                                                                                                                                                                                                                                                                          | I07                                      |
| `security_policy`                                              | `manage`                                                                                                                                                                                                                                                                                                                                                  | I08                                      |
| `audit`                                                        | `view`, `export`                                                                                                                                                                                                                                                                                                                                          | I08 / I46                                |
| `api_tokens`                                                   | `manage`                                                                                                                                                                                                                                                                                                                                                  | I47                                      |
| `project`                                                      | `view`, `create`, `edit`, `archive`, `delete`, `manage_access`                                                                                                                                                                                                                                                                                            | I10                                      |
| `asset`                                                        | `view`, `upload`, `delete`                                                                                                                                                                                                                                                                                                                                | I09                                      |
| `design`                                                       | `view`, `create`, `edit`, `commit`, `restore`, `generate`, `export`, `submit_review`, `approve`, `revoke_approval`                                                                                                                                                                                                                                        | I12 / I14 / I25 / I28 / I35              |
| `review`                                                       | `view`, `comment`                                                                                                                                                                                                                                                                                                                                         | I28                                      |
| `artifact`                                                     | `view`, `use`, `create`, `edit`, `publish`, `delete`                                                                                                                                                                                                                                                                                                      | I13                                      |
| `operation`                                                    | `submit`, `view`                                                                                                                                                                                                                                                                                                                                          | I14                                      |
| `job`                                                          | `view`, `cancel`                                                                                                                                                                                                                                                                                                                                          | I21                                      |
| `validation`                                                   | `view`, `run`, `override`                                                                                                                                                                                                                                                                                                                                 | I20                                      |
| `usage`                                                        | `view`                                                                                                                                                                                                                                                                                                                                                    | I24                                      |
| `billing`                                                      | `view`, `manage`                                                                                                                                                                                                                                                                                                                                          | I30                                      |
| `budget`                                                       | `manage`                                                                                                                                                                                                                                                                                                                                                  | I30                                      |
| `credentials`                                                  | `view`, `manage`                                                                                                                                                                                                                                                                                                                                          | I33                                      |
| `notifications`                                                | `manage` (own preferences are implicit)                                                                                                                                                                                                                                                                                                                   | I29                                      |
| `techpack`                                                     | `view`, `create`, `edit`, `view_costing`, `submit_review`, `review`, `approve`, `approve_exception`, `release`, `withdraw`, `distribute`, `export`                                                                                                                                                                                                        | I38–I43                                  |
| `platform.*` (operator scope only, never granted by org roles) | `platform.ai.manage`, `platform.ai.inspect`, `platform.billing.manage`, `platform.billing.adjust`, `platform.billing.refund`, `platform.pricing.manage`, `platform.finance.view`, `platform.finance.reconcile`, `platform.catalog.manage`, `platform.settings.manage`, `platform.security.manage`, `platform.support.view`, `platform.breakglass.request` | I22, I30–I34, I45                        |

Plan **feature entitlements** (e.g. `ai.generate`, `ai.interpret`, `3d.viewer`) are _not_ permissions — they live in plan versions (I24/I30) and are checked by the preflight in addition to the user's permission.

## 5. Entities introduced by later iterations (not listed above)

| Entity                                                                                          | Module                   | Iteration                              |
| ----------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------- |
| `OrganizationAiPolicy` (allowed providers/models, fallback consent, data-handling restrictions) | ai-providers             | I33                                    |
| `SpecSuggestion` (AI-proposed spec values with provenance, accept/reject state)                 | techpack                 | I44                                    |
| `ImpactAssessment` (design change → affected spec sections)                                     | techpack                 | I43                                    |
| `DistributionAccessLog`                                                                         | techpack                 | I43                                    |
| `ExportArtifact.locked_at` (released export lock)                                               | techpack                 | I42/I43                                |
| `DeletionRequest`, `LegalHold`, `OrgExportRequest`                                              | admin / organizations    | I47                                    |
| `FeatureFlagOverride`, `AdminChangeRequest`, `PlatformOperator`                                 | admin                    | I45                                    |
| Principal type `external_supplier` (restricted guest)                                           | identity / authorization | I43 (model must allow it from I05–I07) |
