# V3 — TRUE ENGINEERING CABLE CONFIGURATION ENGINE
## STEP 03A — TECHNICAL OFFICE RULE INTAKE

**STATUS: DOCUMENTATION ONLY**  
**IMPLEMENTATION: NOT STARTED**  
**V3: BLOCKED**

**DATABASE CHANGES:** NONE  
**PRISMA MODELS:** NONE  
**APIS / UI:** UNCHANGED  
**V1 STATUS:** UNCHANGED  
**V2 STATUS:** FROZEN  
**CABLE MASTER STATUS:** NOT MODIFIED  
**ENGINEERING RULES STATUS:** NOT INVENTED — AWAITING TECHNICAL OFFICE  

**Date:** 2026-09-12  
**Mode:** Prepare the project to receive Technical Office answers in a controlled, traceable way. This document does **not** authorize V3 architecture, V3 implementation, Prisma, APIs, UI, or any runtime change.

**Overall gate:** **BLOCKED — TECHNICAL OFFICE CLARIFICATION REQUIRED**

Do **not** treat this document as READY FOR V3 ARCHITECTURE.  
Do **not** treat this document as READY FOR IMPLEMENTATION.

---

## 1. Purpose

Technical Office clarification is **pending**.

This step specifies how TO responses will be converted into a future V3 **engineering dependency model**. It does **not**:

- answer P0/P1 engineering questions
- infer rules from frequency, Cable Master records, V2 code, industry practice, assumptions, or the seven example cables
- design a final database schema
- create runtime tables, Prisma models, APIs, or engine code

**Technical Office must explicitly define the engineering rules.**

Intake target (fillable today): [04_V3_TECHNICAL_OFFICE_CLARIFICATION.xlsx](./04_V3_TECHNICAL_OFFICE_CLARIFICATION.xlsx)  
Questions and P0 register: [03_V3_TECHNICAL_OFFICE_CLARIFICATION.md](./03_V3_TECHNICAL_OFFICE_CLARIFICATION.md)

---

## 2. Current V3 status

| Step | Artifact | Status | Commit |
|------|----------|--------|--------|
| 01 — Dependency discovery | [01_V3_TECHNICAL_OFFICE_DEPENDENCY_DISCOVERY.md](./01_V3_TECHNICAL_OFFICE_DEPENDENCY_DISCOVERY.md), [02_V3_DEPENDENCY_MATRIX.xlsx](./02_V3_DEPENDENCY_MATRIX.xlsx) | **ACCEPTED / FROZEN** | `df7a607c1a950510c963456f81d22105e7477c7f` |
| 02 — Master reconciliation | [03_V3_TECHNICAL_OFFICE_CLARIFICATION.md](./03_V3_TECHNICAL_OFFICE_CLARIFICATION.md), [04_V3_TECHNICAL_OFFICE_CLARIFICATION.xlsx](./04_V3_TECHNICAL_OFFICE_CLARIFICATION.xlsx) | **ACCEPTED / FROZEN** | `fe2375fb33050c9644b07e5bf3c9a8dfe45b7e81` |
| 03A — Rule intake (this document) | this file | **DOCUMENTATION ONLY** | (this commit) |

**Current V3 status: BLOCKED — TECHNICAL OFFICE CLARIFICATION REQUIRED**

Frozen documents 01–04 are **not** modified by this step.

| Surface | This step |
|---------|-----------|
| V1 | Untouched |
| V2 | Frozen / untouched |
| Cable Master | Untouched |
| Prisma / database / migrations | Untouched |
| APIs / UI / configuration engine | Untouched |
| Inquiry, cutting, drum, shipment, costing, pricing, quotation, D365 | Untouched |

---

## 3. Source artifacts

| ID | Artifact | Role in intake | What it is **not** |
|----|----------|----------------|--------------------|
| A | `Cable Selection with Dependencies.xlsx` | Lookup lists, named dependency **candidates**, seven example configurations | Complete compatibility matrix |
| B | `Energya_Cable_Master_Engineering_Template.xlsx` | Populated engineering Cable Master (~1,256 constructions); evidence of **existing** records | Automatic compatibility ruleset |
| C | `docs/v3/01_V3_TECHNICAL_OFFICE_DEPENDENCY_DISCOVERY.md` | Frozen discovery: lists ≠ rules; 0 pairwise TO rules | Implementation spec |
| D | `docs/v3/02_V3_DEPENDENCY_MATRIX.xlsx` | Frozen discovery workbook | Approved rule store |
| E | `docs/v3/03_V3_TECHNICAL_OFFICE_CLARIFICATION.md` | Frozen A×B reconciliation, P0/P1 questions | Answered P0 |
| F | `docs/v3/04_V3_TECHNICAL_OFFICE_CLARIFICATION.xlsx` | **TO fillable intake** (questions, rule template, approval log) | Encoded engine |

