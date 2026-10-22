# Editor Interaction and Visualization Specification

**Document ID:** SPEC-GDP-007\
**Version:** 0.1\
**Status:** Initial Draft\
**Product:** AI-Powered Garment Design and Development Platform\
**Parent Architecture Document:** ARCH-GDP-002 v0.1 — Subsystem Requirements Breakdown and Dependency Specification

**Related Specifications:**

- SPEC-GDP-003 — Garment Design Model and Artifact Schema Specification
- SPEC-GDP-004 v0.1 — AI Execution, Prompt Compilation, and Provider Integration Specification
- SPEC-GDP-005 v0.1 — AI Usage Metering, Subscription, and Billing Specification
- SPEC-GDP-006 v0.1 — Project Lifecycle and Design Versioning Specification

---

## 1. Purpose

This document defines the functional, interaction, visualization, and integration requirements for the garment design editor.

The editor is the primary working environment of the platform. It must provide a visual-first experience that enables apparel merchandisers, manufacturers, brand owners, product developers, and other users to create and refine garment designs without requiring professional design software expertise or prompt-engineering skills.

The editor must support the progression from source references to a structured garment design through direct manipulation, contextual controls, reusable design artifacts, AI-assisted generation, comparison, and revision management.

The interface should feel like a professional visual design application rather than a conventional form-based website. It must provide enough structure for technical work without overwhelming users who primarily communicate their design intent visually.

## 2. Scope

This specification covers:

- Editor workspace layout.
- Project and design context.
- Canvas and viewport management.
- 2D visualization and technical-flat interaction.
- 3D visualization where supported by the product's geometry capabilities.
- Component hierarchy and selection.
- Contextual property editing.
- Source-image, fabric, artwork, and sketch handling.
- Drawing, region selection, and annotations.
- Reusable artifact discovery and attachment.
- AI generation and targeted editing controls.
- Operation status and result application.
- Revision comparison and history access.
- Undo, redo, autosave, and recovery.
- Validation and production-readiness indicators.
- Accessibility and usability.
- Integration contracts with the garment model, execution router, rendering system, and lifecycle subsystem.

This document defines the editor's expected behavior and subsystem boundaries. It does not prescribe a specific frontend framework, graphics library, AI model, or 3D simulation engine.

---

## 3. Design principles

### 3.1 Design visually, not through prompts

Users MUST be able to perform common design tasks through selection, direct manipulation, structured controls, and visual references.

Natural-language instructions MAY be offered as an optional input method. The platform MUST NOT require users to write prompts to perform routine operations.

### 3.2 Structured state is the source of truth

The editor MUST operate on the canonical garment design model defined in SPEC-GDP-003.

Rendered images are visual representations of that model, not the sole authoritative design record.

Where the editor supports only raster-based manipulation for a particular operation, it MUST identify any limitations in structural editability or precision.

### 3.3 User intent must be explicit

Changing a property should update the working design state without automatically triggering an expensive AI generation operation unless the user has explicitly enabled such behavior for that operation.

AI generation MUST ordinarily require an explicit user action.

### 3.4 Preserve existing work

Operations MUST identify their intended targets and avoid unintentionally changing unrelated garment components.

The system SHOULD support preservation constraints, localized edits, and change comparison. It MUST NOT promise perfect pixel-level preservation when the underlying AI model or image representation cannot guarantee it.

### 3.5 Separate editing from approval

A visually complete canvas does not imply that the design is approved or production-ready.

The editor MUST clearly distinguish the working state, saved state, committed revision, approved revision, and production-readiness status.

### 3.6 Progressive complexity

The editor SHOULD expose common actions directly while placing advanced controls in contextual panels or expandable sections.

Technical capabilities SHOULD remain available without requiring every user to understand their underlying implementation.

### 3.7 Clear operation feedback

Users MUST understand what is selected, what will change, whether changes are saved, whether a generation job is running, and whether an operation failed.

---

## 4. Subsystem responsibilities

The editor interaction subsystem (SS-04) owns the user-facing interaction model, selection state, viewport state, interaction history, and translation of user gestures into structured operation requests.

It does not own the canonical garment schema, AI provider execution, billing decisions, or final production validation.

| Subsystem                                   | Responsibility                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| SS-02 Project Lifecycle                     | Supplies project state, working-copy identity, revision history, and approval information.                     |
| SS-03 Garment Design Model                  | Defines components, properties, relationships, constraints, and canonical design state.                        |
| SS-04 Editor Interaction                    | Manages user interactions, selection, panels, canvas tools, local interaction history, and operation requests. |
| SS-05 Artifact Registry                     | Supplies searchable artifacts, artifact revisions, compatibility data, and attachment operations.              |
| SS-06 Design Operation and Execution Router | Validates and routes structured design operations.                                                             |
| SS-07 Prompt and Request Compilation        | Compiles provider requests from validated operation context.                                                   |
| SS-08 AI Provider and Orchestration         | Coordinates AI providers and execution policies.                                                               |
| SS-09 Generation Job Management             | Tracks asynchronous jobs and their outcomes.                                                                   |
| SS-10 Rendering and Visualization           | Produces 2D views, previews, comparisons, and supported 3D visualization.                                      |
| SS-11 Asset and Storage                     | Stores source images, generated assets, design attachments, and render outputs.                                |
| SS-12 Validation and Quality                | Evaluates design consistency, supported geometry constraints, and production readiness.                        |
| SS-13 Usage Metering                        | Records attributable AI usage.                                                                                 |
| SS-14 Subscription and Billing              | Enforces applicable entitlements, quotas, and spending controls.                                               |
| SS-17 Audit and Observability               | Records relevant actions, errors, and operation provenance.                                                    |

The editor MUST communicate through the defined subsystem contracts rather than directly calling external AI provider APIs.

---

## 5. Editor workspace layout

### 5.1 Recommended workspace structure

The editor SHOULD provide the following logical regions:

1. **Application header:** Project name, design name, save status, revision information, and primary actions.
2. **Tool and action bar:** Selection, drawing, annotation, view controls, undo, redo, comparison, and generation actions.
3. **Component hierarchy panel:** Garment structure, component visibility, selection, and component-level actions.
4. **Central viewport:** Main interactive design canvas with 2D, reference, comparison, or supported 3D views.
5. **Contextual properties panel:** Editable properties for the selected component, region, artifact, or design.
6. **Asset and artifact browser:** Source assets, fabrics, trims, lace, embroidery, reusable components, and user libraries.
7. **Operation and history area:** Generation progress, validation findings, operation history, and revision access.
8. **Status area:** Selection information, zoom, view mode, save status, and relevant validation or warning indicators.

