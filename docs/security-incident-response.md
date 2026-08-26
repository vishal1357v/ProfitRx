# Security Incident Response Policy

**Document Version:** 1.0  
**Effective Date:** August 26, 2026  
**Product:** ProfitRx SaaS  
**Scope:** All infrastructure, applications, databases, and third-party integrations  

---

## 1. Purpose & Objectives

This policy defines the protocol and operational procedures for detecting, containing, investigating, eradicating, and reporting security incidents and personal data breaches. It establishes our legal and contractual commitment under GDPR Article 33 and Shopify Level 2 Protected Customer Data requirements to notify affected merchants and Shopify within **72 hours**.

---

## 2. Incident Classification & Severity Matrix

| Severity | Definition | Examples | SLA for Initial Response |
|---|---|---|---|
| **P1 - Critical** | Active personal data breach, unauthorized DB access, compromised root credentials | Leaked database credentials, mass data exfiltration | **Immediate (< 1 hour)** |
| **P2 - Major** | Potential exposure of customer data, service compromise without confirmed breach | Suspicious administrative activity, unauthenticated API vulnerability | **< 4 hours** |
| **P3 - Moderate** | Minor vulnerability without data exposure, isolated service disruption | Failed authorization attempt on single resource, broken rate limiter | **< 12 hours** |
| **P4 - Low** | Informational security event, routine scanning alert | Deprecated package alert, informational log anomaly | **< 24 hours** |

---

## 3. Incident Response Team & Responsibilities

- **Security & Compliance Lead:** Leads incident triage, directs containment, liaises with legal and external stakeholders. Contact: `security@profitrx.app`
- **Technical Lead / Infrastructure Lead:** Executes technical containment, network isolation, credential revocation, and log forensics.
- **Merchant Communications Coordinator:** Prepares transparent notifications to affected merchants and regulatory bodies.

---

## 4. Five-Stage Incident Response Lifecycle

### Stage 1: Detection & Identification
- Ingestion of alerts from Vercel monitoring, Neon anomaly alerts, error boundaries, or external vulnerability reports.
- Initial classification against the Severity Matrix.
- Declaration of incident state and creation of an immutable Incident Log.

### Stage 2: Containment & Evidence Preservation
- **Short-Term Containment:**
  - Revocation of affected credentials (`TOKEN_ENCRYPTION_KEY`, database passwords, API secrets).
  - Temporary rate limiting or network isolation of compromised endpoints.
- **Evidence Preservation:**
  - Export and preservation of tamper-evident access logs from `CustomerDataAccessLog`, Neon connection logs, and Vercel edge access logs.
  - Volatile memory / state captures before serverless function container recycling.

### Stage 3: Eradication
- Identification of root cause (e.g., software bug, misconfigured access rule).
- Code patch deployment via standard git review and verification in isolated sandbox.
- Comprehensive scanning to confirm the vulnerability is no longer exploitable.

### Stage 4: Recovery & Verification
- Restoring systems to standard operational parameters.
- Heightened monitoring for a minimum 14-day post-incident stabilization window.
- Verification of data integrity across all database tables.

### Stage 5: Post-Mortem & Corrective Action
- Publication of a formal Incident Post-Mortem within 5 business days.
- Retrospective review of defensive controls to implement permanent preventive measures.

---

## 5. 72-Hour Notification Commitment (Shopify & Merchants)

In the event of a confirmed personal data breach involving protected customer data:

1. **Merchant Notification:**
   - **Deadline:** Within **72 hours** of becoming aware of the confirmed breach.
   - **Content:** Nature of the incident, categories and estimated volume of affected customer records, recommended actions for the merchant, and contact point for questions.
2. **Shopify Notification:**
   - **Channel:** Dedicated notification to Shopify Partner Security via the Partner Dashboard and `security@shopify.com`.
   - **Details:** Scope of impact, affected shop IDs, technical summary, and containment measures taken.
3. **Data Protection Authorities:**
   - Where required by applicable law (e.g., GDPR, CCPA, DPDP Act), notification will be submitted in coordination with Merchant data controllers.
