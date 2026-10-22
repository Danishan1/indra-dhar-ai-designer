# SPEC-GDP-010 — Rendering, Visualization, and 2D/3D Geometry Architecture

**Document ID:** SPEC-GDP-010\
**Version:** 0.1\
**Status:** Initial Requirements Baseline\
**Product:** AI-Powered Garment Design and Development Platform\
**Document Type:** Software Requirements Specification (SRS) and Architecture Specification\
**Classification:** Internal Product and Engineering Specification\
**Dependencies:** ARCH-GDP-002, SPEC-GDP-003, SPEC-GDP-004, SPEC-GDP-006, SPEC-GDP-007, SPEC-GDP-008, SPEC-GDP-009

---

## 1. Purpose

This document defines the architecture and requirements for visualizing, rendering, editing, and synchronizing garment designs across two-dimensional (2D) and three-dimensional (3D) representations.

The platform must provide a visual-first design environment for apparel industry users who may understand garment construction, fabrics, trims, and product requirements without being professional digital designers or 3D specialists.

Users must be able to inspect and manipulate garment designs visually, compare alternatives, attach reusable components, review AI-generated results, and prepare technical documentation without needing to understand the underlying rendering pipeline or AI implementation.

The rendering architecture must also maintain a clear distinction between:

- A visually convincing garment image.
- An editable 2D design representation.
- A structured garment design definition.
- A three-dimensional garment geometry or scene.
- A physically simulated garment.
- A manufacturing-ready pattern and production specification.

These representations are related, but they are not interchangeable.

## 2. Objectives

The subsystem SHALL:

1. Render garment designs consistently across editor views, previews, comparisons, and exports.
2. Support editable 2D technical flats and appropriate raster visualization.
3. Support 3D garment visualization at explicitly defined fidelity levels.
4. Synchronize supported changes across views through a shared canonical design model.
5. Support fabric textures, trims, embroidery, lace, colorways, and other reusable artifacts.
6. Preserve the relationship between visual elements and structured garment components.
7. Support AI-generated imagery without falsely treating it as accurate geometry or production data.
8. Provide clear feedback when geometry is approximate, missing, inferred, or unsuitable for production use.
9. Maintain revision consistency across rendering jobs and exported assets.
10. Support asynchronous rendering, caching, versioned assets, and scalable processing.
11. Provide deterministic, software-driven rendering where possible.
12. Enable future expansion into pattern-aware geometry, cloth simulation, and higher-fidelity visualization without redesigning the entire system.

## 3. Scope

### 3.1 Included

- Rendering architecture and renderer selection
- 2D canvas and technical-flat rendering
- Vector and raster representations
- Garment component geometry
- Fabric and trim visualization
- Artifact placement and rendering
- 3D scene and garment visualization
- Geometry fidelity classification
- Cloth and material simulation boundaries
- 2D/3D synchronization
- Camera, lighting, and viewport management
- AI-assisted visual generation and image editing
- Preview generation and caching
- Render job lifecycle
- Visual comparison and revision display
- Rendering quality checks
- Asset storage and version binding
- Export specifications
- Performance, reliability, security, and acceptance criteria

### 3.2 Excluded

The following require separate specifications or dedicated implementation decisions:

- Complete garment pattern drafting and grading algorithms
- Industrial pattern-making and marker optimization
- Full physical cloth simulation engine implementation
- Vendor-specific rendering-engine implementation
- AI model training and fine-tuning
- Production machine-control formats
- Full digital-twin simulation of manufacturing processes

These systems MAY integrate with the rendering architecture through defined interfaces.

---

## 4. Terminology

| Term                   | Definition                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| Canonical design model | Authoritative structured representation of a garment design                                      |
| Component graph        | Components and their relationships within a garment                                              |
| Geometry               | Mathematical representation of shapes, surfaces, curves, or meshes                               |
| Technical flat         | 2D garment illustration emphasizing silhouette, seams, construction, and details                 |
| Raster image           | Pixel-based image such as PNG, JPEG, or WebP                                                     |
| Vector image           | Resolution-independent graphic representation, commonly SVG                                      |
| Scene graph            | Structured representation of objects, materials, transforms, and relationships in a visual scene |
| Mesh                   | Vertices, edges, faces, and associated attributes describing geometry                            |
| UV coordinates         | Coordinates used to map textures onto surfaces                                                   |
| PBR                    | Physically based rendering                                                                       |
| Texture map            | Image or data used to represent surface appearance                                               |
| Material               | Set of surface appearance properties                                                             |
| Camera state           | Viewpoint, projection, and related visualization settings                                        |
| Render job             | A tracked operation that produces one or more visual outputs                                     |
| Render profile         | Named configuration for a type or quality of rendering                                           |
| Geometry fidelity      | Declared degree of geometric accuracy and editability                                            |
| Pattern geometry       | Geometry associated with garment pattern pieces and construction                                 |
| Cloth simulation       | Computation approximating fabric deformation under physical constraints                          |
| Visual revision        | A specific rendered output associated with a source design revision and render configuration     |
| Render manifest        | Metadata describing the source state, rendering method, parameters, and generated outputs        |

---

## 5. Core Architectural Principles

### 5.1 The structured model is authoritative

The platform MUST NOT treat a rendered image as the sole authoritative representation of a garment design.

The canonical design model MUST preserve structured information about:

- Garment type and silhouette
- Components and subcomponents
- Component properties
- Relationships and attachment points
- Fabric, color, texture, and trim references
- Placement and transformation information
- Supported geometry and construction attributes
- Design revision and artifact version references
- Confirmed, inferred, missing, and review-required information

A visual output is a derived representation of this state or an explicitly identified AI-generated proposal.

### 5.2 Render according to intent

Different user actions require different visual outputs.

Examples:

- Inspecting sleeve length requires an accurate, editable representation of the sleeve.
- Reviewing embroidery appearance may require high-quality raster or textured rendering.
- Preparing a technical flat requires clear construction-oriented vector output.
- Evaluating drape may require 3D geometry and, where supported, cloth simulation.
- Producing a marketing image may use AI-generated imagery without claiming geometric accuracy.

The system MUST select an appropriate rendering method based on the operation, source data, and required output.

### 5.3 Separate appearance from manufacturing truth

A photorealistic output MUST NOT automatically be classified as:

- A correct 3D garment mesh.
- A physically accurate drape simulation.
- A production pattern.
- A verified seam construction.
- A confirmed measurement specification.

### 5.4 Preserve source traceability

Every saved visual output MUST be traceable to the relevant design revision, render configuration, and processing method.

### 5.5 Prefer deterministic operations

If a requested change can be represented as a structured transformation and rendered without AI, the system SHOULD use that path.

Examples include changing a vector color, replacing a referenced trim artifact, updating a supported component dimension, or switching a camera preset.

### 5.6 Make limitations visible

When a view contains approximate geometry, AI-inferred details, placeholder materials, or missing source data, the system MUST provide an appropriate indication to the user.

### 5.7 Progressive fidelity

The platform SHOULD provide useful visualization early in the design lifecycle and increase fidelity as the structured design definition becomes more complete.

A user should not need to provide complete manufacturing geometry merely to explore a visual design concept.

---

## 6. Representation Architecture