The implementation MAY collapse, resize, or reposition panels according to screen size and user preferences.

### 5.2 Layout requirements

**FR-EDT-001 — Workspace layout**

The editor MUST provide a dedicated design workspace with a central viewport and contextual editing controls.

**FR-EDT-002 — Resizable panels**

The editor SHOULD allow users to resize or collapse major side panels.

**FR-EDT-003 — Persistent workspace preferences**

The editor SHOULD preserve user preferences such as panel visibility, preferred viewport mode, and zoom behavior between sessions where appropriate.

**FR-EDT-004 — Project context**

The editor MUST display enough project and design context to prevent users from accidentally editing the wrong project or garment.

**FR-EDT-005 — Save status**

The editor MUST visibly distinguish saving, saved, unsaved, save-failed, and conflict states.

**FR-EDT-006 — Primary action hierarchy**

The editor MUST make the primary user actions easy to locate, including saving or committing work, generating a design, comparing results, and submitting a revision for review where authorized.

**FR-EDT-007 — Responsive layout**

The editor MUST adapt to supported screen sizes. Full professional editing functionality MAY be optimized for desktop or tablet-sized displays, but unsupported screen sizes MUST degrade predictably.

**FR-EDT-008 — Panel independence**

Opening or closing a contextual panel MUST NOT unintentionally modify the garment design.

---

## 6. Editor modes and viewport management

### 6.1 Supported viewport modes

The editor SHOULD support the following modes, depending on available design representations:

| Mode           | Purpose                                                                         |
| -------------- | ------------------------------------------------------------------------------- |
| Reference      | Display source sketches, images, or inspiration assets.                         |
| 2D design      | Display the garment design as an editable or inspectable 2D representation.     |
| Technical flat | Display technical line drawings or vector representations where available.      |
| 3D preview     | Display a three-dimensional representation when supported by suitable geometry. |
| Split view     | Show multiple synchronized representations simultaneously.                      |
| Comparison     | Compare two revisions or candidate outputs.                                     |
| Annotation     | Emphasize selected regions, measurements, comments, or review findings.         |

The system MUST distinguish a true editable technical flat from a raster image that merely resembles one.

Similarly, a rendered image of a garment in perspective MUST NOT be represented as a fully editable 3D garment model unless the underlying data supports the claimed interactions.

### 6.2 Viewport requirements

**FR-EDT-009 — View switching**

The user MUST be able to switch between supported viewport modes without losing the working design state.

**FR-EDT-010 — Zoom and pan**

The viewport MUST support zoom and pan for applicable 2D and 3D representations.

**FR-EDT-011 — Fit to view**

The editor MUST provide a command to fit the current design or selected content within the viewport.

**FR-EDT-012 — View reset**

The editor SHOULD provide a way to reset viewport orientation, zoom, and pan to a defined default.

**FR-EDT-013 — View state isolation**

Changing zoom, pan, camera orientation, or panel arrangement MUST NOT alter garment dimensions or component properties.

**FR-EDT-014 — Synchronized views**

Where synchronized 2D and 3D representations are supported, the system SHOULD propagate supported design changes to the corresponding views.

**FR-EDT-015 — Representation availability**

If a particular representation is unavailable, the editor MUST explain why and offer the nearest valid alternative.

**FR-EDT-016 — Viewport performance**

The editor SHOULD maintain responsive navigation for designs within the agreed complexity limits. Expensive rendering operations MAY execute asynchronously.

**FR-EDT-017 — Display fidelity**

The editor MUST distinguish visual approximations, preview renders, technical geometry, and production-validated representations where those distinctions affect user decisions.

---

## 7. Selection and component hierarchy

### 7.1 Component hierarchy

The component hierarchy represents the structured garment model rather than an arbitrary list of image layers.

A hierarchy might include:

- Garment body.
  - Front panel.
  - Back panel.
  - Sleeves.
    - Left sleeve.
    - Right sleeve.
    - Cuffs.
  - Collar.
  - Placket.
  - Pockets.
  - Hem.
  - Applied trim or decoration.

Actual component structure MUST follow the canonical garment schema and may vary by garment type.

### 7.2 Selection behavior

**FR-EDT-018 — Hierarchy display**

The editor MUST display supported garment components in a navigable hierarchy.

**FR-EDT-019 — Component selection**

Users MUST be able to select a component from the hierarchy or directly from the viewport when the representation supports hit-testing.

**FR-EDT-020 — Selection synchronization**

Selecting a component in one supported view MUST update its selection in other synchronized views and the contextual properties panel.

**FR-EDT-021 — Selection feedback**

Selected components MUST have a clear visual indication that does not permanently alter the underlying garment appearance.

**FR-EDT-022 — Multi-selection**

The editor SHOULD support multi-selection where operations on multiple components are valid.

**FR-EDT-023 — Visibility controls**

The editor SHOULD allow users to hide or show supported components for inspection and comparison.

**FR-EDT-024 — Locking**

The editor SHOULD support locking components against accidental manipulation. Lock state MUST be distinguished from actual design geometry or material properties.

**FR-EDT-025 — Component identity**

The editor MUST use stable component identifiers supplied by the garment model rather than relying only on display names or canvas coordinates.

**FR-EDT-026 — Missing geometry**

If a component exists in the structured model but cannot be directly selected in the current view, the editor MUST allow selection through the hierarchy and explain relevant interaction limitations.

**FR-EDT-027 — Unsupported operation feedback**

If a selected component cannot support a requested operation, the editor MUST explain the limitation rather than silently applying the operation to a different component.

---

## 8. Contextual property editing

### 8.1 Property model

The properties panel MUST expose properties supported by the selected component and its schema.

Examples include:

- Color and colorway.
- Fabric or material reference.
- Sleeve type and length.
- Collar type.
- Cuff construction or style.
- Pocket type and placement.
- Placket configuration.
- Trim, lace, embroidery, and artwork attachment.
- Supported component dimensions.
- Placement, scale, and orientation.
- Visibility and presentation settings.
- User annotations and confirmation status.

Not every property is available for every component or representation.

### 8.2 Functional requirements

**FR-EDT-028 — Contextual properties**

The properties panel MUST change according to the selected component, region, or design-level context.

**FR-EDT-029 — Schema-backed controls**

Property controls MUST reflect the valid data types, constraints, and permitted values defined by the garment model.

**FR-EDT-030 — Input validation**

Invalid values MUST be rejected or visibly flagged before they are committed to the canonical working state.

**FR-EDT-031 — Immediate state feedback**