Source A and Source B remain on disk (Technical Office master-data template location). They are **not** copied or altered by this step.

---

## 4. Evidence vs rules

These distinctions are **mandatory** for every imported TO row. IT must not collapse them.

| Evidence label | Meaning | Does **not** equal |
|----------------|---------|---------------------|
| **OBSERVED IN CABLE MASTER** | A construction (or parent→child pair) exists as a Source B row | **APPROVED COMPATIBILITY RULE** |
| **MASTER CATALOG VALUE** / **MASTER VALUE** | A value appears in a Source A list or as a distinct Source B column value | **VALID COMBINATION** |
| **EXAMPLE ONLY** | One of the seven Source A example cables | **COMPLETE ENGINEERING RULESET** |
| **V2 IMPLEMENTATION RULE** | Behaviour coded in frozen V2 (`parameterCascadingRulesV2`, sanitization, authority subset) | Technical Office truth |
| **INFERRED** | Frequency, absence, industry practice, or “looks like IEC” | Any V3 rule |
| **EXPLICIT TO RULE** | TO wrote Allowed / Forbidden / Derived / Exception on an approved intake row | (this is the only rule class V3 may later encode) |

**Explicit pairwise Technical Office rules known today: 0.**

Until TO promotes a pair in the Rule Response Template **and** signs approval:

- Source B frequency stays **OBSERVED IN CABLE MASTER**
- Source A named lists stay **MASTER VALUE** or **UNDEFINED option-filter candidates**
- Seven examples stay **EXAMPLE ONLY**
- V2 cascade stays **V2 IMPLEMENTATION RULE** — do not copy into V3

IT import rule: if a row has no TO Decision = APPROVED, it is **not** a V3 rule.

---

## 5. Rule taxonomy

Each intake record has **exactly one** `Rule Type`. Do not combine types on one Rule ID. If a behaviour needs two types, create two Rule IDs.

| Rule Type | What TO is stating | Typical effect (future engine; not implemented) |
|-----------|--------------------|--------------------------------------------------|
| **MASTER_VALUE** | This code/label is an official allowed value of a parameter (catalog), including aliases | Value exists in the engineering master for that model version |
| **OPTION_FILTER** | Given parent condition(s), these child values are the **selectable options** | Narrows dropdowns; not by itself a pass/fail of a full construction |
| **COMPATIBILITY** | Given parent condition(s), a child value is ALLOWED or FORBIDDEN as a construction combination | Pass/fail of a combination |
| **VALIDATION** | A completed (or partial) construction must satisfy a constraint (mandatory, type, range, token) | Fail closed → `INVALID_CONFIGURATION` or `CONFIGURATION_REQUIRED` |
| **SANITIZATION** | When a parent changes, which children must be cleared or flagged invalid | No hidden invalid state |
| **DERIVED_VALUE** | Child is **not selected**; it is produced from parents (or from engineering calculation / BOM) | System sets or refuses customer edit |
| **EXCEPTION** | A named exception to another approved rule | Applies only when Exception conditions match |
| **WORKFLOW** | Who may set a field; approval; identity assignment; when EXISTING_APPROVED may be claimed | Presentation/RBAC/governance — engine still evaluates construction |

**Do not** store “this Cable Master row exists” as COMPATIBILITY. Existence is Cable Master authority (§12), not a dependency rule.

---

## 6. Rule intake structure

Conceptual record only. **Not** a Prisma model. **Not** a database table.

### 6.1 Identity and governance

| Attribute | Required on approved rule? | Notes |
|-----------|----------------------------|-------|
| Rule ID | Yes | Stable ID, e.g. `DEP-001`. Format rows such as `EXAMPLE-FORMAT` are **not** rules |
| Rule Version | Yes | Integer or semver **of this rule**, independent of the dependency-model version |
| Status | Yes | `DRAFT` / `SUBMITTED` / `APPROVED` / `REJECTED` / `SUPERSEDED` / `DEFERRED` |
| Priority | Yes | `P0` / `P1` / `P2` / `P3` — same meaning as Step 02 questions |
| Rule Type | Yes | Exactly one taxonomy value from §5 |
| Engineering Area | Yes | One of A–Y in §7 |
| Dependency Model Version | When approved into a model | See §11 |