GDP SHALL maintain distinct but linked representations.

\<box-placeholder> \</box-placeholder>

### 6.1 Representation layers

| Layer | Representation                         | Primary purpose                                                            |
| ----- | -------------------------------------- | -------------------------------------------------------------------------- |
| R0    | Canonical garment design model         | Authoritative structured design state                                      |
| R1    | Semantic component graph               | Component relationships and design intent                                  |
| R2    | Editable 2D geometry                   | Technical flats, outlines, seams, regions, annotations                     |
| R3    | 3D geometry and scene                  | Spatial garment visualization                                              |
| R4    | Materials and textures                 | Fabric appearance, colors, trims, artwork                                  |
| R5    | Rendered images                        | Interactive previews, thumbnails, high-quality visuals                     |
| R6    | Production geometry and specifications | Pattern geometry, validated measurements, construction data when supported |

The exact implementation may combine some layers physically, but their logical responsibilities MUST remain distinguishable.

### 6.2 Canonical design model

The canonical model is owned by the garment design subsystem defined in SPEC-GDP-003.

The rendering subsystem MAY maintain derived geometry caches and render-specific data. It MUST NOT silently overwrite canonical design properties using values inferred from a rendered image.

**FR-RV-001** Every renderable garment MUST reference a canonical design revision or an explicitly identified provisional input state.

**FR-RV-002** The renderer MUST resolve component references and artifact versions against the source design revision.

**FR-RV-003** Derived representations MUST record their source revision and derivation method.

**FR-RV-004** The system MUST distinguish user-confirmed properties from inferred or placeholder properties where that distinction affects interpretation.

**FR-RV-005** Rendering failures MUST NOT corrupt or partially overwrite the canonical design state.

**FR-RV-006** Changes to canonical design state MUST invalidate or supersede affected derived representations according to the dependency model.

### 6.3 Representation independence

**FR-RV-007** The system MUST allow a design to have an editable 2D representation without requiring a complete 3D representation.

**FR-RV-008** The system MAY provide a 3D visualization before manufacturing-grade geometry exists, but MUST label its fidelity appropriately.

**FR-RV-009** AI-generated imagery MUST be stored as a visual proposal or derived visual asset, not automatically substituted for structured geometry.

**FR-RV-010** A project MAY contain multiple representations of the same design revision, provided their provenance and intended use are explicit.

---

## 7. Logical Architecture

### 7.1 Subsystems

| Subsystem              | Responsibilities                                                                  |
| ---------------------- | --------------------------------------------------------------------------------- |
| Render Request API     | Accept render requests and validate access and input references                   |
| Render Profile Manager | Define quality, output formats, dimensions, and render purposes                   |
| Design State Resolver  | Load the correct design revision and resolve artifact references                  |
| Geometry Builder       | Produce or update supported 2D geometry and 3D scene geometry                     |
| Material Resolver      | Resolve fabrics, textures, colors, trims, and material properties                 |
| 2D Renderer            | Render technical flats, outlines, fills, annotations, and vector exports          |
| 3D Scene Builder       | Assemble geometry, materials, transforms, and scene hierarchy                     |
| 3D Renderer            | Render 3D scenes into interactive or high-quality visual outputs                  |
| AI Visual Adapter      | Request AI generation or targeted image edits through the central AI orchestrator |
| Render Job Manager     | Track asynchronous jobs, retries, cancellation, and result availability           |
| Render Validator       | Check output integrity, geometry consistency, completeness, and declared fidelity |
| Render Cache           | Reuse valid outputs when source state and configuration match                     |
| Preview Delivery       | Deliver authorized visual assets to the editor                                    |
| Export Service         | Produce approved visual export formats and associated metadata                    |
| Render Observability   | Track latency, resource usage, failures, and output provenance                    |

These are logical boundaries, not a mandatory microservice topology.

### 7.2 Architecture diagram

```
flowchart TD
    UI[Visual Editor] --> API[Render Request API]
    API --> AUTH[Authorization and Scope Check]
    AUTH --> RES[Design State Resolver]
    RES --> MODEL[Canonical Design Model]
    RES --> ART[Artifact Registry]
    API --> JOB[Render Job Manager]
    JOB --> ROUTER[Render Strategy Router]
    ROUTER --> V2D[2D Geometry and Renderer]
    ROUTER --> G3D[3D Geometry and Scene Builder]
    ROUTER --> AI[Central AI Orchestrator]
    V2D --> VAL[Render Validator]
    G3D --> VAL
    AI --> VAL
    VAL --> CACHE[Versioned Render Cache]
    CACHE --> STORE[Asset Storage]
    STORE --> DELIVERY[Preview and Export Delivery]
    DELIVERY --> UI
    JOB --> OBS[Observability and Audit]
```

The AI Visual Adapter MUST invoke the central AI orchestration subsystem rather than call external model providers directly.

---

## 8. Render Request and Profile Model

### 8.1 Render request

Every render request MUST identify:

- Source design or provisional state
- Source revision
- Requested output purpose
- Requested representation
- Render profile
- Applicable component or region scope
- Required output formats
- Relevant camera or viewport settings
- Optional comparison revision
- Authorization context
- Request correlation identifier

**FR-RV-011** The system SHALL validate the source design revision before starting a render.

**FR-RV-012** A request MUST NOT silently resolve to the latest design revision if the caller explicitly specifies an older revision.

**FR-RV-013** The system SHALL support full-design and supported component-scoped rendering.

**FR-RV-014** The system SHALL select a compatible rendering strategy for each request.

**FR-RV-015** If a requested fidelity cannot be achieved from the available source data, the system MUST report the limitation or require an explicit fallback.

### 8.2 Render purposes

The platform SHOULD define at least these render purposes:

| Purpose                    | Intended output                             | Priority                  |
| -------------------------- | ------------------------------------------- | ------------------------- |
| Interactive editor         | Fast viewport update                        | Low latency               |
| Technical flat             | Editable vector or structured 2D output     | Clarity and consistency   |
| Design review              | Detailed visual preview                     | Appearance and comparison |
| Component inspection       | Close-up of a selected component            | Local detail              |
| Colorway preview           | Consistent views across colorways           | Cross-variant consistency |
| Material inspection        | Fabric and trim appearance                  | Texture fidelity          |
| 3D review                  | Interactive scene or rendered views         | Spatial comprehension     |
| Presentation export        | High-quality raster or vector output        | Visual polish             |
| Tech-pack illustration     | Traceable technical drawing                 | Construction clarity      |
| Production geometry export | Supported geometry with validation metadata | Geometric correctness     |

### 8.3 Render profiles

**FR-RV-016** The system SHALL support named, versioned render profiles.

**FR-RV-017** A render profile MUST specify relevant parameters such as resolution, output format, lighting, camera, quality, geometry mode, and supported post-processing.

**FR-RV-018** Profile changes MUST NOT retroactively change previously generated outputs.

**FR-RV-019** The system SHOULD offer sensible defaults based on the user's selected workflow rather than requiring users to configure low-level rendering parameters.

**FR-RV-020** Render profiles MUST declare any fidelity limitations or unsupported features relevant to their intended use.

---

## 9. 2D Visualization Architecture

### 9.1 2D editor