When a property change is accepted, the editor MUST update the working-state representation and indicate whether a render refresh is pending.

**FR-EDT-032 — No implicit AI execution**

Ordinary property changes MUST NOT trigger an external AI generation call unless the user explicitly initiates the relevant generation action or has deliberately enabled a documented automation.

**FR-EDT-033 — Dependent properties**

When a property change affects dependent properties or relationships, the editor MUST apply the garment model's dependency rules and identify any unresolved conflicts.

**FR-EDT-034 — Confirmed versus inferred values**

The editor MUST distinguish user-confirmed values from AI-inferred or suggested values for production-relevant properties.

**FR-EDT-035 — Property provenance**

Where a property has meaningful provenance, the editor SHOULD expose whether it originated from user input, source interpretation, a reusable artifact, an external data source, or an AI suggestion.

**FR-EDT-036 — Bulk editing**

The editor MAY support bulk property changes for compatible multi-selected components. The operation MUST disclose its scope before applying consequential changes.

**FR-EDT-037 — Reset property**

The editor SHOULD allow a property to be restored to a valid prior or default value when the schema defines such a value.

**FR-EDT-038 — Incompatible change handling**

If a property change would violate a design constraint, the editor MUST either prevent the change, offer a valid resolution, or record the unresolved conflict according to the validation policy.

---

## 9. Drawing, region selection, and annotation

### 9.1 Purpose

Drawing and annotation tools allow users to express localized design intent without requiring detailed prompt writing.

Supported interactions may include:

- Freehand drawing.
- Brush or highlight strokes.
- Rectangle, polygon, or lasso region selection.
- Point placement.
- Boundary or placement guides.
- Text notes.
- Arrows and measurement annotations.
- Mask creation for localized AI editing.
- Region-specific references.

The availability of each tool depends on the current representation and editing task.

### 9.2 Functional requirements

**FR-EDT-039 — Drawing tools**

The editor SHOULD provide configurable drawing and annotation tools appropriate to the current viewport.

**FR-EDT-040 — Region selection**

Where supported, users MUST be able to define a region for a localized operation using direct selection or drawing tools.

**FR-EDT-041 — Coordinate mapping**

The editor MUST translate viewport coordinates into the appropriate underlying coordinate space before persisting a geometry-dependent operation.

**FR-EDT-042 — Annotation persistence**

Saved annotations MUST be associated with a design, revision, component, or review record as appropriate.

**FR-EDT-043 — Annotation separation**

Review comments and visual guides MUST be distinguishable from actual garment geometry and production specifications.

**FR-EDT-044 — Editable annotations**

Where supported, annotations MUST remain independently editable and removable without altering unrelated design geometry.

**FR-EDT-045 — Region provenance**

A region-based operation MUST retain a reference to its target region, component, or source image coordinates.

**FR-EDT-046 — Mask preview**

Before a localized AI operation is submitted, the editor SHOULD display the intended mask or target region when supported by the operation.

**FR-EDT-047 — Region limitations**

If a region cannot be mapped reliably to the underlying design model, the editor MUST communicate that the operation may be image-based rather than structurally precise.

**FR-EDT-048 — Annotation export**

The system SHOULD allow applicable annotations to be included in review exports while keeping internal editor guides separate from released production documents unless explicitly selected.

---

## 10. Asset and artifact browser

### 10.1 Source assets

The editor MUST support attaching or inspecting relevant source materials, including:

- Sketches.
- Reference garment images.
- Fabric images.
- Artwork and prints.
- Embroidery references.
- Trim and lace images.
- Measurement sheets and technical documents.
- Generated candidate images.

The asset browser MUST distinguish original source assets from generated outputs and derived previews.

### 10.2 Reusable artifact discovery

The Artifact Registry may provide reusable sleeves, collars, cuffs, pockets, plackets, lace borders, embroidery designs, fabrics, and other components.

Each artifact displayed as a reusable design resource SHOULD include:

- Name and thumbnail.
- Stable artifact identifier.
- Version or revision.
- Artifact type.
- Available preview or supported representation.
- Compatibility indicators.
- Ownership or sharing information, where relevant.

### 10.3 Functional requirements

**FR-EDT-049 — Asset browsing**

The editor MUST allow users to browse assets available to the current project and user according to permissions.

**FR-EDT-050 — Artifact search**

The editor SHOULD support filtering artifacts by category, name, attributes, tags, and compatibility.

**FR-EDT-051 — Artifact preview**

Users MUST be able to inspect an artifact's available visual representations before attaching it.

**FR-EDT-052 — Compatibility feedback**

The editor MUST communicate whether an artifact is compatible with the selected component and placement.

**FR-EDT-053 — Structured attachment**

Attaching a reusable artifact MUST create a structured reference and relationship in the garment model where supported. The operation MUST NOT be implemented solely as an unexplained flattened-image replacement when structured attachment is available.

**FR-EDT-054 — Placement controls**

Where the artifact and target support placement properties, users MUST be able to configure position, orientation, scale, alignment, or other applicable placement attributes.

**FR-EDT-055 — Artifact version pinning**

A design revision MUST reference the exact artifact revision used, consistent with SPEC-GDP-003 and SPEC-GDP-006.

**FR-EDT-056 — Artifact replacement**

Replacing an attached artifact MUST be treated as an explicit design operation with a clear target and resulting change.

**FR-EDT-057 — User-created artifacts**

Where supported by permissions, users SHOULD be able to save a selected component or supported region as a reusable artifact.

**FR-EDT-058 — Ownership and reuse rights**

The editor MUST respect artifact ownership, access restrictions, and applicable reuse permissions.

**FR-EDT-059 — Unavailable artifact**

If an artifact becomes unavailable, the editor MUST preserve the revision's reference and communicate the limitation. It MUST NOT silently substitute a different artifact.

---

## 11. AI-assisted design interaction

### 11.1 User interaction model

The editor MUST present AI as an operation that the user initiates and controls, not as an opaque automatic response to every interaction.

Examples of supported actions include:

- Generate design.
- Regenerate selected component.
- Refine selected region.
- Apply selected fabric reference.
- Explore alternative colorways.
- Generate variations.
- Render a supported 3D preview.
- Compare generated candidates.

Available actions MUST reflect the current representation, permissions, model capabilities, and configured usage entitlements.

### 11.2 Operation request construction

When a user initiates an AI operation, the editor MUST submit a structured request containing, as applicable:

- Project and design identifiers.
- Current working-copy or base revision identifier.
- Expected working-copy version.
- Target component, region, or full design scope.
- Requested operation type.
- Structured property changes.
- Source asset references.
- Artifact revision references.
- Preservation constraints.
- Selected output representation.
- Relevant user-authored instruction, if provided.
- Idempotency or correlation identifier.