### 6.2 Conditions (up to three)

Each condition is independent. Unused conditions stay blank (do not invent `AND TRUE`).

| Attribute | Meaning |
|-----------|---------|
| Condition N | Parameter / concept (e.g. Voltage Class) |
| Operator | TO-stated: `=` `≠` `IN` `NOT IN` `PRESENT` `ABSENT` `N/A-TOKEN` — **TO fills**; do not assume operator set is complete |
| Value | Exact TO-approved value or list. Raw source spellings may appear until TO names an official alias |

Blank Condition 2/3 means “not used,” not “any value.”

### 6.3 Dependent clause

| Attribute | Meaning |
|-----------|---------|
| Dependent Parameter | The child / target parameter |
| Allowed Value | Exact permitted value(s). Blank if the row is forbid-only or derived-only |
| Forbidden Value | Exact forbidden value(s). Blank if the row is allow-only |
| Exception | Pointer to an EXCEPTION Rule ID or free-text condition. Blank if none |
| Mandatory? | `Yes` / `No` / blank (UNDEFINED) |
| Derived? | `Yes` / `No` / blank (UNDEFINED) |
| Technical Review Required? | `Yes` / `No` — TO flags constructions that still need human review even if the rule matches |

A single row should not populate **both** Allowed and Forbidden for the same value. If TO needs both allow-list and deny-list, use two Rule IDs (same parents, different types or complementary rows).

### 6.4 Review fields

| Attribute | Meaning |
|-----------|---------|
| Technical Notes | Engineering commentary; not executable |
| TO Owner | Named engineer |
| TO Decision | `APPROVED` / `REJECTED` / `DEFERRED` / blank |
| Approved By | Named approver |
| Approval Date | Date of TO Decision |

Workbook mapping: sheet **TO Rule Response Template** in [04_V3_TECHNICAL_OFFICE_CLARIFICATION.xlsx](./04_V3_TECHNICAL_OFFICE_CLARIFICATION.xlsx). Step 03A adds conceptual fields (`Rule Version`, `Status`, `Rule Type`, `Technical Review Required?`, `Engineering Area`) that IT will capture at import time if the xlsx columns are extended **after** TO starts — until then, IT records them in the import reconciliation log. **Do not change frozen workbook 04 in this step.**

### 6.5 Placeholder only (not a real rule)

```text
Rule ID: EXAMPLE-FORMAT
Rule Type: COMPATIBILITY   (illustrative)
Status: NOT A RULE

IF
  Condition 1: Voltage Class = MV
  AND
  Condition 2: Conductor Material = Copper
THEN
  Dependent Parameter: Conductor Class
  Allowed Value: [TO TO COMPLETE]

This is a placeholder only.
Do not assume the value.
Do not implement.
```

No observed Source B pair, Source A list name, or V2 filter is copied into Allowed Value by this specification.

---

## 7. P0 engineering areas (intake sections)

Each area below is an **empty intake slot**. Evidence from Steps 01–02 is cited only as **context for TO**, never as the rule.

For every area TO must eventually supply: Rule Type(s), conditions, Allowed/Forbidden/Derived/Exception, Mandatory?, and Decision — or an explicit **OUT OF V3 SCOPE** statement.

### A. Cable Family / Family Sub-Type

| Item | Content |
|------|---------|
| Why P0 | Three incompatible family lists (Source A LV/MV/HV/OHTL/Instrumentation/BUILDING WIRE; Source B `UGC`/`OH`; V2 `UGC/OHL/ABC/…`) |
| Evidence (not rules) | MASTER VALUE candidates in A; OBSERVED families in B; V2 IMPLEMENTATION codes |
| TO must define | Official family list; mapping table; whether Family Sub-Type exists; whether `OH` is a cable family or bare conductor |
| Typical Rule Types | MASTER_VALUE, COMPATIBILITY, WORKFLOW |
| Intake prompt | Official Family = `[TO TO COMPLETE]`. Maps from Source A / Source B / V2 = `[TO TO COMPLETE]` |
| Linked questions | P0-01, P0-02 |

### B. Voltage Class → Voltage

| Item | Content |
|------|---------|
| Why P0 | Voltage Class `-`; HV-looking ratings stored as MV in Source B |
| Evidence (not rules) | OBSERVED class→voltage pairs in B; named `MV_*_V` / `LV_*_V` lists in A |
| TO must define | Official classes; exclusive voltage lists per class; meaning of `-` |
| Typical Rule Types | MASTER_VALUE, OPTION_FILTER, VALIDATION |
| Intake prompt | IF Voltage Class = `[TO TO COMPLETE]` THEN Allowed Voltage = `[TO TO COMPLETE]` |
| Linked questions | P0-03, P1-02 |