The 2D editor MUST support visual interaction with garment components and drawing elements.

Depending on the representation and garment type, supported elements may include:

- Outer silhouette
- Front and back garment views
- Side views
- Sleeve and collar shapes
- Cuffs, plackets, pockets, and panels
- Seam and stitch lines
- Hem and edge lines
- Darts and pleats
- Artwork and embroidery placement
- Fabric and trim regions
- Measurements and annotations
- Selected regions and edit masks

**FR-RV-021** The 2D renderer SHALL support selectable, identifiable drawing objects when the underlying geometry is structured.

**FR-RV-022** Selecting a structured visual element MUST resolve to the corresponding canonical component or drawing entity.

**FR-RV-023** The system MUST distinguish selectable design geometry from non-editable background imagery.

**FR-RV-024** The renderer SHALL support zooming, panning, fit-to-view, and appropriate viewport transformations.

**FR-RV-025** The system SHALL support layer ordering and visibility controls where multiple drawing layers are present.

**FR-RV-026** The renderer MUST preserve the association between drawing entities and their source component identifiers.

### 9.2 Technical-flat representation

Technical flats are not merely decorative illustrations. They are intended to communicate garment shape and construction.

**FR-RV-027** The platform SHALL support technical-flat rendering for garment types covered by the active geometry library.

**FR-RV-028** Technical flats SHOULD support consistent line styles for silhouettes, seams, stitch lines, folds, hidden edges, and annotations.

**FR-RV-029** The system SHOULD support front, back, and additional views where the garment definition provides the required geometry.

**FR-RV-030** A missing back view MUST NOT be fabricated as verified technical geometry solely by mirroring the front view unless the operation is explicitly appropriate and clearly identified.

**FR-RV-031** Technical-flat exports MUST preserve their source revision and geometry provenance.

**FR-RV-032** Technical flats MUST NOT be labeled as pattern pieces or manufacturing patterns unless they satisfy the requirements of the relevant pattern subsystem.

### 9.3 Vector representation

SVG is the preferred initial interchange format for editable 2D geometry and vector-based technical flats, subject to application needs.

**FR-RV-033** The system SHOULD store structured 2D geometry independently of any particular rendered image.

**FR-RV-034** SVG export SHOULD preserve identifiable objects and semantic metadata where feasible.

**FR-RV-035** Unsupported SVG features MUST be sanitized, rejected, or safely converted before rendering.

**FR-RV-036** The renderer MUST validate imported vector documents to reduce risks from scripts, external resource references, and malicious embedded content.

**FR-RV-037** Round-trip editing MUST preserve supported geometry, identifiers, and transformations within defined tolerances.

**FR-RV-038** When a vector is flattened or rasterized, the system MUST preserve the original editable source unless the user explicitly replaces it.

### 9.4 Raster representation

Raster images are appropriate for previews, photographs, generated concepts, fabric textures, and rendered output.

**FR-RV-039** The system SHALL support PNG and WebP for appropriate raster outputs.

**FR-RV-040** JPEG MAY be supported for photographic output where transparency is unnecessary.

**FR-RV-041** Raster assets MUST retain metadata linking them to the source revision and render configuration.

**FR-RV-042** A raster image MUST NOT be presented as editable vector geometry unless a corresponding editable representation exists.

**FR-RV-043** Raster-derived vectorization or geometry reconstruction MUST be identified as a derived process with appropriate confidence or review status.

---

## 10. Garment Geometry and Component Mapping

### 10.1 Component-aware geometry

A garment model may contain a body, sleeves, collar, cuffs, placket, pockets, panels, trims, artwork, and other components.

**FR-RV-044** Where structured geometry exists, each renderable component MUST have a stable identifier and a defined relationship to its source model entity.

**FR-RV-045** The geometry builder MUST resolve component transforms, attachment points, and supported placement constraints.

**FR-RV-046** Component geometry MUST retain relevant parent-child relationships.

**FR-RV-047** The system MUST distinguish a component's semantic identity from its rendered pixels or mesh identifier.

**FR-RV-048** When a component is hidden, replaced, or updated, the renderer MUST update all affected dependent views.

### 10.2 Geometry capability classes

The platform SHALL distinguish the following geometry capability classes.

| Class                              | Description                                                                                                      | Appropriate use                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| G0 — Image-only                    | Flattened raster or generated image without reliable component geometry                                          | Visual inspiration and concept review                      |
| G1 — Annotated image               | Raster image with regions, masks, or approximate component annotations                                           | Targeted review and limited local edits                    |
| G2 — Editable 2D                   | Structured vector outlines, regions, and component-associated drawing entities                                   | Technical-flat editing and structured 2D changes           |
| G3 — Approximate 3D                | Approximate garment mesh or scene, not verified against pattern or measurements                                  | Spatial concept visualization                              |
| G4 — Structured 3D                 | Component-aware geometry with explicit transforms, supported material mapping, and defined geometric constraints | Interactive 3D editing and spatial review                  |
| G5 — Pattern-linked 3D             | 3D garment geometry linked to verified pattern pieces and relevant construction constraints                      | Advanced development workflows, subject to validation      |
| G6 — Production-validated geometry | Geometry and linked specifications validated against the applicable production requirements                      | Only the specific manufacturing uses covered by validation |

The existence of a higher-numbered class MUST NOT be inferred from visual realism alone. Each class requires explicit capability checks.

**FR-RV-049** Every geometry representation MUST declare its capability class.

**FR-RV-050** The system MUST prevent image-only inputs from being silently upgraded to production-validated geometry.

**FR-RV-051** G5 or G6 status MUST require evidence from the applicable geometry, pattern, measurement, and validation workflows.

**FR-RV-052** A representation MAY have different fidelity levels for different components, provided the limitation is recorded and communicated.

**FR-RV-053** The UI MUST expose a useful fidelity indicator when the distinction is material to the user's task.

---

## 11. 3D Visualization Architecture

### 11.1 3D scene model

The 3D scene SHOULD contain:

- Garment components
- Component transforms and attachment relationships
- Mesh geometry
- Material assignments
- Texture references and UV mapping
- Lighting and environment settings
- Camera and view state
- Optional body or mannequin representation
- Ground plane or staging environment, where appropriate
- Scene metadata and provenance

**FR-RV-054** The system SHALL support interactive 3D scene viewing for supported garment representations.

**FR-RV-055** The system SHOULD support orbit, pan, zoom, and preset camera views.

**FR-RV-056** The system SHALL support hiding, isolating, or highlighting selected components where structured scene data permits.

**FR-RV-057** The system MUST maintain component identifiers when building structured 3D scenes.

**FR-RV-058** The system MUST NOT assume that an AI-generated photograph contains usable 3D mesh data.

**FR-RV-059** The system SHOULD support GLB or glTF for suitable 3D scene interchange and asset delivery.

**FR-RV-060** Imported 3D assets MUST be validated for file size, supported geometry, material references, and unsafe or unsupported content.

### 11.2 Interactive 3D renderer

The platform MAY use a browser-based WebGL or WebGPU rendering approach, subject to browser compatibility and deployment constraints.

**FR-RV-061** The renderer MUST support a defined minimum set of supported browsers and graphics capabilities.