The editor MUST NOT construct provider-specific API calls directly.

### 11.3 Functional requirements

**FR-EDT-060 — Explicit generation action**

The editor MUST provide a clear user action for initiating generation or other billable AI work.

**FR-EDT-061 — Operation scope**

Before execution, the editor MUST make the target scope sufficiently clear, particularly when an operation may affect the full garment rather than a selected component.

**FR-EDT-062 — Generation configuration**

The editor SHOULD expose understandable configuration choices such as style direction, variation count, or output mode when those options are supported.

**FR-EDT-063 — Internal prompt compilation**

The platform MUST handle prompt compilation and provider-specific request construction internally. Users MUST NOT be required to understand internal prompt templates or provider parameters.

**FR-EDT-064 — Cost and entitlement feedback**

Where usage or spending limits are relevant, the editor MUST display applicable warnings or entitlement restrictions before the operation is submitted, based on information supplied by the orchestration and billing subsystems.

**FR-EDT-065 — Submission status**

The editor MUST distinguish an operation that is being submitted from one that has been accepted by the job-management subsystem.

**FR-EDT-066 — Generation progress**

The editor MUST display the current known status of asynchronous jobs, including queued, running, completed, failed, cancelled, or outcome-unknown states where applicable.

**FR-EDT-067 — Candidate isolation**

Generated outputs MUST initially be treated as candidate results unless the operation contract explicitly supports a safe, validated direct update.

**FR-EDT-068 — Compare before apply**

The editor SHOULD allow users to compare a generated candidate with the current design before applying it.

**FR-EDT-069 — Selective application**

Where output structure supports it, users SHOULD be able to apply selected changes rather than replacing the entire design.

**FR-EDT-070 — Preservation constraints**

The operation request SHOULD include explicit preservation constraints for components or regions that must remain unchanged.

**FR-EDT-071 — Preservation limitations**

The editor MUST communicate that image-based generation may alter details outside the intended region and cannot guarantee exact preservation where the underlying method lacks that capability.

**FR-EDT-072 — Result validation**

The editor MUST present validation findings supplied by the relevant subsystem before a generated result is accepted into the canonical working state when validation is required.

**FR-EDT-073 — Failed result recovery**

A failed generation MUST leave the prior valid working state intact.

**FR-EDT-074 — Retry control**

Users SHOULD be able to retry eligible failed operations. The system MUST avoid accidental duplicate submissions and must respect job and billing idempotency rules.

**FR-EDT-075 — Stale result protection**

If the working-copy state changes while a job is running, the editor MUST detect stale results and prevent silent overwriting of newer work.

**FR-EDT-076 — Operation history**

The editor SHOULD expose the relevant history of generation operations, their inputs, outputs, statuses, and application decisions.

**FR-EDT-077 — Candidate provenance**

Each generated candidate MUST retain references to the source design state, operation, relevant job, and output asset.

**FR-EDT-078 — Provider abstraction**

The user-facing editor MUST remain functional when the underlying AI provider changes, provided the replacement provider supports the required operation contract.

---

## 12. Undo, redo, and interaction history

### 12.1 Command-based editing

The editor SHOULD represent supported edits as reversible commands or structured operations rather than relying exclusively on raw canvas snapshots.

Examples include:

- Change a property.
- Attach or detach an artifact.
- Move a supported component.
- Change a supported placement value.
- Add or remove an annotation.
- Apply an approved candidate result.
- Change a supported colorway property.

Not every external AI operation can be reversed by undoing the provider call. In such cases, undo must restore the prior local design state or create a compensating operation.

### 12.2 Functional requirements

**FR-EDT-079 — Undo**

The editor MUST provide undo for supported local design operations.

**FR-EDT-080 — Redo**

The editor MUST provide redo for supported operations that have been undone.

**FR-EDT-081 — Operation grouping**

The editor SHOULD group related low-level actions into meaningful undo steps so users do not need to undo dozens of individual pointer movements.

**FR-EDT-082 — Undo scope**

Undo MUST NOT silently delete committed historical revisions or reverse an already recorded approval or released deliverable.

**FR-EDT-083 — AI result undo**

Applying a generated candidate MUST create a recoverable state transition. The user MUST be able to restore the previous working state without repeating the generation job when the previous state remains available.

**FR-EDT-084 — Undo history boundary**

The editor MUST indicate when an action cannot be undone through local history and provide the appropriate alternative, such as restoring a prior revision.

**FR-EDT-085 — Undo with collaboration**

When other users have changed the same working state, undo MUST NOT silently revert their changes. The system MUST use concurrency-aware behavior or require conflict resolution.

---

## 13. Autosave, recovery, and persistence feedback

**FR-EDT-086 — Autosave**

The editor SHOULD autosave eligible working-copy changes after an appropriate interval or operation boundary.

**FR-EDT-087 — Durable acknowledgment**

The editor MUST distinguish local pending changes from changes confirmed as persisted by the server.

**FR-EDT-088 — Offline or interrupted state**

If the connection is lost, the editor MUST indicate that persistence cannot currently be confirmed and preserve recoverable local changes where supported.

**FR-EDT-089 — Reconnection recovery**

After reconnection, the editor MUST reconcile local pending changes with the latest server state and MUST NOT blindly overwrite concurrent changes.

**FR-EDT-090 — Recovery prompts**

If multiple recoverable states exist, the editor MUST allow the user to inspect or select a recovery option where feasible.

**FR-EDT-091 — Persistence failure**

A failed save MUST produce actionable feedback. The editor SHOULD provide a retry mechanism and preserve the user's work in a recoverable form where feasible.

**FR-EDT-092 — Revision commit indicator**

The editor MUST distinguish an autosaved working copy from a committed design revision.

---

## 14. Revision comparison and review interface

### 14.1 Comparison modes

The editor SHOULD support:

- Side-by-side visual comparison.
- Overlay comparison with adjustable opacity where useful.
- Component/property difference lists.
- Artifact replacement and attachment differences.
- Annotation and review-comment differences.
- Validation result comparison.
- Comparison between a generated candidate and the current working state.

### 14.2 Functional requirements

**FR-EDT-093 — Select comparison targets**

Users MUST be able to select two compatible revisions or supported candidate outputs for comparison.

**FR-EDT-094 — Difference classification**

The system SHOULD distinguish structural changes, property changes, artifact changes, annotation changes, and visual-only differences.

**FR-EDT-095 — Comparison alignment**