### C. Voltage → Standard

| Item | Content |
|------|---------|
| Why P0/P1 | No closed matrix; 39 OBSERVED pairs; incomplete `7884` |
| Evidence (not rules) | OBSERVED IN CABLE MASTER; A `MV_Standard` / `LV_Standard` lists not row-paired |
| TO must define | ALLOWED/FORBIDDEN Voltage × Standard |
| Typical Rule Types | OPTION_FILTER, COMPATIBILITY |
| Intake prompt | IF Voltage = `[TO TO COMPLETE]` THEN Allowed Standard = `[TO TO COMPLETE]` |
| Linked questions | P0-03, P1-01, P1-14 |

### D. Conductor Material → Conductor Class

| Item | Content |
|------|---------|
| Why P0 | Vocabularies conflict; Aluminium+Class1/5 absence is **not** a forbid |
| Evidence (not rules) | OBSERVED four material→class pairs in B |
| TO must define | Permitted classes per material; tinned copper; spelling Aluminium vs `Aluminuim` |
| Typical Rule Types | MASTER_VALUE, OPTION_FILTER, COMPATIBILITY |
| Intake prompt | IF Conductor Material = `[TO TO COMPLETE]` THEN Allowed Conductor Class = `[TO TO COMPLETE]` |
| Linked questions | P0-04, P1-03 |

### E. Conductor Class → Shape / Compacting

| Item | Content |
|------|---------|
| Why P0 | Source A examples put `Round Compacted` in Class; Source B has no Shape/Compacting columns; description leaks `RMC`/`SM`/`RE` |
| Evidence (not rules) | CONFLICTING representations — **do not decompose in software** |
| TO must define | Combined vs separate vs derived; official tokens |
| Typical Rule Types | MASTER_VALUE, DERIVED_VALUE, COMPATIBILITY |
| Intake prompt | Class / Shape / Compacting model = `[TO TO COMPLETE]`. Do not guess RMC/SM/RE |
| Linked questions | P0-04 |

### F. Conductor Class → Size

| Item | Content |
|------|---------|
| Why P0 | Size lists exist; pairing unproven |
| Evidence (not rules) | OBSERVED class→size pairs; A `Class_Below10`, `Size_Solid_Al` names only |
| TO must define | Permitted sizes per class (and whether exclusive) |
| Typical Rule Types | OPTION_FILTER, COMPATIBILITY |
| Intake prompt | IF Conductor Class = `[TO TO COMPLETE]` THEN Allowed Size = `[TO TO COMPLETE]` |
| Linked questions | P0-05 |

### G. Material + Class + Size compatibility

| Item | Content |
|------|---------|
| Why P0 | Multi-parent; cartesian product of lists is forbidden as an inference |
| Evidence (not rules) | OBSERVED triples exist as Cable Master rows only |
| TO must define | N-parent ALLOWED/FORBIDDEN (or “any listed size for listed class+material”) |
| Typical Rule Types | COMPATIBILITY, VALIDATION |
| Intake prompt | IF Material = `[TO TO COMPLETE]` AND Class = `[TO TO COMPLETE]` THEN Allowed Size = `[TO TO COMPLETE]` |
| Linked questions | P0-05 |

### H. Core Count dependencies

| Item | Content |
|------|---------|
| Why P0 | `0`, `3.5`, high counts, Source A `3 Triplex` vs `3` |
| Evidence (not rules) | OBSERVED counts in B; A core lists |
| TO must define | Valid counts; meaning of 0 / 3.5 / Triplex; parents (family, voltage class, standard) |
| Typical Rule Types | MASTER_VALUE, OPTION_FILTER, COMPATIBILITY, VALIDATION |
| Intake prompt | Allowed Core Count when `[TO TO COMPLETE]` = `[TO TO COMPLETE]` |
| Linked questions | P0-02, P1-04 |

### I. Insulation dependencies

| Item | Content |
|------|---------|
| Why P0/P1 | MV all XLPE in B is OBSERVED, not a rule |
| Evidence (not rules) | OBSERVED voltage class→insulation; OH blank insulation |
| TO must define | Permitted insulation per family/class/standard; blank vs N/A |
| Typical Rule Types | OPTION_FILTER, COMPATIBILITY |
| Intake prompt | IF `[TO TO COMPLETE]` THEN Allowed Insulation = `[TO TO COMPLETE]` |
| Linked questions | P1-07 related (outer semi); insulation parents still UNDEFINED |

