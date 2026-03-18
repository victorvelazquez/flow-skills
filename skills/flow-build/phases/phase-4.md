## PHASE 4: Security & Authentication (15-20 min)

> **Order for this phase:** 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6 → 4.7 → 4.8 → 4.9 → 4.10 → 4.11

> **📌 Scope-based behavior:**
>
> - **MVP:** Ask 4.1-4.5 only (auth basics + CORS), skip 4.6-4.11 (advanced security), mark as "TBD"
> - **Production-Ready:** Ask 4.1-4.8 and 4.11, skip or simplify 4.9 (compliance) and 4.10 (audit logging)
> - **Enterprise:** Ask all questions 4.1-4.11 with emphasis on compliance and audit trails

### Objective

Define security policies, authentication, authorization, and compliance requirements.

---

## 🔍 Pre-Flight Check (Smart Skip Logic)

> 📎 **Reference:** See [prompts/shared/smart-skip-preflight.md](../../.ai-flow/prompts/shared/smart-skip-preflight.md) for the complete smart skip logic.

**Execute Pre-Flight Check for Phase 4:**

- **Target File**: `specs/security.md`
- **Phase Name**: "SECURITY & AUTHENTICATION"
- **Key Items**: Auth strategy, encryption, security patterns, compliance
- **Typical Gaps**: Compliance requirements, audit logging, security policies

**Proceed with appropriate scenario based on audit data from `.ai-flow/cache/audit-data.json`**

---

## Phase 4 Questions (Full Mode)

**4.1 Authentication Method**

```
How will users authenticate?

A) ⭐ JWT (JSON Web Tokens) - Recommended for APIs

- Stateless, scalable
- Access + Refresh token pattern

B) 🔥 Session-based - Traditional web apps

- Server-side sessions
- Cookie-based

C) ⚡ OAuth 2.0 / OpenID Connect - External providers

- "Sign in with Google/GitHub/etc."
- Delegated authentication

D) 🏆 Multi-factor (MFA) - Enterprise security

- OTP, SMS, authenticator app
- Required or optional?

E) API Keys - Service-to-service

- Simple, stateless
- Limited use cases

Your choice: __
Why?
```

**4.2 JWT Configuration (if using JWT)**

```
JWT token configuration:

Access Token:
- Lifetime: __ (recommended: 15min - 1hour)
- Algorithm: __ (recommended: RS256 or HS256)

Refresh Token:
- Lifetime: __ (recommended: 7-30 days)
- Storage: [httpOnly cookie / localStorage / database]
- Rotation strategy: [rotate on use / rotate periodically / no rotation]

Token claims to include:
- userId ✅
- email ✅
- roles ✅
- Custom: __
```

**4.3 Authorization Model**

```
How will you manage permissions?

A) ⭐ Role-Based Access Control (RBAC)
- Users have roles (admin, user, moderator, etc.)
- Roles have permissions
- Simple and common

B) 🏆 Attribute-Based Access Control (ABAC)
- Fine-grained based on attributes
- Complex rules
- Enterprise use cases

C) 🔒 Resource-based (Ownership)
- Users can only access their own resources
- Simple projects

D) 🌐 Multi-tenant with role hierarchy
- Organization → Teams → Users
- Complex enterprise systems

Your choice: __

List the roles you'll need:
-
-

List key permissions:
-
-
```

**4.4 Password Policy**

```
Password requirements:

A) ⭐ Recommended Policy
- Minimum 8 characters
- At least 1 uppercase, 1 lowercase, 1 number
- Special characters encouraged but not required
- No maximum length limit
- Hash with bcrypt (12 rounds) or argon2

B) 🏆 Strong Policy (Enterprise)
- Minimum 12 characters
- Uppercase, lowercase, number, special char required
- Password expiration every 90 days
- Password history (can't reuse last 5)

C) 🔓 Simple Policy
- Minimum 6 characters
- No complexity requirements
- Good for low-risk apps

Your choice: __

Hashing algorithm:
A) ⭐ bcrypt (rounds: 10-12) - Recommended
B) argon2 - More secure, newer
C) scrypt - Good alternative
```