Where visual comparison is supported, the system SHOULD align views using stable component identities or appropriate view registration.

**FR-EDT-096 — Review context**

When viewing a revision under review, the editor MUST identify the exact revision and relevant review status.

**FR-EDT-097 — Comments and findings**

The editor SHOULD display review comments and validation findings alongside the relevant component or region when such associations are available.

**FR-EDT-098 — Approval action**

The editor MUST expose approval or change-request actions only to authorized users and only when the relevant review workflow permits the action.

**FR-EDT-099 — Approval clarity**

The interface MUST distinguish the latest committed revision from the latest approved revision.

---

## 15. Visualization and rendering subsystem integration

### 15.1 Rendering responsibilities

SS-10 Rendering and Visualization is responsible for generating the visual representation of structured design state.

The editor MUST request rendering through supported internal interfaces. It MUST NOT assume that every property change requires AI generation.

The rendering subsystem SHOULD distinguish:

- Fast local or deterministic preview updates.
- Server-side 2D rendering.
- Technical-flat rendering.
- Image-based AI generation.
- 3D scene rendering.
- Cloth simulation or other computationally expensive physical visualization, if supported.

### 15.2 Functional requirements

**FR-EDT-100 — Rendering request**

The editor MUST identify the design state and requested representation when requesting a render.

**FR-EDT-101 — Render version binding**

A render result MUST identify the design revision or working-copy version from which it was produced.

**FR-EDT-102 — Stale render handling**

If a render completes for an outdated working-copy version, the editor MUST NOT present it as the current state without an explicit stale indicator.

**FR-EDT-103 — Render caching**

The rendering subsystem SHOULD cache reusable outputs where the inputs and rendering configuration are equivalent.

**FR-EDT-104 — Render failure**

Rendering failure MUST NOT invalidate the canonical design state. The editor MUST communicate the failure and provide a retry path when appropriate.

**FR-EDT-105 — Preview labeling**

The editor MUST identify approximate, incomplete, or low-fidelity previews when their limitations could mislead the user.

**FR-EDT-106 — Render quality selection**

Where multiple quality levels are supported, the editor SHOULD allow a responsive preview mode and a higher-quality output mode.

**FR-EDT-107 — View synchronization**

The editor SHOULD refresh dependent views after a successful state update, but MUST retain stable interaction state when a refresh is possible without resetting selection or camera position.

---

## 16. 2D and 3D visualization requirements

### 16.1 2D requirements

The editor MUST support a clear 2D workspace for inspecting and editing supported garment properties.

Where a structured vector representation is available, the editor SHOULD support vector-aware selection, zooming, and editing.

The system MUST distinguish:

- Structured vector geometry.
- Raster image layers.
- Rendered previews.
- Annotation overlays.

Raster-only content MUST NOT be described as structurally editable vector geometry.

### 16.2 3D capability levels

The implementation MUST identify which 3D capability level is available for each design or garment category.

| Level | Description                                                                          | Permitted claim                                             |
| ----- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| 3D-L0 | Perspective or AI-generated garment image                                            | 3D-looking visual only                                      |
| 3D-L1 | Navigable 3D scene or approximate mesh                                               | Interactive 3D visualization                                |
| 3D-L2 | Editable garment geometry with supported component relationships                     | Editable 3D design within declared limits                   |
| 3D-L3 | Pattern-linked garment geometry with defined material and construction relationships | Pattern-linked visualization within validated scope         |
| 3D-L4 | Validated cloth simulation with defined physical parameters and calibration          | Physical simulation within the validated operating envelope |

The levels are capability classifications, not a guarantee that every garment supports all levels.

### 16.3 Functional requirements

**FR-EDT-108 — 3D capability disclosure**

The editor MUST indicate the supported 3D capability level where that distinction is material to user expectations.

**FR-EDT-109 — 3D navigation**

For interactive 3D scenes, the editor MUST support the applicable camera controls, including orbit, pan, and zoom.

**FR-EDT-110 — 3D selection**

Where editable geometry is available, the editor SHOULD support selecting components in the 3D view and synchronizing the selection with the component hierarchy.

**FR-EDT-111 — 2D/3D consistency**

Where both views share an editable canonical model, supported changes MUST be reflected consistently across the views.

**FR-EDT-112 — Unsupported synchronization**

If a property is not represented or editable in one view, the editor MUST communicate the limitation rather than imply full synchronization.

**FR-EDT-113 — Physical validity claims**

The system MUST NOT claim accurate cloth behavior, manufacturing feasibility, or pattern correctness merely because a garment has been rendered in 3D.

**FR-EDT-114 — Geometry provenance**

Editable 3D geometry SHOULD retain its source, version, and transformation history.

**FR-EDT-115 — Simulation parameters**

Where physical simulation is supported, the interface MUST distinguish confirmed physical material parameters from illustrative or inferred parameters.

**FR-EDT-116 — 3D failure isolation**

A 3D rendering or simulation failure MUST NOT invalidate the canonical garment design or its saved 2D state.

---

## 17. Validation and quality feedback

The editor must make validation results understandable and actionable.

Validation may include:

- Missing required component properties.
- Invalid component relationships.
- Incompatible artifacts.
- Out-of-range values.
- Unsupported geometry.
- Conflicting placement constraints.
- Missing or unconfirmed production data.
- Outdated approval or readiness status.
- Incomplete rendering or generation output.

### Functional requirements

**FR-EDT-117 — Inline validation**

The editor SHOULD display relevant validation findings near the affected property or component.

**FR-EDT-118 — Validation summary**

The editor MUST provide an aggregated view of current validation findings.

**FR-EDT-119 — Severity display**

The editor MUST distinguish blocking errors, warnings, and informational findings.

**FR-EDT-120 — Finding navigation**

Where a finding identifies a component or region, the user SHOULD be able to navigate to that location from the finding.

**FR-EDT-121 — Stale validation**

The editor MUST identify validation results that no longer apply to the current working-copy version or the relevant production specification.

**FR-EDT-122 — Actionable messages**

Validation messages SHOULD explain the issue, its impact, and a practical resolution when known.

**FR-EDT-123 — AI suggestion labeling**

AI-generated recommendations MUST be visibly identified as suggestions until the user or an authorized process confirms them.

**FR-EDT-124 — No false readiness**

The editor MUST NOT present a design as production-ready solely because the visual rendering is complete or because no editor-level visual errors were detected.

---

## 18. Keyboard, accessibility, and usability

**FR-EDT-125 — Keyboard access**

The editor MUST support keyboard access for essential navigation, selection, save, undo, redo, and applicable dialog actions.

