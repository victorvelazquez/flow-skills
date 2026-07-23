---
name: ui-design-system
description: Reference for canonical UI patterns, component states, accessibility rules, responsive breakpoints, and design-token conventions. Used by /flow-ui and /flow-refactor for UI alignment checks. Not directly invokable.
disable-model-invocation: true
user-invocable: false
license: Apache-2.0
metadata:
  author: Victor Velazquez
  version: "1.0"
---

# ui-design-system

> Shared reference consumed by `/flow-ui` and `/flow-refactor`.
> Do not invoke this skill directly — it is a support package.

---

## Canonical Component Patterns

### Container-Presentational Split
- **Container**: handles data fetching (TanStack Query, SWR), state management, event handlers
- **Presentational**: receives data via props, renders UI, emits events via callbacks
- File naming: `UserList.container.tsx` + `UserList.tsx` OR single file with explicit hook extraction

### Compound Components
Use compound patterns when a component has multiple sub-parts that must work together:

```tsx
// ✅ Canonical
<Tabs>
  <Tabs.List>
    <Tabs.Tab>Item 1</Tabs.Tab>
  </Tabs.List>
  <Tabs.Panel>Content 1</Tabs.Panel>
</Tabs>

// ❌ Avoid
<Tabs items={[...]} activeIndex={0} onChange={...} />
```

### Prop Composition over Configuration
- Prefer `children` and slot props over configuration objects
- Avoid boolean flags that control completely different render paths (`isModal`, `isEditing`)
- Max 5 props before considering composition or splitting

### State Management
- **Server state**: TanStack Query (React), TanStack Query for Svelte, etc.
- **Client state**: Zustand, Jotai, or context for small scopes
- No prop drilling beyond 2 levels

---

## Component State Requirements

Every data-display component MUST handle these states:

| State | Pattern | Example |
|-------|---------|---------|
| **Loading** | Skeleton or spinner | `<Skeleton variant="card" />` |
| **Empty** | Illustration + message + CTA | "No clients yet. Create your first client." |
| **Error** | Message + retry button | "Failed to load. [Retry]" |
| **Success** | Normal data display | — |
| **Edge: Long text** | Truncation with tooltip | CSS `text-overflow: ellipsis` |
| **Edge: Zero values** | Show "0" or "—" explicitly, never blank | — |
| **Edge: Null/undefined** | Fallback to "—" or omit row, never show "null" | — |

---

## Accessibility Checklist (WCAG 2.1 AA baseline)

### Keyboard Navigation
- All interactive elements reachable via `Tab`
- `Enter` / `Space` activates buttons and links
- `Escape` closes modals, drawers, popovers
- Focus trapped inside modals while open
- Focus restored to trigger element on modal close

### Semantic HTML
- One `<h1>` per page
- Heading levels never skipped (`h1` → `h2` → `h3`)
- `<nav>`, `<main>`, `<aside>`, `<footer>` landmarks used
- Lists use `<ul>` / `<ol>` / `<li>`
- Tables use `<table>` / `<thead>` / `<tbody>` / `<th>` with `scope`

### Labels & Descriptions
- Every `<input>` has an associated `<label>` (or `aria-label` / `aria-labelledby`)
- Icon-only buttons have `aria-label`
- Images have meaningful `alt` text (empty `alt=""` if decorative)
- Error messages linked via `aria-describedby`

### Color & Contrast
- Text: minimum 4.5:1 contrast ratio (3:1 for large text)
- Non-text elements (icons, borders): minimum 3:1
- Color never the sole indicator of state (add icons or text)

### Dynamic Content
- Status updates use `aria-live="polite"` or `role="status"`
- Alerts use `role="alert"`
- Loading states announced to screen readers

---

## Responsive Breakpoints

Default breakpoint scale (Tailwind-compatible):

| Name | Min width | Typical device |
|------|-----------|----------------|
| `sm` | 640px | Large phone |
| `md` | 768px | Tablet |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Wide desktop |
| `2xl` | 1536px | Ultra-wide |

### Responsive Rules
- Mobile-first: write base styles for mobile, override with `md:` / `lg:` breakpoints
- No horizontal scroll on any viewport ≥ 320px
- Touch targets ≥ 44×44px on touch devices
- Tables: horizontal scroll wrapper on mobile, not collapsed layout
- Modals: full-screen on mobile (`< 640px`), centered dialog on larger

---

## Design Tokens (no hardcoded values)

### Colors
- Always reference theme tokens: `primary.main`, `text.secondary`, `error.light`
- Never hardcode hex: `#0761E9`, `rgb(7, 97, 233)`
- Exception: one-off brand colors documented in `docs/ui-guide.md`

### Spacing
- Use theme spacing scale: `1` = 8px, `2` = 16px, `3` = 24px, etc.
- Never arbitrary `px` values in layout: `mt: '17px'`
- Gap between elements uses `gap` prop, not individual margins

### Typography
- Use theme typography variants: `h1`–`h6`, `body1`, `body2`, `caption`
- Never set `fontSize` + `fontWeight` independently outside theme
- Line-height from theme, not arbitrary

### Icons
- Project uses ONE icon library; check `package.json`
- Common choices: `lucide-react`, `@mui/icons-material`, `@heroicons/react`
- Don't mix icon libraries without documented reason

---

## Component Library Conventions

### When using MUI (Material UI)
- Prefer `sx` prop over `style` prop
- Use `Box` / `Stack` / `Grid` for layout, not raw `<div>` with flex CSS
- `TextField` → use `slotProps` not inline `InputProps`
- Dialogs → `Dialog` + `DialogTitle` + `DialogContent` + `DialogActions`
- Data tables → `DataGrid` or `Table` + `TableContainer`

### When using Tailwind CSS
- Use utility classes, never `style={{}}`
- Extract repeated utility combinations into `@apply` in CSS or a component
- Responsive prefixes: `sm:` `md:` `lg:` `xl:`
- Dark mode: `dark:` prefix

### When using shadcn/ui
- Components in `src/components/ui/`
- Use `cn()` utility for conditional classes
- Follow the composition patterns documented in each component

---

## UI Checklist File Format

`docs/ui-checklist.md` uses this structure:

```markdown
# UI Checklist

> Generated by /flow-ui on YYYY-MM-DD
> Mode: baseline
> Files reviewed: N

## Components

| Component | Path | States | a11y | Responsive | Guide Aligned |
|-----------|------|--------|------|------------|---------------|

## Issues Found

### 🔴 Blocking

### 🟡 Important

### 🔵 Minor

## Guide Update Candidates

## Summary
```

---

## Integration with Other Commands

| Command | Relationship |
|---------|-------------|
| `/flow-refactor` | Catches design-system drift (hardcoded tokens, inline styles, wrong icons). `/flow-ui` does NOT re-check these. |
| `/flow-audit` | Runs lint/typecheck/test. `/flow-ui` does NOT re-run tools. |
| `/flow-ui` | Final visual/UX gate — states, a11y, responsive, guide alignment |
| `/flow-build` | Generates initial `docs/ui-guide.md` during project setup |