**FR-RV-062** The system MUST provide a graceful fallback when a device cannot support the preferred 3D renderer.

**FR-RV-063** The platform SHOULD use progressive loading or level-of-detail techniques for large scenes.

**FR-RV-064** Scene updates SHOULD avoid rebuilding the entire scene when a local component update is sufficient.

**FR-RV-065** The renderer MUST provide a meaningful error or fallback view when a scene cannot be loaded.

**FR-RV-066** Camera movements and viewport settings MUST NOT modify canonical garment geometry.

### 11.3 3D geometry creation

3D geometry MAY originate from:

- Existing structured garment geometry
- Imported validated geometry
- Pattern-linked geometry
- Procedural geometry generation
- AI-assisted geometry proposals
- Reconstructed geometry from 2D or image-based inputs

**FR-RV-067** The geometry builder MUST record the source method and relevant input revision.

**FR-RV-068** Geometry inferred from images MUST be marked approximate unless separately validated.

**FR-RV-069** AI-generated 3D geometry MUST pass structural validation before becoming an editable canonical representation.

**FR-RV-070** Invalid meshes, missing transforms, unresolved materials, or broken component references MUST be detected before publication of the resulting representation.

**FR-RV-071** The platform MUST distinguish scene completeness from manufacturing correctness.

---

## 12. Fabric, Materials, Trims, and Surface Appearance

### 12.1 Material representation

Material definitions MAY include:

- Color and color-space metadata
- Base-color texture
- Normal map
- Roughness
- Metallic response
- Opacity or transparency
- Texture scale and orientation
- Fabric-specific visual properties
- Optional physical properties supplied by an authoritative source

**FR-RV-072** The material resolver SHALL resolve material references against the applicable design revision and artifact versions.

**FR-RV-073** A material's visual properties MUST be distinct from its confirmed physical properties.

**FR-RV-074** AI-inferred fabric composition, weight, stretch, or other manufacturing attributes MUST NOT be treated as confirmed solely because the material looks plausible.

**FR-RV-075** The renderer SHOULD support repeating textures with controlled scale, orientation, and seam handling.

**FR-RV-076** Texture transformations MUST be deterministic for a fixed input state and rendering configuration, within the tolerances of the selected renderer.

### 12.2 Trims and decorative components

The platform MUST support visualization of reusable components where appropriate, including:

- Lace and borders
- Embroidery
- Piping and binding
- Buttons and closures
- Decorative panels
- Printed artwork
- Labels and patches
- Other registered garment artifacts

**FR-RV-077** Artifact placement MUST be represented structurally when the underlying design model supports it.

**FR-RV-078** The system SHOULD support mapping a trim artifact to a component edge, region, or attachment path.

**FR-RV-079** The system MUST distinguish a real component placement relationship from a flattened visual approximation.

**FR-RV-080** Replacing an artifact MUST update all derived views that depend on that artifact reference.

**FR-RV-081** Artifact revision changes MUST NOT silently alter historical design revisions.

**FR-RV-082** The renderer SHOULD preserve source artifact identity and version in the render manifest.

### 12.3 Color accuracy

**FR-RV-083** The system SHALL define color-space handling for supported input and output formats.

**FR-RV-084** The UI SHOULD distinguish screen visualization from physical color approval.

**FR-RV-085** Rendered screen color MUST NOT be represented as a guaranteed physical fabric color match.

**FR-RV-086** Where color references are used for production, the system SHOULD preserve the reference system and code as structured data, independently of its screen rendering.

---

## 13. Cloth Simulation and Physical Behavior

### 13.1 Capability distinction

A 3D render may display a garment without simulating fabric behavior. Cloth simulation is a separate capability.

The platform MUST distinguish:

1. Static mesh visualization.
2. Pose-dependent geometry.
3. Cloth simulation based on specified physical parameters.
4. Validated garment geometry linked to patterns and construction information.

**FR-RV-087** The system MUST NOT describe a static mesh as physically simulated cloth unless a cloth-simulation process was actually performed.

**FR-RV-088** If cloth simulation is supported, its output MUST identify the simulation engine, configuration, source geometry, and relevant material parameters.

**FR-RV-089** Missing physical material parameters MUST NOT be silently replaced with values presented as measured or confirmed.

**FR-RV-090** Approximate default parameters MAY be used for preview if explicitly classified as defaults or estimates.

**FR-RV-091** Simulation failure MUST NOT invalidate the underlying canonical design revision.

**FR-RV-092** The system SHOULD support asynchronous simulation jobs where computational cost or latency makes interactive execution impractical.

### 13.2 Physical property provenance

**FR-RV-093** Fabric physical properties used in simulation SHOULD include provenance and confirmation status.

**FR-RV-094** Simulated drape MUST NOT be treated as a guaranteed prediction of real garment behavior unless the relevant model, inputs, and validation support that claim.

**FR-RV-095** A simulation result MUST remain traceable to the geometry and material-property revisions used to generate it.

---

## 14. Synchronization Between 2D and 3D

### 14.1 Shared design state

2D and 3D views MUST reference the same canonical design state wherever their capabilities overlap.

The architecture MUST NOT implement unrelated 2D and 3D design records that silently diverge.

**FR-RV-096** Every synchronized view MUST identify the design revision or provisional state it represents.

**FR-RV-097** A supported design change made in one view MUST update the canonical model and all dependent views according to the operation's defined behavior.

**FR-RV-098** Camera changes, zoom, panning, and other view-only actions MUST NOT create garment design revisions unless explicitly required by a saved presentation workflow.

**FR-RV-099** The system MUST distinguish a geometry edit from a view-state change.

**FR-RV-100** If a change cannot be represented faithfully in another view, the system MUST communicate the limitation rather than silently implying synchronization.

### 14.2 Synchronization levels

| Level                      | Behavior                                                                         | Example                                                                     |
| -------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| S0 — Independent           | Views are separate and not synchronized                                          | Marketing image beside a technical flat                                     |
| S1 — Revision-linked       | Both views reference the same design revision but do not share editable geometry | AI image paired with an editable flat                                       |
| S2 — Component-linked      | Visual elements resolve to common component IDs                                  | Selecting the sleeve highlights it in both views                            |
| S3 — Geometry-synchronized | Supported geometry edits propagate between views                                 | Updating a structured sleeve outline updates its corresponding 3D component |
| S4 — Pattern-linked        | Supported 2D pattern changes propagate through validated 3D garment construction | Updating a pattern piece regenerates linked garment geometry                |

**FR-RV-101** Each view relationship MUST declare its synchronization level.

**FR-RV-102** The system MUST NOT claim S3 or S4 synchronization when only image-level association exists.

**FR-RV-103** S4 capabilities MUST be provided only where pattern geometry, mapping, and regeneration rules are implemented and validated.

### 14.3 Conflicting updates

**FR-RV-104** The system MUST detect conflicting concurrent edits to shared canonical state.

**FR-RV-105** The system MUST apply an explicit conflict-resolution policy rather than silently overwriting a newer committed revision.

**FR-RV-106** Derived geometry regeneration MUST be linked to the exact source revision used.

**FR-RV-107** If a regeneration result is based on an outdated source revision, the system MUST reject it, preserve it as a separate proposal, or require an explicit merge decision.