**FR-EDT-126 — Shortcuts**

Common actions SHOULD have configurable or documented keyboard shortcuts, including save, undo, redo, zoom, and fit-to-view.

**FR-EDT-127 — Shortcut conflicts**

The editor MUST avoid triggering canvas shortcuts when the user is typing in a text input or an editable property field.

**FR-EDT-128 — Accessible controls**

Interactive controls MUST expose accessible names, state, focus indication, and appropriate semantics.

**FR-EDT-129 — Color-independent feedback**

Selection, validation, and status indicators MUST NOT rely on color alone.

**FR-EDT-130 — Error recovery**

Errors MUST be communicated in understandable language and SHOULD offer a recovery action.

**FR-EDT-131 — Confirmation for consequential actions**

Operations that replace large portions of a design, discard unsaved work, overwrite a working state, or initiate substantial billable work SHOULD provide a clear scope and confirmation where appropriate.

**FR-EDT-132 — Learnability**

The interface SHOULD use recognizable visual conventions, contextual help, tooltips, and progressive disclosure rather than requiring users to learn internal system terminology.

**FR-EDT-133 — Screen reader support**

Core editor controls and status changes SHOULD be exposed through accessible semantics and announcements appropriate to the interface technology.

---

## 19. Security and permissions

**FR-EDT-134 — Server-side authorization**

All mutations initiated through the editor MUST be authorized by the backend. Hiding a control in the UI is not sufficient security enforcement.

**FR-EDT-135 — Tenant isolation**

The editor MUST NOT expose another tenant's designs, assets, artifacts, revisions, or operation results.

**FR-EDT-136 — Artifact permissions**

The editor MUST respect artifact ownership and reuse permissions when browsing, attaching, or saving reusable components.

**FR-EDT-137 — AI credential isolation**

Provider credentials MUST NOT be sent to the browser or exposed in editor state, network payloads, error messages, or logs.

**FR-EDT-138 — Secure asset access**

Asset access MUST use authorized retrieval mechanisms and respect applicable access expiry and sharing rules.

**FR-EDT-139 — Sensitive annotations**

Internal comments, confidential annotations, and review discussions MUST follow project permissions and must not be included in external exports by default unless explicitly configured.

**FR-EDT-140 — Auditability**

Significant editor actions, including design operation submission, candidate application, revision commit, and approval-related commands, MUST be attributable through the platform's audit mechanisms.

---

## 20. Editor interaction state model

The editor SHOULD maintain a distinct interaction state separate from the canonical garment model.

Recommended state categories include:

| State category | Example values                                  | Persisted as design data?                        |
| -------------- | ----------------------------------------------- | ------------------------------------------------ |
| Selection      | Selected component IDs                          | Usually no                                       |
| Viewport       | Zoom, pan, camera orientation                   | Usually no                                       |
| Tool           | Select, draw, annotate, region mask             | No                                               |
| Working design | Component properties and relationships          | Yes, through working-copy persistence            |
| Local history  | Undo/redo stack                                 | Session-dependent; may be persisted for recovery |
| Operation      | Queued, running, failed, completed              | Operation/job records are persisted separately   |
| Candidate      | Generated output awaiting review or application | Candidate assets and provenance are persisted    |
| Validation     | Current findings and validation version         | Validation records are persisted separately      |
| Review         | Review target and decision status               | Persisted by lifecycle subsystem                 |
| Save state     | Pending, saved, failed, conflict                | Derived from persistence state                   |

The editor MUST NOT persist temporary selection or viewport state as though it were part of the garment's physical design unless the relevant setting is explicitly part of the design schema.

---

## 21. Logical interaction architecture

```
flowchart TD
    U[User Interaction]
    UI[Editor Interaction Layer]
    SM[Local Selection and View State]
    DM[Canonical Garment Design Model]
    OR[Design Operation Router]
    AI[AI Orchestration]
    JOB[Generation Job Manager]
    REN[Rendering and Visualization]
    VAL[Validation and Quality]
    LC[Project Lifecycle]
    AS[Asset and Artifact Services]

    U --> UI
    UI <--> SM
    UI --> DM
    UI --> OR
    OR --> DM
    OR --> AS
    OR --> AI
    AI --> JOB
    JOB --> REN
    DM --> REN
    DM --> VAL
    VAL --> UI
    REN --> UI
    UI --> LC
    LC --> UI
```

This diagram represents logical responsibilities rather than mandatory deployment boundaries.

### 21.1 Interaction flow

For a structured local edit:

1. The user selects a component.
2. The editor resolves its stable component identifier.
3. The user changes a supported property.
4. The editor validates the input locally where possible.
5. The editor submits a structured state update with the expected working-copy version.
6. The backend validates permissions and canonical model constraints.
7. The working copy is persisted.
8. The editor updates save status and refreshes dependent views.

For an AI-assisted edit:

1. The user selects the target component or region.
2. The editor collects the intended operation and preservation constraints.
3. The editor submits a structured operation request.
4. The execution router validates the request and invokes the relevant orchestration path.
5. The job manager tracks execution.
6. Candidate outputs are stored and validated.
7. The editor presents results and limitations.
8. The user selects a candidate or applies supported changes.
9. The resulting working state is persisted and can be committed as a new revision.

---

## 22. Error handling and recovery

The editor MUST handle at least the following error categories:

| Error                                   | Required behavior                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| Save failure                            | Preserve recoverable changes, display unsaved status, offer retry.                        |
| Concurrent modification                 | Stop unsafe overwrite, expose conflict-resolution options.                                |
| Invalid property                        | Identify the property and explain the accepted range or valid values when available.      |
| Unsupported operation                   | Explain the limitation and offer a compatible alternative when possible.                  |
| Artifact unavailable                    | Preserve current state and identify the unavailable dependency.                           |
| Generation failure                      | Keep the prior valid state and expose the job status.                                     |
| Generation timeout with unknown outcome | Avoid blind resubmission; resolve status through the job manager.                         |
| Stale candidate                         | Allow inspection or explicit compatible application; never overwrite newer work silently. |
| Render failure                          | Preserve design state and offer a render retry.                                           |
| 3D initialization failure               | Retain access to supported 2D or alternative representations.                             |
| Validation failure                      | Display findings and preserve the design.                                                 |
| Permission failure                      | Explain that the action is not authorized without exposing restricted data.               |
| Asset upload failure                    | Preserve other editor state and provide upload retry where supported.                     |

The editor MUST distinguish an operation that failed before execution from an operation whose external outcome is unknown. This distinction is especially important for billable AI jobs.

---

## 23. Non-functional requirements

