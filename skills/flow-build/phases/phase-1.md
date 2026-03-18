## PHASE 1: Discovery & Business (15-20 min)

> **Order for this phase:** 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 1.7 → 1.8 → 1.9 → 1.10

> **📌 Scope-based behavior:**
> - **MVP/Basic Scope:** Focus only on core requirements. Skip advanced business logic questions.
> - **Production-Ready Scope:** In-depth exploration of compliance, scalability, and long-term business goals.

### Objective
Define the project's core purpose, business rules, and high-level requirements to ensure the foundation is solid before technical design begins.

---

## 🔍 Pre-Flight Check (Smart Skip Logic)

> 📎 **Reference:** See [prompts/shared/smart-skip-preflight.md](../../.ai-flow/prompts/shared/smart-skip-preflight.md) for the complete smart skip logic.

**Execute Pre-Flight Check for Phase 1:**

- **Target File**: `project-brief.md`
- **Phase Name**: "BUSINESS CONTEXT"
- **Key Items**: Project name, description, users, objectives, system type, features, scope, constraints, metrics, business flows
- **Typical Gaps**: Business objectives, success metrics, constraints

**Proceed with appropriate scenario based on audit data from `.ai-flow/cache/audit-data.json`**

---

## Phase 1 Questions (Full Mode)

> **📌 Note:** If Phase 0 was executed, some questions may already be answered. Skip those and only ask what's missing.

**1.1 Project Name & Description (with Smart Refinement)**

> **🧠 Intelligent Refinement System**: This question detects vague descriptions and guides the developer to enrich them. It only asks what's missing and responds in the developer's language.

```
[If detected from Phase 0, show:]
✅ Project Name: [detected name]
✅ Description: [detected description]

Is this correct? (Y/N)
If no, please provide correct values.

[If NOT detected, ask:]
What is the project name?

Provide an initial description of your project.
(Don't worry about perfection - we'll refine it together if needed!)

Example: "A backend for managing gym memberships"
```

**🔍 AI Internal: Ambiguity Analysis**

After receiving the description, silently analyze for these criteria:

| Criterion | Check For | Score +1 if present |
|-----------|-----------|---------------------|
| **WHO** | Specific user type mentioned (not just "users") | "gym members", "restaurant owners" |
| **WHAT** | Specific action/function (not just "manage") | "track workouts", "process payments" |
| **WHY** | Purpose or value mentioned | "to replace spreadsheets", "to launch app" |
| **DOMAIN** | Industry/vertical indicated | "fitness", "fintech", "healthcare" |
| **DETAIL** | Description has 10+ meaningful words | Not counting articles |

**Scoring Rules:**
- Score 4-5: ✅ Accept immediately → Proceed to 1.2
- Score 0-3: ⚠️ Enter refinement loop → Ask ONLY missing criteria

---

**🔄 Conditional Refinement Loop (only if score < 4)**

> **CRITICAL**: Only ask about criteria that are MISSING. Do NOT repeat questions already answered. Respond in the SAME LANGUAGE the developer used.

```
[LANGUAGE: Match the developer's language]

🔍 I'd like to understand your project better.

Your description: "[original description]"

[ONLY show questions for MISSING criteria:]

[If WHO is missing:]
1️⃣ WHO will use this system?
   A) End consumers (B2C)
   B) Business users (B2B)
   C) Internal team
   D) Other systems (APIs)
   E) Other: __

[If WHAT is missing:]
2️⃣ WHAT is the core action users will perform?
   A) Buy/sell products or services
   B) Manage/organize information
   C) Communicate/collaborate
   D) Monitor/analyze data
   E) Create/publish content
   F) Other: __

[If WHY is missing:]
3️⃣ WHY is this project needed?
   A) Replace manual/legacy process
   B) Launch new product/business
   C) Improve existing system
   D) Enable new capability
   E) Other: __

[If DOMAIN is missing:]
4️⃣ What INDUSTRY/DOMAIN is this for?
   A) E-commerce/Retail
   B) Fitness/Health
   C) Finance/Payments
   D) Education
   E) Social/Community
   F) Business tools (CRM, ERP)
   G) Other: __

Your answers: __ (e.g., "A, B, A, E" or describe freely)
```

---

**✨ Generate Professional Description Options**

After gathering missing info, generate 3 polished versions:

```
[LANGUAGE: Match the developer's language]

✨ Based on your input, here are 3 professional descriptions:

A) Concise (for package.json):
   "[Generated 1-line description with WHO + WHAT]"

B) Descriptive (for README.md):
   "[Generated 2-3 line description with WHO + WHAT + WHY]"

C) Technical (for AGENT.md):
   "[Generated technical description with DOMAIN + WHAT]"

Which do you prefer? (1-3, or 4 to edit, 5 to start over)
```