**4.5 Rate Limiting**

```
Will you implement rate limiting?

A) ⭐ Yes - Recommended for all public APIs

Rate limits by endpoint type:
- Authentication endpoints: ** requests per ** (e.g., 5 per 15 min)
- Public read endpoints: ** requests per ** (e.g., 100 per minute)
- Write endpoints: ** requests per ** (e.g., 30 per minute)
- Admin endpoints: ** requests per ** (e.g., 1000 per minute)

Rate limiting strategy:
A) IP-based
B) User/API key-based
C) Both

Tool:
A) express-rate-limit / @nestjs/throttler
B) Redis-based rate limiting
C) API Gateway (AWS, Kong, etc.)
```

**4.6 CORS Policy**

```
CORS (Cross-Origin Resource Sharing) configuration:

Allowed origins:
A) ⭐ Specific domains - https://myapp.com, https://admin.myapp.com
B) 🔧 Development only - localhost:3000, localhost:5173
C) ⚠️ Wildcard (*) - Allow all (NOT recommended for production)

Your allowed origins:
-

Allowed methods: [GET, POST, PUT, PATCH, DELETE, OPTIONS]
Credentials: [true/false] - Allow cookies/auth headers
Max age: __ seconds (cache preflight)
```

**4.7 Data Encryption**

```
Encryption requirements:

In Transit (HTTPS/TLS):
A) ✅ Yes, always - TLS 1.2+ required ⭐
B) Development only HTTP, production HTTPS
C) Optional

At Rest (Database/Files):
A) ⭐ Yes, encrypt sensitive fields - PII, payment info, secrets
B) 🏆 Yes, full database encryption - Enterprise requirement
C) No encryption - Low-risk data only

Fields to encrypt:
-
-

Encryption method:
A) AES-256-GCM (symmetric)
B) Database-level encryption
C) Application-level encryption
```

**4.8 Security Headers**

```
Which security headers will you implement?

A) ✅ All recommended headers (use helmet.js or equivalent)
- Content-Security-Policy
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security (HSTS)
- X-XSS-Protection

B) Basic headers only
C) None (not recommended)
```

**4.9 Compliance Requirements**

```
Does your project need to comply with specific regulations or standards?

Some projects must follow legal requirements or industry standards. If you're not sure, you can select "None" and add compliance requirements later.

Select all that apply:

A) 🌍 GDPR (General Data Protection Regulation)
   What it is: EU data privacy regulation
   When it applies: If you process personal data of users in the European Union
   What it means: Users have rights to access, delete, and export their data
   Key requirements:
   - Right to access data (users can request their data)
   - Right to deletion (users can request data removal)
   - Data portability (users can export their data)
   - Consent management (explicit consent for data processing)
   Example: "We serve users in Germany, so we need GDPR compliance"

B) 🏥 HIPAA (Health Insurance Portability and Accountability Act)
   What it is: US healthcare data protection law
   When it applies: If you handle Protected Health Information (PHI) - medical records, health data
   What it means: Strict rules for protecting patient health information
   Key requirements:
   - PHI protection (encryption, access controls)
   - Audit logs (track who accessed what health data)
   - Encryption requirements (data must be encrypted)
   Example: "We're building a telemedicine platform that stores patient records"

C) 💳 PCI-DSS (Payment Card Industry Data Security Standard)
   What it is: Security standard for credit card processing
   When it applies: If you process, store, or transmit credit card information
   What it means: Strict security rules to protect cardholder data
   Key requirements:
   - Never store CVV (security code on card)
   - Tokenize card numbers (use tokens instead of real numbers)
   - Secure transmission (encrypted connections required)
   Example: "We process credit card payments directly (not using Stripe/PayPal)"

D) 🏢 SOC 2 (System and Organization Controls 2)
   What it is: Security and compliance standard for SaaS companies
   When it applies: If you're selling B2B SaaS and need to prove security to enterprise customers
   What it means: Documented security controls and processes
   Key requirements:
   - Security controls (documented security measures)
   - Audit trails (logs of all security-relevant actions)
   - Access controls (who can access what)
   Example: "We're selling to Fortune 500 companies who require SOC 2 certification"

E) 🇺🇸 CCPA (California Consumer Privacy Act)
   What it is: California state privacy law
   When it applies: If you have California users and meet certain thresholds (revenue/users)
   What it means: California users have privacy rights
   Key requirements:
   - Right to know what data is collected
   - Right to delete data
   - Right to opt-out of data sales
   Example: "We have users in California and meet the revenue threshold"

F) None - No specific compliance requirements
   Select this if you're not sure or don't need compliance yet

Selected: __

For each selected, list specific requirements that apply to your project:

Example for GDPR:
- Must allow users to download all their data in JSON format
- Must completely delete user data when requested (not just soft delete)
- Need cookie consent banner for EU users
- Privacy policy must be accessible and up-to-date

Example for SOC 2:
- Need 90-day audit log retention
- Quarterly access control reviews required
- Security incident response procedures documented
- Continuous monitoring of administrative actions
```