**FR-RV-108** The user MUST be able to distinguish the current canonical state from a pending or stale rendered result.

---

## 15. AI-Assisted Visualization

### 15.1 AI visual operations

The rendering subsystem MAY request AI assistance for:

- Initial concept generation
- Visual interpretation of uploaded references
- Style and color exploration
- Surface appearance proposals
- Targeted edits to image-based representations
- Image-to-geometry proposals where supported
- Visualization of alternative trims, fabrics, and components
- Image-based preview generation

AI execution MUST be mediated by SPEC-GDP-004.

**FR-RV-109** AI-assisted visual operations MUST reference the intended source design revision and operation scope.

**FR-RV-110** The system SHOULD preserve explicit user constraints, including components or regions intended to remain unchanged.

**FR-RV-111** The system MUST NOT guarantee pixel-perfect preservation of unaffected areas when the underlying AI editing method cannot guarantee it.

**FR-RV-112** AI-generated outputs MUST be treated as proposals until validated and accepted through the relevant workflow.

**FR-RV-113** The platform MUST distinguish an AI visual proposal from a direct, structured edit to canonical geometry.

**FR-RV-114** An AI image MUST NOT overwrite structured geometry or confirmed production properties solely because the image appears visually plausible.

### 15.2 Operation routing

The rendering strategy router SHOULD choose the least complex method that satisfies the user's requested outcome.

| Operation                                  | Preferred execution path                                         |
| ------------------------------------------ | ---------------------------------------------------------------- |
| Change a supported vector color            | Direct structured update and rerender                            |
| Toggle a component's visibility            | Scene or layer update                                            |
| Replace a referenced lace artifact         | Update artifact reference and rerender                           |
| Change a camera preset                     | Update view state                                                |
| Apply a supported geometry transform       | Structured geometry operation                                    |
| Generate a new visual style concept        | AI image generation                                              |
| Modify a local region of a flattened image | Targeted AI image editing where supported                        |
| Convert an image to editable geometry      | Dedicated reconstruction pipeline with validation                |
| Generate pattern-linked 3D geometry        | Geometry/pattern engine, with AI assistance only where validated |

**FR-RV-115** The system MUST support routing between direct rendering, geometry processing, and AI-assisted visual generation.

**FR-RV-116** Routing decisions MUST be traceable.

**FR-RV-117** The system SHOULD avoid invoking AI when a deterministic software operation can satisfy the request.

**FR-RV-118** When an AI operation is necessary, the request MUST pass through the central AI orchestration and usage-metering systems.

### 15.3 Visual comparison and review

**FR-RV-119** The editor SHALL support comparing two or more authorized visual revisions using supported comparison modes.

**FR-RV-120** Comparison modes SHOULD include side-by-side views and, where suitable, overlays or difference views.

**FR-RV-121** Comparisons MUST identify the revisions being compared.

**FR-RV-122** The platform SHOULD indicate when apparent differences result from camera, lighting, crop, or rendering-profile changes rather than a garment design change.

**FR-RV-123** Users MUST be able to inspect the source revision and relevant provenance of a visual proposal before accepting it.

---

## 16. Render Job Lifecycle

### 16.1 Job states

A render job SHALL support an appropriate subset of these states:

- `created`
- `queued`
- `resolving_inputs`
- `building_geometry`
- `rendering`
- `validating`
- `completed`
- `completed_with_warnings`
- `failed`
- `cancel_requested`
- `cancelled`
- `expired`

### 16.2 Job requirements

**FR-RV-124** Every asynchronous render job MUST have a stable job identifier.

**FR-RV-125** The job record MUST reference the source revision, render profile version, requested output types, and initiating identity.

**FR-RV-126** The system MUST expose authorized job status and relevant progress information to the editor.

**FR-RV-127** A failed render MUST NOT corrupt an existing successful output or canonical design state.

**FR-RV-128** The system SHOULD support cancellation for jobs that have not completed and can safely be stopped.

**FR-RV-129** The system MUST distinguish a job failure from a successful job that produced warnings.

**FR-RV-130** The system MUST validate output availability before marking a job complete.

**FR-RV-131** Retried jobs MUST preserve the relationship to the original request and record the attempt history.

**FR-RV-132** A retry MUST NOT silently substitute a different source revision or render profile.

**FR-RV-133** The system SHOULD deduplicate equivalent in-flight rendering requests when safe and beneficial.

**FR-RV-134** Job result retrieval MUST recheck authorization.

### 16.3 Render manifest

Every persisted output SHOULD have a render manifest with at least:

```
{
  "render_id": "rnd_example",
  "source_design_id": "dsg_example",
  "source_revision_id": "rev_example",
  "representation_type": "technical_flat",
  "geometry_capability": "G2",
  "synchronization_level": "S2",
  "render_profile_id": "technical_flat_v1",
  "render_profile_version": 1,
  "render_method": "structured_vector_renderer",
  "artifact_revisions": [
    {
      "artifact_id": "LAC-0012",
      "artifact_revision_id": "artrev_example"
    }
  ],
  "outputs": [
    {
      "format": "svg",
      "asset_id": "asset_example"
    },
    {
      "format": "png",
      "asset_id": "asset_preview_example"
    }
  ],
  "validation_status": "passed",
  "created_at": "2026-10-21T16:00:00Z"
}
```

All identifiers and values are illustrative. Actual field names MUST align with the canonical model, artifact registry, and asset service.

**FR-RV-135** The manifest MUST identify the source revision and render method.

**FR-RV-136** Artifact-dependent renders MUST record the exact artifact revisions used.

**FR-RV-137** AI-assisted outputs MUST additionally record the applicable operation and AI execution trace references.

**FR-RV-138** Manifest updates MUST preserve historical traceability when a new render is generated.

---

## 17. Rendering Cache and Asset Storage

### 17.1 Cache design

The system SHOULD cache derived visual outputs where reuse is safe.

A cache key SHOULD include the values that materially affect the result, such as:

- Source design revision
- Relevant component and artifact revisions
- Geometry builder version
- Renderer version
- Render profile version
- Camera and lighting settings where relevant
- Texture and material references
- Output format and resolution
- AI model/configuration identifiers for AI-generated results, where applicable

**FR-RV-139** The cache MUST NOT return an output for an incompatible source revision or render configuration.

**FR-RV-140** Cache keys MUST account for tenant boundaries or equivalent authorization-safe isolation.

**FR-RV-141** Cache invalidation MUST occur when a relevant dependency changes.

**FR-RV-142** A cache miss MUST NOT alter canonical design state.

**FR-RV-143** AI output caching MUST comply with the relevant provider terms, privacy settings, and data-retention policy.

### 17.2 Asset storage

**FR-RV-144** Persisted render outputs MUST use the asset-storage subsystem defined by the platform architecture.

**FR-RV-145** Stored assets MUST have stable identifiers and explicit ownership or tenant scope.

**FR-RV-146** Temporary render artifacts MUST have an expiry and cleanup policy.

**FR-RV-147** The system SHOULD deduplicate identical immutable assets where safe without weakening tenant isolation or access controls.

**FR-RV-148** Asset URLs and download mechanisms MUST comply with SPEC-GDP-009 authorization requirements.

