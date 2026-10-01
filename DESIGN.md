# KelselPDF Design System (2026 Edition)

## Design Philosophy
KelselPDF's administrator interface is designed to be a premium, responsive, EdTech SaaS platform. It strictly avoids the "old Bootstrap admin template" aesthetic. The design prioritizes **high information density without clutter, clear typography, and strong visual hierarchy**.

## 1. Color Palette

### Base (Dark Mode / Glassmorphism)
- **Background** (`--bg-color`): `#0f172a` (Slate 900) - Deep, rich background.
- **Card Background** (`--card-bg`): `#1e293b` (Slate 800) - Slightly elevated surfaces.
- **Borders** (`--border-color`): `#334155` (Slate 700) - Subtle separation.

### Typography
- **Primary Text** (`--text-color`): `#f8fafc` (Slate 50) - High contrast for readability.
- **Secondary Text** (`--ntxt-color`): `#94a3b8` (Slate 400) - For metadata, descriptions, and table headers.

### Accents & Status (Semantic)
- **Brand Primary** (`--primary-color`): `#3b82f6` (Blue 500) - Main actions, active states.
- **Success**: `#10b981` (Emerald 500) - Approval, correct answers, published status.
- **Warning**: `#f59e0b` (Amber 500) - Drafts, pending reviews, locks.
- **Danger**: `#ef4444` (Red 500) - Deletions, rejections, missing data.

## 2. Typography
- **Font Family**: Inter, system-ui, -apple-system, sans-serif.
- **Headings**: Heavy font weights (800) with tight letter spacing (`-0.5px`).
- **Data Tables**: Secondary text for headers (`0.85rem`, uppercase, letter-spaced).
- **Numbers**: Monospaced variants where appropriate (e.g. countdown timers, scores).

## 3. UI Components

### Cards (`.kpi-card`, `.panel`)
- Radius: `12px` (Modern, soft edges)
- Border: `1px solid var(--border-color)`
- Shadow: `0 4px 15px rgba(0,0,0,0.03)` (Subtle elevation)

### Badges (`.badge`)
- Styling: Rounded pills (`20px` radius).
- Background: 10% opacity of the semantic color.
- Text: 100% opacity of the semantic color.
- Example: `<span class="badge badge-warning">DRAFT</span>`

### Sidebars & Layout
- Sidebar Width: `260px` fixed.
- Main Content Padding: `2rem 3rem`.
- Active Menu Items: Full primary color background with a subtle glow (`box-shadow`).

## 4. Workflows & States
- **Empty States**: Must be communicative. Do not leave blank screens. Use large icons and clear calls to action.
- **Loading States**: Prefer skeletons over generic spinners for content blocks.
- **Form Design**: Clean inputs with `var(--bg-color)` backgrounds inside `var(--card-bg)` panels. Labels must be bold and descriptive.

## 5. Accessibility
- All text meets WCAG AA contrast standards (Slate 400 on Slate 800/900).
- Forms must use descriptive `<label>` tags.
- Destructive actions (Reject, Delete) must use Danger colors and require confirmation.