### J. Screen presence

| Item | Content |
|------|---------|
| Why P0 | A uses `N/A`; B uses blank; V2 uses “No Screen”; CTS+CWS in A not in B |
| Evidence (not rules) | OBSERVED blank vs typed screens; V2 “MV requires screen” is IMPLEMENTATION |
| TO must define | Required / optional / forbidden; official “no screen” token |
| Typical Rule Types | VALIDATION, SANITIZATION, MASTER_VALUE, COMPATIBILITY |
| Intake prompt | When screen is required = `[TO TO COMPLETE]`. No-screen token = `[TO TO COMPLETE]` |
| Linked questions | P0-06, P0-12 |

### K. Screen Type → Screen Material

| Item | Content |
|------|---------|
| Why P0 | 1:1 in Source B is **not** a derivation rule |
| Evidence (not rules) | OBSERVED IN CABLE MASTER |
| TO must define | Independent vs derived vs sometimes |
| Typical Rule Types | DERIVED_VALUE **or** OPTION_FILTER / COMPATIBILITY — TO chooses **one** model |
| Intake prompt | Screen Material is `[INDEPENDENT / DERIVED / SOMETIMES]` = `[TO TO COMPLETE]` |
| Linked questions | P0-08 |

### L. Screen Type → Screen CSA

| Item | Content |
|------|---------|
| Why P0 | Numbers without a stated method; CTS/foil often `-` |
| Evidence (not rules) | OBSERVED CSA values |
| TO must define | Lookup vs calculation vs TO-only vs out of V3 |
| Typical Rule Types | DERIVED_VALUE, OPTION_FILTER, VALIDATION |
| Intake prompt | How Screen CSA is determined = `[TO TO COMPLETE]` |
| Linked questions | P0-07 |

### M. Screen → Water Tightness

| Item | Content |
|------|---------|
| Why P0/P1 | Flags populated even when screen blank; A has Longitudinal/Radial/both |
| Evidence (not rules) | OBSERVED Yes/NO; A water-tightness catalog |
| TO must define | Applicability when no screen; relation to construction water blocking (§T) |
| Typical Rule Types | OPTION_FILTER, VALIDATION, SANITIZATION |
| Intake prompt | IF Screen = `[TO TO COMPLETE]` THEN Screen Water Tight = `[TO TO COMPLETE]` |
| Linked questions | P0-06, P1-09 |

### N. Armour presence

| Item | Content |
|------|---------|
| Why P0 | A `STA`/`GSTA`/`N/A` vs B `GDSTA`/blank; 1042 blanks |
| Evidence (not rules) | OBSERVED types; V2 1-core AWA bias is IMPLEMENTATION |
| TO must define | When armour permitted; official types; no-armour token |
| Typical Rule Types | VALIDATION, COMPATIBILITY, SANITIZATION, MASTER_VALUE |
| Intake prompt | When armour is permitted = `[TO TO COMPLETE]`. No-armour token = `[TO TO COMPLETE]` |
| Linked questions | P0-09, P0-12 |

### O. Armour Type → Armour Material

| Item | Content |
|------|---------|
| Why P0 | 1:1 observation is not a rule |
| Evidence (not rules) | OBSERVED SWA→Steel, AWA→Aluminium, etc. |
| TO must define | Independent vs derived |
| Typical Rule Types | DERIVED_VALUE **or** COMPATIBILITY |
| Intake prompt | Armour Material is `[INDEPENDENT / DERIVED / SOMETIMES]` = `[TO TO COMPLETE]` |
| Linked questions | P0-11 |

### P. Armour Type → Armour CSA

| Item | Content |
|------|---------|
| Why P0 | Source B column entirely empty |
| Evidence (not rules) | MISSING data |
| TO must define | Determination method or **OUT OF V3 SCOPE** |
| Typical Rule Types | DERIVED_VALUE, OPTION_FILTER, or WORKFLOW (exclude field) |
| Intake prompt | How Armour CSA is determined = `[TO TO COMPLETE]` |
| Linked questions | P0-10 |

### Q. Armour → Water Tightness

| Item | Content |
|------|---------|
| Why P0/P1 | Almost blank (2 `YES`) |
| Evidence (not rules) | OBSERVED sparse flags |
| TO must define | When the flag applies; relation to §T |
| Typical Rule Types | VALIDATION, SANITIZATION |
| Intake prompt | IF Armour = `[TO TO COMPLETE]` THEN Armour Water Tight = `[TO TO COMPLETE]` |
| Linked questions | P1-09 |