---

**✅ Final Confirmation**

```
✅ Your final project description:

📋 Name: [project name]
📝 Description: "[final polished description]"

Proceed to next question? (Y to continue)
```

---

**1.2 Project Overview (Confirmation + Expansion)**

> **📌 Smart Skip**: If 1.1 already captured WHO/WHAT/WHY completely, this becomes a quick confirmation.

```
[If 1.1 refinement was complete (score >= 4), show:]

✅ Based on your description, I understand:
   • Users: [WHO from 1.1]
   • Core Action: [WHAT from 1.1]
   • Purpose: [WHY from 1.1]

Is this complete? (Y) Or would you like to add more context? (N)

[If user says Y → Skip to 1.3]
[If user says N → Ask:]
What additional context would you like to add?

---

[If 1.1 was NOT refined OR any WHO/WHAT/WHY still missing, ask:]

[ONLY ask for MISSING elements - check what was NOT captured in 1.1:]

[If WHO still unclear:]
Who are the primary users of this system?

[If WHAT still unclear:]
What is the core value proposition?

[If WHY still unclear:]
What makes this project necessary?

Example:
"A backend for a fitness tracking mobile app used by gym-goers (users). It allows users to log workouts, track progress over time, and share achievements with friends (value). This project is necessary to replace our legacy spreadsheet-based system and support our new iOS app launch."
```

**1.3 Target Users (Confirmation + Additional Types)**

> **📌 Smart Skip**: If 1.1 already identified user types, this confirms and expands.

```
[If WHO was captured in 1.1, show:]

✅ Based on your description, your target users are: [WHO from 1.1]

Would you like to add any additional user types? Select any that apply:

A) 🌐 External end-users (B2C) - Public-facing application
B) 🏢 Internal employees (B2B/Enterprise) - Company internal tool
C) 🔌 Other systems/services (API consumers) - Integration platform
D) 👥 Partners/Third-parties - Partner ecosystem
E) 📱 Mobile/Web apps - Backend for frontend
F) ✅ No additional users - [WHO from 1.1] is complete

---

[If WHO was NOT captured in 1.1, ask normally:]

Who will use this system? Select all that apply:

A) 🌐 External end-users (B2C) - Public-facing application
B) 🏢 Internal employees (B2B/Enterprise) - Company internal tool
C) 🔌 Other systems/services (API consumers) - Integration platform
D) 👥 Partners/Third-parties - Partner ecosystem
E) 📱 Mobile/Web apps - Backend for frontend

(Can select multiple)
```

**1.4 Business Objectives**

```
What are the top 3 measurable objectives for this project?

Examples:
- Process 10,000 transactions/day
- Reduce customer onboarding time by 50%
- Support 1M active users
- Achieve 99.9% uptime SLA

Your objectives:
1.
2.
3.
```

**1.5 System Type (Confirmation + Validation)**

> **📌 Smart Skip**: If 1.1 already identified the domain/industry, this confirms it.

```
[If DOMAIN was captured in 1.1, show:]

✅ Based on your description, this appears to be a: [DOMAIN from 1.1] system

Is this correct?

A) ✅ Yes, that's correct
B) 🔄 No, it's actually: [show options below]

---

[If DOMAIN was NOT captured in 1.1, OR user selected B above:]

What type of system are you building? (This helps suggest common features)

A) 🛒 E-commerce/Marketplace
B) 📱 SaaS/B2B Platform
C) 📊 CRM/ERP/Business Tool
D) 🎮 Social/Community Platform
E) 📋 Content Management
F) 🏦 FinTech/Payment
G) 🏥 Healthcare/Booking
H) 📚 Education/Learning
I) 🔧 DevTools/API Platform
J) Other: __

Your choice: __
```

**1.6 Core Features**

```
What are the main functionalities your system needs?

Think about what your users will be able to do with your system. You can list them freely, or select from common features suggested below based on your system type.

🛒 E-commerce common features:
1) User authentication (register/login)
2) Product catalog with search/filters
3) Shopping cart
4) Checkout and payment processing
5) Order management
6) Inventory tracking
7) Admin dashboard
📱 SaaS common features:
1) User authentication with SSO
2) Multi-tenant organization/workspace management
3) Role-based access control (RBAC)
4) Subscription and billing
5) Dashboard and analytics
6) API access
7) Admin panel
📊 CRM/Business Tool common features:
1) User/team management
2) Contact/customer database
3) Activity tracking and logging
4) Reporting and analytics
5) Integrations (email, calendar, etc.)
6) Search and filters
7) Export functionality
🎮 Social/Community common features:
1) User profiles
2) Posts/content creation
3) Feed/timeline
4) Comments and reactions
5) Follow/friend system
6) Notifications
7) Moderation tools
⭐ Your specific features (add any custom functionalities):
-
-
-

List all functionalities your system needs (select from above or add your own):
```