**4.10 Logging & Audit Trail**

```
What security events will you log?

A) ✅ Authentication events
- Login success/failure
- Password changes
- Account creation

B) ✅ Authorization events
- Permission denied
- Role changes

C) ✅ Data access
- Sensitive data views
- Exports/downloads

D) ✅ Data modifications
- Create/Update/Delete operations
- Who, what, when

Log retention: __ days (recommended: 90+ days)
Log storage: [Database / File system / External service (CloudWatch, Datadog)]
```

**4.11 API Keys Management**

```
Will you use API keys for service-to-service authentication?

A) ⭐ Yes - API keys for programmatic access
B) No - JWT/Sessions only

If yes:
- Key format: [Prefix + random string, UUID, etc.]
- Key length: __ characters
- Storage: [Hashed in database, Plain text (not recommended)]
- Hashing algorithm: [bcrypt, SHA-256, etc.]

Key rotation:
A) ⭐ Manual rotation - Rotate on demand
B) Automatic rotation - Rotate every __ days
C) No rotation

Key revocation:
- Process: __
- Reasons: [Compromised, Expired, User request, Security incident]

Rate limiting by API key tier:
- Free tier: __ requests per __
- Paid tier: __ requests per __
- Enterprise: __ requests per __
```

**4.12 Dependency Security**

```
How will you manage dependency security?

A) ⭐ Automated scanning - Regular security audits (npm audit, Snyk, Dependabot)
B) Manual scanning - Check vulnerabilities manually
C) No scanning - Not recommended

Scanning frequency:
A) ⭐ On every install/update
B) Daily automated scans
C) Weekly scans
D) Monthly scans

Vulnerability response:
- Critical: Fix within __ hours
- High: Fix within __ days
- Medium: Fix within __ days
- Low: Fix in next release

Tools:
- Dependency scanner: __
- Security alerts: [GitHub Dependabot, Snyk, npm audit, etc.]
```

**4.13 Input Validation & Sanitization**