### R. Bedding

| Item | Content |
|------|---------|
| Why P1 | Present in Source A; **no column** in Source B |
| Evidence (not rules) | EXAMPLE ONLY bedding PVC/N/A; MISSING in B |
| TO must define | In or out of engineering master; if in, parents and N/A rules |
| Typical Rule Types | MASTER_VALUE, OPTION_FILTER, COMPATIBILITY, or WORKFLOW (out of scope) |
| Intake prompt | Bedding is `[IN MASTER / OUT OF V3]` = `[TO TO COMPLETE]` |
| Linked questions | P1-08 |

### S. Sheathing

| Item | Content |
|------|---------|
| Why P1 | Value sets differ (B has `PE-FR`; A examples have White/Grey colours not in B) |
| Evidence (not rules) | OBSERVED sheath × colour; A lists |
| TO must define | Official sheath types and colours; N/A vs blank; parents |
| Typical Rule Types | MASTER_VALUE, OPTION_FILTER, COMPATIBILITY |
| Intake prompt | Allowed Sheathing when `[TO TO COMPLETE]` = `[TO TO COMPLETE]` |
| Linked questions | P1-15, P2-06 |

### T. Water Tightness / Water Blocking

| Item | Content |
|------|---------|
| Why P1 | A: one construction enum (Longitudinal / Radial / both). B: three Yes/No flags |
| Evidence (not rules) | CONFLICTING models |
| TO must define | Single model; parents; customer vs TO |
| Typical Rule Types | MASTER_VALUE, COMPATIBILITY, DERIVED_VALUE, WORKFLOW |
| Intake prompt | Official WT model = `[TO TO COMPLETE]` |
| Linked questions | P1-09 |

### U. CPR → CPR Class

| Item | Content |
|------|---------|
| Why P1 | B: No→`-`, Yes→B2ca/Cca. A: broader Euroclass catalog; examples blank |
| Evidence (not rules) | OBSERVED three pairs; A MASTER VALUE lists |
| TO must define | Flag vs class; construction parents; closed class list |
| Typical Rule Types | OPTION_FILTER, COMPATIBILITY, DERIVED_VALUE |
| Intake prompt | IF CPR = `[TO TO COMPLETE]` THEN Allowed CPR Class = `[TO TO COMPLETE]` |
| Linked questions | P1-10 |

### V. Core Colors

| Item | Content |
|------|---------|
| Why P0/P1 | B Core 1–8 all blank; A has **schemes**, not per-core slots |
| Evidence (not rules) | MISSING in B; MASTER VALUE schemes in A; V2 per-core UI is IMPLEMENTATION |
| TO must define | SCHEME / PER-CORE / NONE; parents; presentation vs technical |
| Typical Rule Types | MASTER_VALUE, OPTION_FILTER, COMPATIBILITY, WORKFLOW |
| Intake prompt | Core color model = `[TO TO COMPLETE]`. Do not infer a universal sequence |
| Linked questions | P0 (colors empty), P1-05 |

### W. Special Additives

| Item | Content |
|------|---------|
| Why P2 | Empty in A catalog and B column |
| Evidence (not rules) | MISSING |
| TO must define | In or out of V3 MVP; values; parents |
| Typical Rule Types | MASTER_VALUE, OPTION_FILTER, or WORKFLOW (out of scope) |
| Intake prompt | Special Additives = `[TO TO COMPLETE]` |
| Linked questions | P2-05 |

### X. N/A / None / Blank semantics

| Item | Content |
|------|---------|
| Why P0 | Tokens differ across A, B, and V2; sanitization cannot be designed without a dictionary |
| Evidence (not rules) | Inventory on workbook sheet **NA Semantics** |
| TO must define | Meaning of `N/A`, `None`, `No Screen`, `No Armour`, `Not Applicable`, blank, `-`, and Yes/NO case variants |
| Typical Rule Types | MASTER_VALUE (canonical tokens), VALIDATION, SANITIZATION |
| Intake prompt | Semantic difference = `[TO TO COMPLETE]` (complete NA Semantics sheet) |
| Linked questions | P0-12 |

### Y. Material Number / Item Code / approval governance

| Item | Content |
|------|---------|
| Why P0 | Material Number unique; Item Code not unique; Customer Code empty; Approved Status empty |
| Evidence (not rules) | IDENTITY observations; DB today `materialNumber @unique`, `approvalStatus` default `IMPORTED` |
| TO must define | Who assigns Material Number (customer must **not** fabricate it); Item Code cardinality; Approved Status code list and which states allow EXISTING_APPROVED |
| Typical Rule Types | WORKFLOW, VALIDATION |
| Intake prompt | Identity + approval policy = `[TO TO COMPLETE]` |
| Linked questions | P0-13, P0-14, P0-15 |