**FR-RV-149** Deleting or revoking an asset MUST not silently break the provenance record of a historical design revision; the system MUST retain appropriate metadata or a tombstone where required.

---

## 18. Validation and Quality Control

### 18.1 Render validation

**FR-RV-150** The system MUST validate that expected output files exist and are readable before publishing them.

**FR-RV-151** The validator MUST check required metadata, source references, and output format compatibility.

**FR-RV-152** Structured geometry MUST be checked for supported structural errors before rendering or export.

**FR-RV-153** The validator SHOULD detect missing component references, invalid transforms, malformed geometry, unresolved textures, and unsupported material definitions.

**FR-RV-154** Where technical-flat requirements apply, validation SHOULD check required views, relevant annotations, and expected component visibility.

**FR-RV-155** Where 3D scene requirements apply, validation SHOULD check scene completeness, mesh integrity, material resolution, and coordinate consistency.

**FR-RV-156** Validation results MUST distinguish technical render validity from manufacturing validity.

**FR-RV-157** Passing a render validation MUST NOT automatically certify the garment design as production-ready.

### 18.2 Validation outcomes

| Outcome                | Meaning                                          |
| ---------------------- | ------------------------------------------------ |
| `passed`               | Required checks passed                           |
| `passed_with_warnings` | Output is usable but has disclosed limitations   |
| `needs_review`         | Human review is required before the intended use |
| `failed`               | Required output or structural checks failed      |
| `not_applicable`       | Check does not apply to this representation      |

**FR-RV-158** Validation warnings MUST identify the relevant representation or component where possible.

**FR-RV-159** The system MUST prevent failed outputs from being mistaken for validated production geometry.

**FR-RV-160** Users MUST be able to access the relevant warning or failure details when authorized.

---

## 19. Export Requirements

### 19.1 Supported formats

| Format                    | Intended use                                                   | Requirements                                              |
| ------------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| SVG                       | Editable technical flats and 2D vector output                  | Preserve supported vector entities and metadata           |
| PNG                       | Transparent previews, annotations, and technical illustrations | Preserve required resolution and transparency             |
| WebP                      | Efficient web previews                                         | Appropriate quality and transparency handling             |
| JPEG                      | Photographic presentation imagery                              | Use when transparency is not required                     |
| PDF                       | Review and documentation packages                              | Preserve page layout and revision metadata                |
| GLB/glTF                  | Supported 3D scene interchange                                 | Include supported geometry, materials, and scene metadata |
| JSON or equivalent        | Structured representation and manifests                        | Preserve schema version and identifiers                   |
| Other specialized formats | Future geometry or production workflows                        | Require explicit compatibility and validation rules       |

**FR-RV-161** The system SHALL support exporting applicable visual representations in the configured supported formats.

**FR-RV-162** Each export MUST identify its source design revision.

**FR-RV-163** Exported technical flats SHOULD preserve their vector source where the output format supports it.

**FR-RV-164** A raster export MUST NOT be represented as a fully editable design package.

**FR-RV-165** 3D exports MUST disclose relevant geometry capability and known limitations.

**FR-RV-166** Production geometry exports MUST be available only when the applicable validation requirements have been satisfied.

**FR-RV-167** Export generation MUST enforce authorization and tenant isolation.

**FR-RV-168** Exported files SHOULD include or accompany a manifest identifying source revisions, artifact revisions, and validation status.

### 19.2 Export consistency

**FR-RV-169** Multi-file exports MUST be generated from a consistent source revision.

**FR-RV-170** If the source design changes during export, the export MUST remain bound to its original revision or be explicitly restarted against a new revision.

**FR-RV-171** A failed export MUST NOT overwrite an earlier successful export.

**FR-RV-172** Tech-pack illustrations MUST use the source design revision referenced by the associated tech-pack version unless an authorized update explicitly changes that reference.

---

## 20. User Experience Requirements

The visualization experience MUST emphasize direct manipulation and visual comprehension.

### 20.1 Viewport interaction

**FR-RV-173** The editor SHOULD provide an efficient means of switching between 2D, 3D, image-reference, and comparison views where supported.

**FR-RV-174** The editor SHOULD support split views when simultaneous comparison materially helps the workflow.

**FR-RV-175** The editor SHOULD maintain useful camera and viewport state during routine component edits.

**FR-RV-176** The system MUST distinguish view controls from garment-editing controls.

**FR-RV-177** The UI SHOULD indicate when a visual representation is stale relative to the current design revision.

**FR-RV-178** The UI MUST display actionable feedback when a requested view or fidelity level is unsupported.

### 20.2 Selection and contextual feedback

**FR-RV-179** Selecting a structured component SHOULD highlight its representation in every view where the synchronization level supports it.

**FR-RV-180** The UI SHOULD display the selected component's name and relevant properties.

**FR-RV-181** The UI SHOULD indicate when a selected region is only an approximate annotation on a raster image.

**FR-RV-182** Unsupported operations MUST be disabled or clearly explained rather than appearing to succeed.

**FR-RV-183** The system SHOULD offer visual defaults and guided controls instead of requiring users to understand technical renderer settings.

### 20.3 Revision comparison

**FR-RV-184** Users MUST be able to identify the source revision associated with each comparison panel.

**FR-RV-185** The UI SHOULD support highlighting changed components where structured change information is available.

**FR-RV-186** The system MUST avoid presenting rendering noise, changed lighting, or camera differences as confirmed design changes.

---

## 21. Security and Privacy Requirements

**FR-RV-187** Render requests MUST verify access to the source design and all protected input assets.

**FR-RV-188** The rendering pipeline MUST enforce tenant isolation across jobs, caches, temporary files, and stored outputs.

**FR-RV-189** Renderer workers MUST access only the assets and credentials required for their assigned jobs.

**FR-RV-190** Imported SVG, GLB/glTF, image, and other supported files MUST be treated as untrusted input.

**FR-RV-191** The system MUST enforce file size, memory, processing-time, and complexity limits for untrusted inputs.

**FR-RV-192** External resource loading from imported assets MUST be restricted or disabled unless explicitly required and securely controlled.

**FR-RV-193** Rendering workers MUST NOT execute arbitrary scripts embedded in source assets.

**FR-RV-194** AI visual processing MUST follow the authorization, credential, and data-transfer requirements of SPEC-GDP-009.

**FR-RV-195** Render manifests and logs MUST NOT include provider credentials or unnecessary sensitive content.

**FR-RV-196** Sensitive preview and export assets MUST use authorized delivery mechanisms and appropriate expiry for temporary access links.

**FR-RV-197** Security-sensitive render and export actions MUST be auditable.

---

## 22. Performance and Scalability Requirements

The following values are initial engineering targets, not claims about measured production performance. They MUST be validated through representative garment workloads and target-device testing.

| Operation                                 | Initial target       | Notes                                                       |
| ----------------------------------------- | -------------------- | ----------------------------------------------------------- |
| Basic structured 2D viewport update       | p95 under 100 ms     | For local updates on a representative supported device      |
| Simple cached preview retrieval           | p95 under 500 ms     | Excludes unusually large transfers                          |
| Initial interactive 3D viewport readiness | p95 under 3 seconds  | For a defined representative scene and supported device     |
| Standard asynchronous preview             | p95 under 10 seconds | Excludes AI generation and unusually complex scenes         |
| High-quality export                       | Job-based            | Completion target determined by format and scene complexity |

