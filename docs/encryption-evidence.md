# Technical Infrastructure & Encryption Evidence

**Document Version:** 1.0  
**Effective Date:** August 26, 2026  
**Product:** ProfitRx SaaS  

---

## 1. Architectural Overview of Encryption Controls

ProfitRx enforces a strict, defense-in-depth encryption architecture. We explicitly distinguish between **Infrastructure/Provider-Level Encryption** and **Application-Level Encryption**.

```
+-----------------------------------------------------------------------------------+
| 1. Application-Layer Token Encryption (ProfitRx)                                  |
|    - AES-256-GCM authenticated cipher with 96-bit random IV and 128-bit auth tag  |
|    - Applied to: Shopify offline OAuth tokens, ad platform API keys               |
|    - Key storage: TOKEN_ENCRYPTION_KEY environment variable (outside DB)           |
+-----------------------------------------------------------------------------------+
                                         |
                                         v (TLS 1.3 / HTTPS)
+-----------------------------------------------------------------------------------+
| 2. Network Encryption in Transit (Vercel & Neon)                                  |
|    - TLS 1.2 and TLS 1.3 enforced on all inbound web traffic (HTTPS only)          |
|    - HSTS header: max-age=31536000; includeSubDomains                             |
|    - Database connections: sslmode=require over TLS                               |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 3. Managed Database Encryption at Rest (Neon Cloud PostgreSQL)                    |
|    - Storage volume encryption: AES-256 on NVMe page servers                      |
|    - Cold storage encryption: AES-256 on AWS S3 buckets                           |
|    - Automated continuous WAL archiving & snapshots encrypted with AES-256        |
+-----------------------------------------------------------------------------------+
```

---

## 2. Infrastructure Layer: Managed Provider Evidence (Neon Inc.)

ProfitRx utilizes managed Serverless PostgreSQL provided by **Neon Inc.** (hosted in AWS `us-east-1`).

### A. Encryption at Rest (Database Storage)
- **Standard:** AES-256 block cipher.
- **Scope:** All data persisted on Neon NVMe local SSDs (Page Servers) and long-term object storage (Safekeepers to AWS S3).
- **Key Management:** Neon manages cryptographic keys through AWS Key Management Service (KMS) with automated annual key rotation.
- **Provider Reference:** [Neon Security Overview](https://neon.tech/docs/security/security-overview)
- **Compliance Certifications:**
  - SOC 2 Type II certified (audited by independent third party).
  - ISO/IEC 27001:2022 (Information Security Management).
  - ISO/IEC 27701:2019 (Privacy Information Management).
  - Public Verification: [Neon Trust Center](https://neon.tech/trust-center).

### B. Backup Encryption (Shopify Level 2 PCD Requirement)
- **Continuous Backups:** Neon employs log-structured storage where all Write-Ahead Logs (WAL) are continuously streamed to encrypted object storage (AWS S3) with server-side encryption (`SSE-S3` / AES-256).
- **Point-in-Time Recovery (PITR):** Snapshots and restore points inherit the underlying AES-256 S3 bucket encryption.
- **Custom Backups:** ProfitRx does not export unencrypted database dumps to unmanaged external servers. All restore points are managed within Neon's compliant boundary.

### C. Encryption in Transit
- **Enforcement:** PostgreSQL connection strings require `sslmode=require`. Plaintext TCP connections on port 5432 or HTTP port 443 are rejected by the database proxy.
- **Protocols:** TLS 1.2 and TLS 1.3 only; legacy TLS 1.0 and 1.1 are permanently disabled.
- **Certificate Verification:** Connection terminates using valid CA certificates issued by trusted authorities.

---

## 3. Infrastructure Layer: Hosting & Edge Evidence (Vercel Inc.)

ProfitRx is deployed on **Vercel's Edge/Serverless Infrastructure**.

- **Transport Security:** All HTTP traffic is redirected (308 Permanent Redirect) to HTTPS.
- **HSTS Enforcement:** Enforced in `vercel.json`:
  ```json
  {
    "key": "Strict-Transport-Security",
    "value": "max-age=31536000; includeSubDomains"
  }
  ```
- **Platform Certifications:** Vercel maintains active SOC 2 Type II and ISO 27001 certifications.

---

## 4. Application-Layer Token Encryption

For highly sensitive credentials that permit administrative API access, ProfitRx implements an additional layer of cryptographic isolation within the application runtime before writing to the database:

- **Implementation File:** `app/services/token-encryption.server.ts`
- **Algorithm:** `AES-256-GCM` (Galois/Counter Mode — Authenticated Encryption with Associated Data).
- **IV / Nonce:** Cryptographically secure 12-byte random IV generated per encryption event via `crypto.randomBytes(12)`.
- **Authentication Tag:** 16-byte authentication tag generated and validated on decryption to prevent ciphertext tampering.
- **Ciphertext Serialization:** Prefixed as `enc:v1:<base64-iv>:<base64-tag>:<base64-ciphertext>`.
- **Scope:**
  - `Session.accessToken` (Shopify Offline Merchant Access Tokens).
  - `Session.refreshToken`.
  - `AdSpend.accessToken` (Meta / Google OAuth tokens).
  - `AdSpend.refreshToken`.
- **Key Isolation:** The master key is held exclusively in the `TOKEN_ENCRYPTION_KEY` environment variable. Even in the theoretical scenario of an unauthorized database dump, tokens cannot be decrypted without access to the runtime environment variable.