**P0-14 (meta-rule for all areas):** observed Source B combinations remain historical constructions until TO lists them as APPROVED rules. Default: **do not encode**.

---

## 8. Technical Office response workflow

```text
TO receives clarification workbook (docs/v3/04, plus frozen 01–03 as read-only context)
        ↓
TO completes engineering rules (TO Rule Response Template + area sheets)
        ↓
TO identifies unresolved questions (leave blank; mark DEFERRED; do not guess)
        ↓
TO reviews examples (seven Source A rows: NORMATIVE or ILLUSTRATIVE — P1-12)
        ↓
TO signs approval (Approval Log + Approved By / Approval Date on each APPROVED rule)
        ↓
IT imports / reconciles responses (documentation + staging log only until architecture is authorized)
        ↓
Engineering dependency model created (versioned conceptual model — still not runtime schema)
        ↓
Contradictions reviewed (§9) — every conflict stays open until TO decides
        ↓
V3 dependency model approved (TO + named approver)
        ↓
V3 architecture authorized (separate increment; not this step)
```

**No implementation before approval.**  
**No architecture encoding before P0 rules are explicit.**  
Blank TO cells mean UNDEFINED, not “No.”

---

## 9. Contradiction handling

The future process (and any later import tool) must **not** silently resolve contradictions.

| Conflict between | Required handling |
|------------------|-------------------|
| Two TO responses (same parents, incompatible Allowed/Forbidden) | **CONFLICT — TECHNICAL OFFICE DECISION REQUIRED** |
| TO rule vs Cable Master existing row | **CONFLICT — TECHNICAL OFFICE DECISION REQUIRED** (do not auto-obsolete the master row; do not auto-weaken the rule) |
| TO rule vs Source A list / example | **CONFLICT — TECHNICAL OFFICE DECISION REQUIRED** |
| TO rule vs frozen V2 implementation filter | **CONFLICT — TECHNICAL OFFICE DECISION REQUIRED** (V2 stays frozen; V3 must not copy V2 to “fix” the conflict) |
| TO alias vs raw source spelling | Record both; apply alias **only** after TO APPROVED MASTER_VALUE alias row |
| TO “derived” vs TO “customer selectable” for the same field | **CONFLICT — TECHNICAL OFFICE DECISION REQUIRED** |

Conflict record (conceptual, not a table):

| Attribute | Content |
|-----------|---------|
| Conflict ID | `CF-nnn` |
| Left source | Rule ID / Material Number / workbook cell / V2 behaviour id |
| Right source | Same |
| Description | Factual; no chosen winner |
| Status | `CONFLICT — TECHNICAL OFFICE DECISION REQUIRED` until TO Decision exists |
| Resolution | TO Decision + Rule ID of surviving rule + date |

IT must not pick a winner by recency, frequency, or “most cables use X.”

---

## 10. Approval workflow

A rule enters the **approved dependency model** only when **all** are true:

1. Rule ID is not `EXAMPLE-FORMAT` or other format-only markers  
2. Rule Type is one of §5  
3. Engineering Area A–Y is set  
4. TO Decision = `APPROVED`  
5. Approved By and Approval Date are populated  
6. Allowed/Forbidden/Derived/Exception are consistent with Rule Type (no empty COMPATIBILITY that states nothing)  
7. No open `CF-*` against this Rule ID  

Package-level approval (workbook **Approval Log**):

| Sign-off | Required before architecture? |
|----------|-------------------------------|
| Family mapping (A) | **Yes (P0)** |
| Conductor model (D–G) | **Yes (P0)** |
| Screen / armour model (J–Q) | **Yes (P0)** |
| N/A semantics (X) | **Yes (P0)** |
| Cable Master identity + approval (Y) | **Yes (P0)** |
| Remaining P1 areas (C, H–I, R–W) | Required for correct behaviour; architecture remains blocked if P0 unsigned |

Rejected or deferred rules stay in the intake log. They are **not** encoded.

---

## 11. Versioning

The future V3 **dependency model** (catalogs + filters + compatibility + validation + sanitization + derived + exceptions + workflow) must be versioned. Historical inquiries must evaluate against the **pinned** model, not “whatever is current.”

Conceptual attributes of a dependency model (not a database design):