**1.7 Scope Definition**

```
Now let's prioritize: What will you build in this first version, and what will you leave for future versions?

This helps us focus the documentation on what you're building now, while noting what comes later.

📋 What will you build in this first version? (Select from the features listed above)

[Show features from question 1.6 and allow selection]
---
⏭️ What will you leave for future versions? (What you're NOT building now)

Common things to defer:
1) Mobile native apps (building web/API first)
2) Advanced analytics/ML features
3) Third-party integrations (v2)
4) White-label/multi-branding
5) Internationalization (i18n)
6) Advanced automation/workflows
7) Video/live streaming features
⭐ Other features to defer (add your own):
-
-
-

💡 Tip: It's okay to start simple! You can always expand later. This helps us create focused documentation for your current needs.
```

**1.8 Constraints**

```
What constraints does this project have? Select all that apply:

A) ⏰ Time - Must launch by specific date
B) 💰 Budget - Limited development resources
C) 📜 Compliance - Regulatory requirements (GDPR, HIPAA, SOC2, etc.)
D) 🔧 Technology - Must use specific tech stack
E) 📊 Scale - Must handle specific traffic/data volume
F) 🔐 Security - High security requirements
G) ⚡ Performance - Strict latency/throughput requirements

For each selected, provide details:

Example:
- Time: Must launch MVP by Q3 2024
- Compliance: Must be GDPR compliant as we serve EU users
```

**1.9 Success Metrics**

```
How will you measure success?

1. Expected Users:
   - Initial launch: __ users
   - Year 1 goal: __ users

2. Performance Targets:
   - Response time: < __ ms
   - Uptime: __ %

3. Business Goals:
   - [Goal 1]
   - [Goal 2]

⭐ Standard for MVP:
- Users: 1,000 initial / 10,000 Year 1
- Response time: < 500ms (API), < 100ms (DB)
- Uptime: 99.9% (Standard cloud SLA)

🏆 Standard for Production/Scale:
- Users: 100,000+ active
- Response time: < 200ms (API), < 50ms (DB)
- Uptime: 99.99% (High Availability)
```

**1.10 Main Business Flows**

> Note: If you omit any common flow or functionality, the AI will suggest and document typical processes relevant to your system type, based on best practices and common use cases.

`````
List the main business flows of the system (e.g., sales, inventory update, invoicing, user registration).

For each flow, you can add a brief description (optional).

If you wish, you can specify the main steps of any flow (numbered format). If you do not specify them, the AI will deduce typical steps based on the name and description.

Example:
- Sales: Process of purchasing products by the customer.
  1. Customer selects products
  2. Order is created
  3. Inventory is updated
  4. Invoice is generated
- Inventory: Automatic stock update after each sale.
- Invoicing: Invoice generation after purchase.

The AI will automatically generate flow diagrams (mermaid) for each documented process.
---
#### 🎨 MERMAID BUSINESS FLOW DIAGRAM FORMAT - CRITICAL

**Use this exact format** for business process flows:

````markdown
```mermaid
flowchart TD
    Start([User Visits Site]) --> Browse[Browse Product Catalog]
    Browse --> Search{Search or<br/>Browse Categories?}

    Search -->|Use Search| Filter[Apply Search Filters]
    Search -->|Browse| Category[Select Category]

    Filter --> Results[View Search Results]
    Category --> Results

    Results --> Select[Select Product]
    Select --> Details[View Product Details]
    Details --> Decision{Add to Cart?}

    Decision -->|Yes| AddCart[Add Item to Cart]
    Decision -->|No| Browse

    AddCart --> MoreShopping{Continue<br/>Shopping?}
    MoreShopping -->|Yes| Browse
    MoreShopping -->|No| Cart[View Shopping Cart]

    Cart --> ReviewCart{Cart OK?}
    ReviewCart -->|Modify| Browse
    ReviewCart -->|Proceed| Checkout[Start Checkout]

    Checkout --> Address[Enter/Confirm Address]
    Address --> Payment[Enter Payment Info]
    Payment --> Review[Review Order]
    Review --> ProcessPayment[Process Payment]

    ProcessPayment --> PaymentResult{Payment<br/>Success?}

    PaymentResult -->|Success| Confirm[Order Confirmation]
    PaymentResult -->|Declined| Retry{Retry<br/>Payment?}

    Retry -->|Yes| Payment
    Retry -->|No| SaveCart[Save Cart for Later]
    SaveCart --> End1([Exit: Saved])

    Confirm --> Email[Send Confirmation Email]
    Email --> Inventory[Update Inventory]
    Inventory --> Invoice[Generate Invoice]
    Invoice --> End2([Order Complete])

    style Start fill:#e1f5ff
    style End1 fill:#ffe1e1
    style End2 fill:#e1ffe1
    style ProcessPayment fill:#fff4e1
    style Confirm fill:#d4edda