### 23.1 Performance

**NFR-EDT-001** — The editor SHOULD respond to ordinary selection and panel interactions within 100 milliseconds at the 95th percentile under the agreed reference workload, excluding network-dependent operations.

**NFR-EDT-002** — Local, deterministic property changes SHOULD update the interactive view within 250 milliseconds at the 95th percentile for supported design complexity.

**NFR-EDT-003** — AI generation and complex server-side rendering MUST be asynchronous when execution may exceed the normal interactive response budget.

**NFR-EDT-004** — The editor SHOULD preserve responsive navigation while generation or rendering jobs are running.

**NFR-EDT-005** — Asset and artifact browsing SHOULD support pagination, lazy loading, and thumbnail optimization for large libraries.

These are initial engineering targets, subject to validation against the selected rendering technology and supported garment complexity.

### 23.2 Reliability

**NFR-EDT-006** — Failure of a visualization subsystem MUST NOT corrupt the canonical design state.

**NFR-EDT-007** — Editor retries MUST respect operation idempotency and concurrency preconditions.

**NFR-EDT-008** — The editor MUST preserve or recover user changes to the extent supported by the persistence architecture.

### 23.3 Scalability

**NFR-EDT-009** — The editor SHOULD support garments with configurable component counts and asset sizes without requiring hard-coded garment-specific UI layouts.

**NFR-EDT-010** — Rendering, AI execution, and asset loading SHOULD be independently scalable where operationally necessary.

### 23.4 Compatibility

**NFR-EDT-011** — The editor MUST use versioned contracts for design state, operation requests, rendering results, and validation findings.

**NFR-EDT-012** — Schema or renderer changes MUST NOT silently reinterpret a historical revision in a way that changes its authoritative design meaning.

### 23.5 Observability

**NFR-EDT-013** — Errors and long-running operations SHOULD expose correlation identifiers that support diagnosis without revealing sensitive data.

**NFR-EDT-014** — The platform SHOULD measure interaction latency, save failures, conflict rates, generation submission failures, stale-result frequency, rendering failures, and user-visible recovery outcomes.

---

## 24. Recommended API and event contracts

The implementation MAY use REST, GraphQL, command-based APIs, or equivalent mechanisms. The following logical operations MUST be supported.

| Operation                | Purpose                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `GetEditorState`         | Retrieve working design state and relevant lifecycle metadata. |
| `UpdateWorkingCopy`      | Persist a structured edit with concurrency control.            |
| `GetComponentProperties` | Retrieve schema-backed properties for a component.             |
| `GetArtifactLibrary`     | Retrieve accessible reusable artifacts and versions.           |
| `AttachArtifact`         | Attach an artifact revision to a supported target.             |
| `DetachArtifact`         | Remove an existing structured attachment.                      |
| `CreateAnnotation`       | Create a design or review annotation.                          |
| `UpdateAnnotation`       | Update an editable annotation.                                 |
| `RequestRender`          | Request a supported visualization.                             |
| `SubmitDesignOperation`  | Submit a structured operation to the execution router.         |
| `GetOperationStatus`     | Retrieve operation or generation-job status.                   |
| `GetCandidateResult`     | Retrieve a generated candidate and its provenance.             |
| `ApplyCandidate`         | Apply an accepted candidate or compatible set of changes.      |
| `UndoWorkingOperation`   | Reverse a supported local operation.                           |
| `RedoWorkingOperation`   | Reapply an undone supported operation.                         |
| `CompareDesignStates`    | Compare two supported revisions or candidates.                 |
| `GetValidationFindings`  | Retrieve current applicable validation findings.               |
| `CommitRevision`         | Commit the working state as an immutable revision.             |

Mutating requests SHOULD include:

- Tenant and project context, derived securely where possible.
- Design and working-copy identifiers.
- Expected working-copy version.
- Operation identifier.
- Idempotency key where retry duplication is possible.
- Structured operation payload.
- Correlation identifier.

The backend MUST validate authorization, state constraints, and canonical schema rules independently of client-side checks.

### 24.1 Suggested events

The editor integration SHOULD support events such as:

- `WorkingCopyUpdated`
- `WorkingCopyConflictDetected`
- `ArtifactAttached`
- `ArtifactDetached`
- `DesignOperationSubmitted`
- `GenerationJobStatusChanged`
- `CandidateResultAvailable`
- `CandidateApplied`
- `RenderCompleted`
- `RenderFailed`
- `ValidationFindingsUpdated`
- `RevisionCommitted`

Consumers MUST tolerate duplicate event delivery and MUST use identifiers and version information to reject stale state updates.

---

## 25. Testing requirements

Testing MUST include unit, integration, end-to-end, usability, performance, accessibility, and failure-recovery scenarios.

### 25.1 Core functional tests

- Selecting a component updates the contextual properties panel.
- A valid property change updates the working state.
- An invalid property value is rejected or flagged.
- Attaching a reusable artifact creates a structured relationship where supported.
- A local property change does not automatically invoke an AI provider.
- A generation request includes the correct target component, design state, and preservation constraints.
- A generated candidate is not automatically treated as approved.
- Applying a candidate creates a recoverable state transition.
- Undo and redo behave correctly for supported operations.
- Revision comparison distinguishes structural changes from visual-only differences.
- Stale generation results do not overwrite newer working-copy changes.
- A render failure does not invalidate the design.
- A save conflict is detected and handled without silent data loss.
- Production-readiness warnings remain distinct from visual-rendering status.
- User permissions are enforced by the backend.

### 25.2 Visual regression tests

The system SHOULD test stable rendering outputs for representative designs and supported render configurations.

Visual regression tests MUST account for intentional differences caused by renderer version changes, nondeterministic AI outputs, and supported device-specific rendering behavior.

A visual mismatch MUST NOT automatically be treated as a canonical design-model mismatch.

### 25.3 Accessibility tests

Testing SHOULD verify:

- Keyboard navigation.
- Focus management.
- Accessible names and control states.
- Dialog behavior.
- Non-color-only validation and status indicators.
- Keyboard shortcut behavior within text fields.
- Accessible status announcements for important asynchronous operations.

### 25.4 Failure injection

The test suite MUST simulate:

- Network disconnection during save.
- Server failure during revision update.
- Duplicate operation submission.
- Generation timeout with unknown provider outcome.
- Delayed generation completion after further editing.
- Rendering service outage.
- Artifact access loss.
- Permission revocation during a session.
- Concurrent modifications by multiple users.

---

## 26. Acceptance criteria

**AC-EDT-001 — Visual-first editing**