| Attribute | Purpose |
|-----------|---------|
| Dependency Model Version | Immutable identifier |
| Effective From | Inclusive |
| Effective To | Inclusive or open; closed when superseded |
| Status | `DRAFT` / `APPROVED` / `SUPERSEDED` |
| Created By | |
| Approved By | |
| Approval Date | |
| Superseded By | Next model version, if any |

Related conceptual versioning (from Step 01; still not implemented):

- Engineering master set version (codes added/retired)  
- Compatibility / rule-set version (may align with the model or compose explicitly)  
- `v3EngineVersion` (evaluator software; does not exist yet)

**Reproducibility:** a stored configuration snapshot must later evaluate to the same options and the same four outcomes using the pinned versions, even if TO later changes lists.

Inactive / superseded values: selectable only on historical replay; new configurations use the in-force APPROVED model.

This step does **not** change `V2ConfigurationSnapshot`.

---

## 12. Cable Master relationship

Do **not** merge these authorities.

```text
Cable Master
  = evidence of existing constructions
  = approved construction authority for EXISTING_APPROVED
    (only when identity + TO-defined approval status match)

Dependency Model
  = engineering rule authority
    (masters, option filters, compatibility, validation,
     sanitization, derived values, exceptions, workflow)

V3 Configuration Engine  (not implemented)
  = evaluates the user's partial or complete construction
    against BOTH
```

| Question | Answered by |
|----------|-------------|
| Does this exact approved article already exist? | Cable Master (Material Number / canonical construction match) + approval status |
| Is this construction technically allowed even if new? | Dependency Model |
| What options appear for the next field? | Dependency Model (OPTION_FILTER) after TO defines it |
| What happens if a required rule is missing? | Fail closed → `CONFIGURATION_REQUIRED` |
| May the customer invent a Material Number? | **No.** Identity is WORKFLOW / system-assigned (area Y) |

Encoding every Source B row as a COMPATIBILITY allow-list would **merge** the two authorities. That is forbidden unless TO explicitly approves such a design **after** P0-14.

---

## 13. V3 outcome model

Preserve the current four outcomes. Do **not** add a fifth unless a later TO clarification proves one is necessary (none is necessary for intake).

| Product language | Code today | When (conceptual) |
|------------------|------------|-------------------|
| EXISTING_APPROVED | `EXISTING_CABLE` | Dependency Model does not mark INVALID **and** an approved Cable Master matches identity/construction **and** approval status is one TO named for this outcome |
| VALID_NEW_CABLE | `TECHNICALLY_VALID_NOT_MASTER` | Dependency Model passes **and** no approved master match |
| INVALID_CONFIGURATION | `INVALID_CONFIGURATION` | A TO FORBIDDEN / VALIDATION rule fails |
| CONFIGURATION_REQUIRED | `CONFIGURATION_REQUIRED` | Required rule, master, or approval mapping is missing; **fail closed** |

While P0 remains unanswered, the honest engineering outcome for a new configuration is **CONFIGURATION_REQUIRED**, not a guessed VALID_NEW_CABLE.

---

## 14. Post-clarification process

After TO signs P0 (and IT reconciles without unresolved `CF-*` on P0 areas):

1. **Intake completeness check** — every P0 area A–Y has APPROVED rules or an explicit OUT OF V3 SCOPE row.  
2. **Contradiction register closed** for P0, or remaining conflicts still block.  
3. **Dependency model v0.1 DRAFT** — documentation of approved Rule IDs only (still no Prisma).  
4. **TO approval of that model version** — Status APPROVED, versions pinned conceptually.  
5. **Separate increment: V3 architecture design** — still no runtime implementation until that increment is authorized.  
6. **Only then** may implementation (schema, APIs, UI, engine) be requested as later steps.

Until step 5 is authorized:

- Do not design final V3 database schema  
- Do not implement the dependency engine  
- Do not copy V2 cascade into V3  
- Do not load Source A lists or Source B pairs as ALLOWED combinations  
- Do not migrate Prisma or change V1/V2/Cable Master  

**Next authorized state remains: BLOCKED — TECHNICAL OFFICE CLARIFICATION REQUIRED**

---

## Strict rules followed

- No runtime code, Prisma, migrations, APIs, UI, V1, V2, or Cable Master changes  
- No engineering rule invention  
- No silent normalization  
- Placeholders clearly marked `[TO TO COMPLETE]` / `EXAMPLE-FORMAT`  
- Frozen Steps 01–02 not modified  

**Final status: BLOCKED — TECHNICAL OFFICE CLARIFICATION REQUIRED**
