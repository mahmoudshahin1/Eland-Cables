# Inquiry Line Cable Authority Integration (Increment 11)

## Strict Rules for Commercial Cable Selection

Under no circumstances may an inquiry line or quotation line independently guess, fabricate, or declare cable existence. All cable validation delegates directly to the central domain service:

$$\text{evaluateCableAuthority}(\text{config}, \text{context})$$

---

## The Two Governed Paths

### Path A: Existing Master Cable Selection
1. Customer / Sales selects a material number (e.g. `10009487`).
2. System calls `evaluateCableAuthority({ materialNumber })`.
3. If the cable has an `APPROVED` engineering mapping in `CableEngineeringMapping`:
   - Returns **`EXISTING_CABLE`**.
   - Line is marked **`CABLE_VALIDATED`**.
   - Invokes Costing Readiness Gate (`evaluateCableCostingReadiness`).
   - If readiness passes, triggers material cost calculation and marks line as **`COSTING_READY`**.

### Path B: Unmapped Custom Configuration
1. User configures a custom construction in the Cable Configurator.
2. System calls `evaluateCableAuthority(configurationPayload)`.
3. If parameters are valid and compatible but unmapped in `CableMaster`:
   - Returns **`TECHNICALLY_VALID_NOT_MASTER`**.
   - Line is marked **`TECHNICAL_OFFICE_REQUIRED`**.
   - System automatically generates a `TechnicalOfficeRequest` (`TCR-INQ-YYYYMMDD-XXXX`) without inventing fake Cable Master material numbers or item codes.
4. If parameters are incompatible:
   - Returns **`INVALID_CONFIGURATION`**.
   - Line addition is **strictly rejected**.
5. If compatibility rules are missing:
   - Returns **`CONFIGURATION_REQUIRED`**.
   - Progression is blocked until governed compatibility rules are configured.