Given a user selects a supported garment component, when they change a valid property through the contextual panel, then the editor updates the working state without requiring a prompt.

**AC-EDT-002 — No implicit generation**

Given a user changes a normal property, when the update is accepted, then no external AI generation call is initiated unless explicitly requested or governed by a documented user-enabled automation.

**AC-EDT-003 — Structured artifact attachment**

Given a compatible reusable lace artifact exists, when the user attaches it to a supported sleeve-hem region, then the model records the artifact revision and its relationship to the target region.

**AC-EDT-004 — Artifact version stability**

Given a design references artifact revision `A1`, when a newer artifact revision `A2` becomes available, then the existing design continues to reference `A1` until the user explicitly migrates it.

**AC-EDT-005 — Candidate isolation**

Given a generation job completes successfully, when its candidate is displayed, then the editor does not silently replace the current design unless the operation explicitly defines a safe direct-application behavior.

**AC-EDT-006 — Stale result protection**

Given a user edits the working copy while generation is running, when the result completes, then the editor identifies the state mismatch and prevents silent overwrite.

**AC-EDT-007 — Undo**

Given a supported property change has been applied, when the user invokes undo, then the prior working state is restored without deleting committed revisions.

**AC-EDT-008 — Render failure**

Given the rendering service fails, when the error is returned, then the canonical design remains intact and the editor exposes the failure and an appropriate recovery path.

**AC-EDT-009 — 2D/3D synchronization**

Given a design has synchronized 2D and editable 3D representations, when a supported shared property changes, then both representations reflect the change or clearly identify any representation-specific limitation.

**AC-EDT-010 — Capability disclosure**

Given a garment is represented by an AI-generated perspective image without editable 3D geometry, when the user opens the visualization controls, then the system does not label it as a fully editable 3D model.

**AC-EDT-011 — Save conflict**

Given two users edit the same working-copy version, when their changes conflict, then the editor detects the conflict and provides a safe resolution path.

**AC-EDT-012 — Revision comparison**

Given two committed revisions contain different sleeve styles, when the user compares them, then the editor presents the available visual difference and structured component/property difference.

**AC-EDT-013 — Production readiness**

Given a design looks complete but contains unconfirmed required production values, when validation findings are displayed, then the editor identifies the missing or unconfirmed values without declaring the design production-ready.

**AC-EDT-014 — Permission enforcement**

Given a user lacks permission to attach a restricted artifact or approve a revision, when they attempt the action, then the backend rejects it and the editor communicates the restriction.

**AC-EDT-015 — Recoverable save failure**

Given the connection is interrupted during editing, when a save cannot be confirmed, then the editor displays the unsaved state and preserves recoverable changes where supported.

---

## 27. Implementation priorities

### Phase 1 — Core visual editor

- Workspace layout.
- Central 2D viewport.
- Component hierarchy and selection.
- Contextual property editing.
- Structured working-copy updates.
- Save status and basic recovery.
- Undo and redo for local supported edits.
- Artifact browsing and structured attachment.
- Basic validation feedback.

### Phase 2 — AI-assisted interaction

- Explicit generation controls.
- Structured operation requests.
- Generation-job status.
- Candidate preview and comparison.
- Candidate application.
- Stale-result protection.
- Usage and entitlement feedback.
- Operation history and provenance.

### Phase 3 — Advanced visual interaction

- Drawing and region selection.
- Localized editing and mask preview.
- Technical-flat interaction where supported.
- Advanced revision comparison.
- Improved keyboard navigation and accessibility.
- More advanced asset and artifact placement controls.

### Phase 4 — 3D and collaboration

- 3D viewport at the capability level justified by the underlying geometry.
- Shared 2D/3D selection and property synchronization.
- Advanced concurrent editing and conflict resolution.
- Multi-user review collaboration.
- Advanced visualization and simulation, subject to explicit fidelity and performance targets.

---

## 28. Open decisions

| ID         | Decision                                                  | Recommended initial approach                                                                                      |
| ---------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| OD-EDT-001 | Which viewport and rendering technology will be used?     | Select based on required 2D precision, asset scale, browser support, and target devices.                          |
| OD-EDT-002 | Is the first release primarily 2D or 3D?                  | Prioritize a robust structured 2D editor; introduce 3D according to a defined capability target.                  |
| OD-EDT-003 | Which garment components are directly selectable?         | Define a minimum supported component schema by garment category.                                                  |
| OD-EDT-004 | How are unsupported source images edited?                 | Allow reference and image-based workflows while disclosing structural-editing limitations.                        |
| OD-EDT-005 | Should local edits use optimistic or pessimistic locking? | Prefer optimistic concurrency with explicit conflict resolution for the initial implementation.                   |
| OD-EDT-006 | How much undo history is retained?                        | Use configurable limits, preserving committed revisions independently.                                            |
| OD-EDT-007 | Should candidate generation allow automatic application?  | Default to candidate review before applying substantial visual changes.                                           |
| OD-EDT-008 | Which operations are deterministic and which require AI?  | Maintain an explicit operation capability registry and prefer software-only operations when feasible.             |
| OD-EDT-009 | How are component-level masks represented?                | Use canonical component or region identifiers where possible, with image-space masks as a documented fallback.    |
| OD-EDT-010 | Which 3D capability level is required for launch?         | Define the claim and capability target before selecting geometry and simulation technology.                       |
| OD-EDT-011 | Are annotations part of the canonical design?             | Separate design annotations, review comments, and temporary editor guides.                                        |
| OD-EDT-012 | How are local recovery states stored?                     | Define a secure recovery strategy consistent with browser storage limits and organizational privacy requirements. |

---

## 29. Definition of done

The editor subsystem is considered compliant when an authorized user can create and refine a garment design through visual controls, structured component properties, reusable artifacts, and supported drawing tools; explicitly initiate AI-assisted operations; inspect and apply generated candidates without losing newer work; navigate supported 2D and 3D representations with accurate capability disclosures; and maintain a clear, recoverable distinction between working state, committed revisions, approved designs, and production readiness.

The editor MUST remain an interaction layer over the canonical garment design model and the platform's execution, rendering, validation, and lifecycle services. It MUST NOT treat a generated image as proof of editable geometry, manufacturing feasibility, or production-specification completeness.

**End of document — SPEC-GDP-007 v0.1**

The next recommended document is `SPEC-GDP-008 — Rendering, Visualization, and 2D/3D Geometry Architecture`. It can define the technical rendering pipeline, supported asset formats, geometry fidelity levels, view synchronization, render caching, and the boundaries between image generation, editable geometry, and physically meaningful garment simulation.