**NFR-RV-001** The editor MUST remain usable while a non-blocking render job is executing.

**NFR-RV-002** Long-running rendering and simulation work SHOULD execute asynchronously.

**NFR-RV-003** The system SHOULD support progressive previews while higher-quality outputs are being generated.

**NFR-RV-004** Local geometry updates SHOULD avoid unnecessary full-scene reconstruction.

**NFR-RV-005** The rendering system MUST define supported limits for scene complexity, image resolution, mesh size, and concurrent jobs.

**NFR-RV-006** Resource-intensive jobs MUST use quotas or scheduling controls appropriate to the platform's commercial and operational policies.

**NFR-RV-007** The system SHOULD support independent scaling of rendering workers and AI orchestration where operationally justified.

**NFR-RV-008** Rendering metrics MUST distinguish queue time, geometry-build time, render time, validation time, and delivery time.

**NFR-RV-009** Performance tests MUST cover representative garment types, material complexity, and supported client devices.

**NFR-RV-010** Cache effectiveness, failure rates, and resource consumption MUST be observable.

---

## 23. Reliability and Recovery

**NFR-RV-011** Render jobs MUST be recoverable or safely terminalized after worker failure.

**NFR-RV-012** Duplicate delivery of a render request MUST NOT corrupt stored outputs or source design state.

**NFR-RV-013** The system SHOULD use idempotency keys or equivalent request deduplication where appropriate.

**NFR-RV-014** A worker restart MUST NOT publish a partial output as complete.

**NFR-RV-015** The platform MUST define retention policies for temporary files, intermediate geometry, and failed outputs.

**NFR-RV-016** The system MUST preserve the last valid render when a later attempt fails.

**NFR-RV-017** A rendering-engine upgrade MUST be versioned and tested against representative regression scenes.

**NFR-RV-018** The system SHOULD support reproducible rendering for a fixed source state and configuration, subject to documented nondeterminism in GPU drivers, external engines, and AI services.

---

## 24. Integration Contracts

### 24.1 Canonical design model

The rendering subsystem consumes immutable revision snapshots or an equivalent consistency-protected view of the canonical design model.

It MUST NOT write unreviewed inferred properties into the canonical model.

### 24.2 Artifact registry

The renderer resolves exact artifact revisions. It MUST NOT automatically substitute the latest artifact version for a historical design.

### 24.3 AI orchestration

AI-based rendering operations MUST use the central orchestration pipeline, including provider routing, policy enforcement, credential handling, usage tracking, and job traceability.

### 24.4 Asset storage

The rendering subsystem stores outputs through the shared asset service. It MUST record ownership, source references, output type, and lifecycle status.

### 24.5 Project lifecycle and versioning

Every persisted output MUST be linked to the relevant design revision. Rendering MUST NOT implicitly approve or release a design.

### 24.6 Tech-pack subsystem

Tech-pack illustrations MUST be generated from the design revision bound to the applicable tech-pack version. Releasing a tech pack MUST NOT cause its referenced illustrations to change retroactively.

### 24.7 Security subsystem

All render requests, result retrievals, and exports MUST enforce the security requirements in SPEC-GDP-009.

---

## 25. Core Rendering Data Contracts

The following examples are illustrative logical contracts. Production field names MUST be aligned with the canonical model and existing subsystem APIs.

### 25.1 Render request

```
{
  "request_id": "req_example",
  "source": {
    "design_id": "dsg_example",
    "revision_id": "rev_0007"
  },
  "purpose": "technical_flat",
  "representation": "2d_vector",
  "profile": {
    "profile_id": "technical_flat",
    "version": 1
  },
  "scope": {
    "type": "full_design"
  },
  "outputs": ["svg", "png"]
}
```

### 25.2 Geometry component

```
{
  "component_id": "cmp_sleeve_left",
  "component_type": "sleeve",
  "geometry": {
    "representation": "vector_path",
    "geometry_asset_id": "geo_example",
    "capability": "G2"
  },
  "transform": {
    "coordinate_system": "design_2d",
    "translation": [0, 0],
    "rotation_degrees": 0,
    "scale": [1, 1]
  },
  "source_artifact": {
    "artifact_id": "SLV-0007",
    "artifact_revision_id": "artrev_0003"
  }
}
```

The example illustrates the relationship between a component, its geometry, and an optional artifact reference. The canonical design schema remains authoritative.

### 25.3 Render result

```
{
  "render_id": "rnd_example",
  "job_id": "job_example",
  "source_revision_id": "rev_0007",
  "status": "completed_with_warnings",
  "validation": {
    "status": "passed_with_warnings",
    "warnings": [
      {
        "code": "BACK_VIEW_NOT_AVAILABLE",
        "scope": "technical_flat",
        "message": "A validated back-view geometry was not available."
      }
    ]
  },
  "outputs": [
    {
      "format": "svg",
      "asset_id": "asset_svg_example"
    },
    {
      "format": "png",
      "asset_id": "asset_png_example"
    }
  ]
}
```

### 25.4 Required contract behavior

**FR-RV-198** Request and response contracts MUST be versioned.

**FR-RV-199** Invalid source references or unsupported render configurations MUST be rejected with structured errors.

**FR-RV-200** Render outputs MUST have stable identifiers independent of temporary download URLs.

**FR-RV-201** Contract changes MUST include compatibility and migration plans.

**FR-RV-202** API responses MUST distinguish completed outputs from warnings, failures, and pending work.

---

## 26. End-to-End Reference Scenario

### Scenario: Change a sleeve and decorative hem trim

**Initial state**

A merchandiser opens an approved visual design containing:

- A structured garment body
- A sleeve component linked to artifact `SLV-0007`
- A lace trim linked to artifact `LAC-0012`
- An editable technical flat
- An approximate 3D scene

The design has geometry capability G3 for its 3D representation and G2 for its 2D representation.

**Workflow**

1. The user selects the sleeve in the editor.
2. The selection resolves to the sleeve component identifier.
3. The user chooses another sleeve artifact.
4. The application constructs a structured design operation referencing the exact new artifact revision.
5. The operation is validated against placement and compatibility rules.
6. The canonical design model creates or prepares a new revision according to the project workflow.
7. The renderer invalidates affected 2D and 3D derived outputs.
8. The 2D renderer updates the sleeve outline and attached trim placement where the supported geometry rules permit.
9. The 3D scene builder updates the corresponding component if the new artifact has compatible 3D geometry.
10. If the replacement artifact lacks 3D geometry, the system preserves the existing valid view where appropriate or presents a disclosed placeholder or regeneration requirement.
11. The editor displays the updated technical flat and 3D preview.
12. The user compares the previous and new design revisions.
13. The system records the render manifests and validation results.
14. The user decides whether to retain the new revision or revert to the earlier revision.

**Expected result**

The user can inspect the change without manually recreating every view. The system preserves artifact provenance, does not claim unsupported 3D accuracy, and does not modify the earlier revision.

---

## 27. Acceptance Criteria