```
Input validation strategy:

A) ⭐ Strict validation with DTOs/Schemas (Recommended)
   - Use validation library: [class-validator/Zod/Pydantic/Joi from Phase 3.6]
   - Reject unknown fields: [yes/no]
   - Type coercion: [strict/lenient]

B) Manual validation in services
   - Custom validation logic
   - More flexible but error-prone

Sanitization rules:

A) ✅ Sanitize all string inputs (XSS prevention)
   - Strip HTML tags: [yes/no]
   - Escape special characters: [yes/no]
   - Library: [DOMPurify/validator.js/bleach]

B) ✅ SQL Injection prevention
   - Use parameterized queries (ORM handles this automatically)
   - Never concatenate user input in queries

Request size limits:

- Max JSON body size: __ MB (recommended: 1-10 MB)
- Max file upload size: __ MB (recommended: 10-50 MB)
- Max URL length: __ characters (recommended: 2048)

File upload validation (if applicable from Phase 3.9):

- Allowed file types: [jpg, png, pdf, etc.]
- MIME type validation: [yes/no - verify actual content matches extension]
- File content validation: [yes/no - check file headers]
- Virus scanning: [yes/no - ClamAV, VirusTotal API]
- Filename sanitization: [yes/no - remove special characters, limit length]

Content-Type enforcement:

A) ⭐ Strict - Reject if Content-Type doesn't match body (recommended)
B) Lenient - Accept common mismatches (application/json vs text/plain)
C) No validation

Validation approach:

A) ⭐ Whitelist - Only allow known good inputs (recommended)
   - Define allowed values explicitly
   - Reject everything else

B) Blacklist - Block known bad inputs (not recommended)
   - Easy to bypass
   - Incomplete protection

Special character handling:

- Allow special characters in: [names, descriptions, etc.]
- Escape/encode for: [HTML output, SQL queries, shell commands]
- Reject in: [IDs, slugs, filenames]
```

### Phase 4 Output

```
📋 PHASE 4 SUMMARY:

Authentication: [method]
JWT Config: [if applicable - access/refresh token lifetimes, algorithm, storage]
Authorization: [RBAC/ABAC/etc.]
Roles: [list]
Permissions: [key permissions defined]
Password Policy: [requirements and hashing algorithm]
Rate Limiting: [yes/no + limits by endpoint type]
CORS: [origins, methods, credentials, max-age]
Encryption: [in-transit + at-rest + fields to encrypt]
Security Headers: [list]
Compliance: [requirements with specific controls]
Audit Logging: [events logged + retention + storage]
API Keys Management: [yes/no + format + rotation + revocation + rate limiting]
Dependency Security: [scanning tool + frequency + vulnerability response]
Input Validation: [strategy + sanitization rules + size limits + file upload validation + whitelist/blacklist approach]

Is this correct? (Yes/No)
```
---
### 📄 Generate Phase 4 Documents

**Before starting generation:**

```
📖 Loading context from previous phases...
✅ Re-reading project-brief.md
✅ Re-reading docs/data-model.md
✅ Re-reading docs/architecture.md
✅ Re-reading ai-instructions.md
```

**Generate documents automatically:**

**1. `specs/security.md`**

- Use template: `.ai-flow/templates/specs/security.template.md`
- Fill with all security policies, authentication, authorization
- Write to: `specs/security.md`

**2. Update `ai-instructions.md`**

- Add security rules to NEVER/ALWAYS sections
- Add authentication/authorization patterns

```
✅ Generated: specs/security.md
✅ Updated: ai-instructions.md (security rules added)

Documents have been created with all Phase 4 information.

📝 Would you like to make any corrections before continuing?

→ If yes: Edit the files and type "ready" when done. I'll re-read them.
→ If no: Type "continue" to proceed to Phase 5.
```

**If user edits files:**
Re-read files to refresh context before continuing.
---
**Proceed to Phase 5 only after documents are validated.**

> ⚠️ **CRITICAL:** DO NOT generate README.md in this phase. README.md is ONLY generated in Phase 8 (step 8.5) after framework initialization.
---
---

---

## 📝 Generated Documents

After Phase 4, generate/update:
- `specs/security.md` - Security policies and authentication details

---

**Next Phase:** Phase 5 - Development Standards (15-20 min)

Next: read phase-5.md from this phases/ directory

---

**Last Updated:** 2025-12-20
**Version:** 2.1.8

---

## PHASE 5: Development Standards (15-20 min)




