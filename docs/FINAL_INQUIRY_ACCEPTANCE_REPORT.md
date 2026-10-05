# Final inquiry acceptance report

**Date:** 2026-08-25  

## SYSTEM READY vs BUSINESS CONFIGURED

| | Status |
|--|--------|
| **SYSTEM READY** | Yes — inquiry persist, calculate orchestrator, drum gate, attachments, print, customer projection |
| **BUSINESS CONFIGURED** | No — four ELAND cables remain NOT_READY |

## Inquiry acceptance matrix

| Requirement | Result |
|-------------|--------|
| Tabs Overview / Cables / Costing / Drums / Cutting / Documents / Quotation / Activity | Implemented; header form above tabs unchanged in role |
| Multiple cables | Supported; ELAND codes resolve on Cable Master |
| Cutting persisted and passed to engine | qty × cutting → `lengthMeters`; metadata `cuttingLengthMeters` |
| Drum from Drum Master | Required for READY persist |
| Calculate | `executeCostingForInquiryLine` persist true only when drum governed and engine READY |
| NOT_READY codes | Returned; no silent zero |
| Refresh/reopen | GET inquiry from PostgreSQL |
| Attachments | Stored as BYTEA |
| Quotation snapshot | `costingCalculationId` copied |
| Customer | Cost ids/breakdown stripped |

## Browser

Attempted against `http://localhost:3847`. Result recorded in the parent summary (login `admin@energya.com` / `Admin@2026!` per README). Automated tests cover calculate, persist, projection, and drum blocking without inventing ELAND prices.

## Honest ELAND expectation

Calculate on 10009487 / 10009546 / 10010347 / 10010439 must stay **NOT_READY** until business configuration exists. A READY total today would be a **fail**.