`````

````

**Flowchart Syntax:**
- `flowchart TD` = Top-Down flow (recommended)
- `flowchart LR` = Left-Right flow
- `flowchart BT` = Bottom-Top
- `flowchart RL` = Right-Left

**Node Shapes:**
- `[Rectangle]` = Process step/action
- `{Diamond}` = Decision point (Yes/No, multiple options)
- `([Rounded Rectangle])` = Start/End terminal
- `[(Cylinder)]` = Database operation
- `[[Subroutine]]` = Sub-process
- `[/Parallelogram/]` = Input/Output
- `((Circle))` = Connection point

**Arrow Types:**
- `-->` = Solid arrow (standard flow)
- `-.->` = Dotted arrow (optional/conditional)
- `==>` = Thick arrow (emphasis)
- `-->|Label|` = Labeled arrow (decision branch)

**Best Practices for Business Flows:**
1. **Always start with a terminal**: `([Start])`
2. **Always end with a terminal**: `([End])`
3. **Label decision branches**: Use `-->|Yes|` or `-->|No|`
4. **Use line breaks in labels**: `{Continue<br/>Shopping?}` for readability
5. **Apply consistent styling**: Same colors for similar node types
6. **Keep it readable**: Avoid spaghetti flows, group related steps
7. **Show all paths**: Every decision should have all branches defined
8. **Include error paths**: Payment failures, validation errors, etc.

**Multiple Flow Example (Advanced):**

```mermaid
flowchart TD
    subgraph "Customer Journey"
        C1[Browse] --> C2[Select]
        C2 --> C3[Purchase]
    end

    subgraph "Backend Processing"
        B1[Validate Order] --> B2[Process Payment]
        B2 --> B3[Update Inventory]
        B3 --> B4[Send Notifications]
    end

    C3 --> B1
    B4 --> C4[Confirmation]
```

**Color Coding Guide:**
- Blue (`#e1f5ff`): Start/Entry points
- Green (`#e1ffe1`): Success/Completion
- Red (`#ffe1e1`): Failure/Error states
- Yellow (`#fff4e1`): Critical operations (Payment, Auth)
- Purple (`#f0e1ff`): External integrations

**Common Business Flows to Document:**
- User Registration/Login
- Purchase/Checkout Process
- Content Creation/Publishing
- Approval/Review Workflows
- Data Import/Export
- Notification/Alert Flows
- Customer Support Ticket Lifecycle

**Validation:** Test at https://mermaid.live/ before saving
---
```

### Phase 1 Output

After gathering all information, confirm:

```
📋 PHASE 1 SUMMARY:

Project: [name]
Description: [1 sentence]
Users: [list]
Objectives: [3 objectives]
System Type: [E-commerce/SaaS/etc.]
Core Features: [list of main functionalities]
First Version Features: [what will be built now]
Future Features: [what will be deferred]
Constraints: [list with details]
Success Metrics: [KPIs]
Business Flows: [list of main flows]

Is this correct? (Yes/No)
If corrections needed, specify which section.
```
---
### 📄 Generate Phase 1 Documents

**Generate `project-brief.md` automatically:**

- Use template: `.ai-flow/templates/project-brief.template.md`
- Fill with all Phase 1 information
- Write to project root: `project-brief.md`

```
✅ Generated: project-brief.md

The document has been created with all the information from Phase 1.

📝 Would you like to make any corrections before continuing?

→ If yes: Edit project-brief.md and type "ready" when done. I'll re-read it.
→ If no: Type "continue" to proceed to Phase 2.
```

**If user edits the file:**
Execute `read_file('project-brief.md')` to refresh context before continuing.
---

## 📝 Generated Documents

After Phase 1, generate/update:
- `project-brief.md` - Core project discovery and requirements

---

**Next Phase:** Phase 2 - Data Architecture (15-20 min)

Next: read phase-2.md from this phases/ directory

---

**Last Updated:** 2025-12-20
**Version:** 2.1.8

---

## PHASE 2: Data Architecture (15-20 min)

````