| ID        | Acceptance criterion                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| AC-RV-001 | A render is traceable to an exact source design revision.                                                                           |
| AC-RV-002 | Structured 2D geometry can be rendered and edited without requiring a complete 3D model.                                            |
| AC-RV-003 | Raster-only visual inputs are not automatically treated as editable vector or 3D geometry.                                          |
| AC-RV-004 | Geometry capability is explicitly classified and displayed when material to the workflow.                                           |
| AC-RV-005 | Artifact-based visual components retain their source artifact and revision references.                                              |
| AC-RV-006 | Supported component changes update all applicable derived views.                                                                    |
| AC-RV-007 | Unsupported synchronization is disclosed rather than silently implied.                                                              |
| AC-RV-008 | AI visual outputs do not overwrite canonical geometry or confirmed production properties without an authorized, validated workflow. |
| AC-RV-009 | Render jobs preserve source revision, profile version, status, and output provenance.                                               |
| AC-RV-010 | Failed jobs do not corrupt previous successful outputs.                                                                             |
| AC-RV-011 | Cache hits cannot return a render for an incompatible revision or authorization scope.                                              |
| AC-RV-012 | Technical-flat export retains source revision metadata and supported editable vector information.                                   |
| AC-RV-013 | 3D exports identify the supported geometry representation and its limitations.                                                      |
| AC-RV-014 | Render validation is distinguishable from production validation.                                                                    |
| AC-RV-015 | Tech-pack illustrations remain bound to the correct tech-pack and design revisions.                                                 |
| AC-RV-016 | Untrusted geometry and vector files are validated before processing.                                                                |
| AC-RV-017 | AI-based visual operations use central orchestration and applicable usage tracking.                                                 |
| AC-RV-018 | The editor remains usable while asynchronous rendering proceeds.                                                                    |
| AC-RV-019 | Authorization is checked for both render creation and result retrieval.                                                             |
| AC-RV-020 | Rendering and synchronization regression tests cover representative supported garment types.                                        |

---

## 28. Implementation Roadmap

### Phase 1 — Structured 2D and rendering foundation

- Integrate with the canonical garment design model.
- Define the render request, profile, manifest, and result contracts.
- Implement a structured 2D renderer for supported garment components.
- Support SVG technical flats and raster previews.
- Integrate the artifact registry and asset storage.
- Implement source-revision traceability and render caching.
- Establish render job lifecycle, validation, and error handling.
- Add security and tenant-isolation checks.
- Provide basic visual comparison and revision-aware preview display.

**Phase 1 outcome:** A reliable visual editor foundation in which supported structured design changes can produce traceable, editable 2D output.

### Phase 2 — Interactive 3D visualization

- Select and integrate an appropriate browser-based 3D rendering technology.
- Define the scene graph and geometry-builder interfaces.
- Support component-aware 3D scenes where geometry is available.
- Add camera controls, material mapping, component isolation, and progressive loading.
- Implement geometry fidelity labels and fallback views.
- Synchronize supported component changes between 2D and 3D.
- Support GLB/glTF export for compatible scenes.

**Phase 2 outcome:** Interactive 3D visualization with explicit capability boundaries and reliable revision linkage.

### Phase 3 — Advanced material and AI-assisted visualization

- Improve texture mapping and fabric appearance.
- Support advanced trims, embroidery, and decorative component placement.
- Integrate AI-assisted visual generation and targeted image editing.
- Route operations between deterministic rendering and AI execution.
- Add visual comparison tools and output-quality feedback.
- Improve rendering caches, performance telemetry, and cost visibility.

**Phase 3 outcome:** More expressive visual exploration without sacrificing source traceability or structured design integrity.

### Phase 4 — Pattern-linked and higher-fidelity geometry

- Integrate a pattern-aware geometry engine if required by product strategy.
- Define validated 2D pattern-to-3D mapping.
- Introduce appropriate cloth simulation where commercially justified.
- Implement physical-property provenance and simulation configuration tracking.
- Add geometry and production validation appropriate to supported use cases.
- Establish explicit G5/G6 qualification criteria before claiming advanced production fidelity.

**Phase 4 outcome:** Higher-fidelity garment development for supported garment types, with validation-backed capability claims.

---

## 29. Architecture Decisions and Risks

### 29.1 Renderer strategy

The team MUST decide whether the initial 2D and 3D renderers will use:

- A unified graphics framework.
- Separate specialized renderers behind common interfaces.
- A hybrid approach combining browser rendering and server-side export rendering.

**Recommendation:** Use specialized rendering implementations behind shared design, render-job, and manifest contracts. This allows the product to select appropriate tools for vector editing, interactive 3D, and high-quality export without coupling the canonical model to a particular renderer.

### 29.2 Geometry generation strategy

The platform MUST determine which garment types require native structured geometry at launch and which can initially rely on annotated images or AI-generated proposals.

**Recommendation:** Begin with a clearly defined garment subset and reliable structured 2D support. Introduce structured 3D for garment categories where the team can validate component geometry and synchronization.

### 29.3 AI-to-geometry boundary

Image generation, mesh generation, and pattern generation have different accuracy and validation requirements.

**Recommendation:** Treat each as a separate capability with its own inputs, outputs, validation rules, and acceptance criteria. Do not infer support for one capability from success in another.

### 29.4 Fidelity and performance trade-offs

Higher visual quality can increase render latency, memory use, GPU requirements, and operating cost.

**Recommendation:** Define preview, interactive, and export quality profiles. Use progressive previews and asynchronous high-quality jobs rather than requiring every interaction to trigger a full-quality render.

### 29.5 Artifact geometry completeness

A library artifact may contain a raster image but no editable vector or 3D representation.

**Recommendation:** Track geometry availability and fidelity as artifact metadata. The UI should explain which operations are supported for each artifact rather than silently inventing missing geometry.

---

## 30. Definition of Done

The rendering, visualization, and geometry subsystem is ready for its initial production release when:

1. Render requests and outputs are bound to explicit design revisions.
2. The canonical garment model remains the authoritative source of structured design state.
3. Supported 2D technical flats are editable and traceable to component identifiers.
4. Raster images are clearly distinguished from structured geometry.
5. Render manifests capture required source, profile, artifact, and output provenance.
6. The render-job lifecycle handles retries, failures, cancellation, and validation.
7. Rendering caches respect revision compatibility and tenant isolation.
8. Supported 2D/3D synchronization behavior is documented and tested.
9. The UI communicates approximate geometry and unsupported fidelity levels.
10. AI visual generation is mediated by central orchestration and does not silently modify confirmed production data.
11. Export outputs preserve appropriate source revision metadata.
12. Rendering validation is not misrepresented as manufacturing validation.
13. Security controls cover source assets, render jobs, caches, and exported files.
14. Performance targets have been tested on representative garment designs and supported devices.
15. The team has documented the garment types and geometry capabilities supported by the release.

## 31. Final Architectural Rule

**A rendered garment is a view of a design, not automatically the design itself.**

GDP MUST preserve the distinction between structured design intent, editable 2D geometry, 3D scene geometry, visual appearance, physical simulation, and manufacturing-validated data.

All representations MUST remain traceable to the correct design revision. The platform MUST be explicit about what it knows, what it has inferred, what it has rendered, and what has actually been validated.

**End of document — SPEC-GDP-010 v0.1**
