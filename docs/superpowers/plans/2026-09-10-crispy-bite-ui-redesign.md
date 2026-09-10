# Crispy Bite UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generated-looking Crispy Bite interface with a consistent, role-aware QSR operating UI without changing business behavior.

**Architecture:** Introduce a token-driven theme and a small `src/ui` presentation layer, then migrate screens in role-based slices while preserving Context/API ownership and existing test IDs. Responsive behavior stays inside presentation components and uses React Native dimensions so the same code runs on Expo Web and native.

**Tech Stack:** React Native 0.81, Expo SDK 54, TypeScript, Lucide React Native, Expo Google Fonts, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-crispy-bite-ui-redesign-design.md`

## Global Constraints

- Keep all REST, Socket.io, auth, order, table, menu, and report contracts unchanged.
- Preserve every existing `testID` used by the Playwright flows.
- Use Brick `#B42318`, Charcoal `#24211F`, Paper `#FFFFFF`, Canvas `#F4F3F0`, Operational green `#15803D`, and Service amber `#C66A15` as the core palette.
- Use Barlow Condensed for wordmarks, order/table identifiers, and operational headings; use Inter for body and controls.
- Login, POS, Admin, and QR default to light; KDS defaults to dark; persist manual choice per role.
- Remove emoji, gradients, decorative shadows, unnecessary all-caps labels, and arbitrary color/radius values.
- Mobile is below 768px, tablet is 768–1199px, and desktop starts at 1200px.
- Touch targets are at least 44px; primary POS/KDS actions are at least 52px.
- Preserve visible loading, empty, error, offline, and disabled states.

---

### Task 1: Fonts, tokens, and role-aware theme

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/App.tsx`
- Replace: `frontend/src/theme/colors.ts`
- Replace: `frontend/src/theme/typography.ts`
- Modify: `frontend/src/theme/spacing.ts`
- Modify: `frontend/src/theme/index.ts`
- Modify: `frontend/src/contexts/ThemeContext.tsx`
- Create: `frontend/src/theme/theme.test.ts`

**Interfaces:**
- Produces: `ThemeColors`, `ThemeMode`, `ThemeRole`, `lightTheme`, `darkTheme`, `statusColors`, `radii`, `elevation`, `useTheme()`, and `setRoleTheme(role)`.
- `useTheme()` continues to expose `theme`, `themeMode`, `isDark`, `toggleTheme`, and `setThemeMode`, adding `setRoleTheme(role: Role | 'GUEST')`.

- [ ] **Step 1: Add a failing theme behavior test**

```ts
import { describe, expect, it } from 'vitest';
import { defaultModeForRole, storageKeyForRole } from './colors';

describe('role-aware theme', () => {
  it('defaults KDS to dark and other roles to light', () => {
    expect(defaultModeForRole('KITCHEN')).toBe('dark');
    expect(defaultModeForRole('CASHIER')).toBe('light');
    expect(defaultModeForRole('ADMIN')).toBe('light');
    expect(defaultModeForRole('GUEST')).toBe('light');
  });

  it('stores a separate preference for each role', () => {
    expect(storageKeyForRole('KITCHEN')).toBe('crispy_bite_theme_kitchen');
    expect(storageKeyForRole('CASHIER')).toBe('crispy_bite_theme_cashier');
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm run test --workspace=frontend -- src/theme/theme.test.ts`

Expected: FAIL because `defaultModeForRole` and `storageKeyForRole` do not exist.

- [ ] **Step 3: Implement the token system and role resolver**

Add exact role helpers:

```ts
export type ThemeRole = Role | 'GUEST';
export const defaultModeForRole = (role: ThemeRole): ThemeMode =>
  role === 'KITCHEN' ? 'dark' : 'light';
export const storageKeyForRole = (role: ThemeRole) =>
  `crispy_bite_theme_${role.toLowerCase()}`;
```

Define semantic tokens for surfaces, text, borders, focus, interactive states, and order/table statuses. Export `radii = { xs: 4, sm: 6, md: 8, pill: 999 }` and restrict elevation to modal and floating-action levels.

- [ ] **Step 4: Bundle fonts and connect role theme to auth**

Install `@expo-google-fonts/barlow-condensed` and `@expo-google-fonts/inter`. Load `BarlowCondensed_600SemiBold`, `BarlowCondensed_700Bold`, `Inter_400Regular`, `Inter_500Medium`, `Inter_600SemiBold`, and `Inter_700Bold` in `App.tsx`. Call `setRoleTheme(user?.role ?? 'GUEST')` when auth role changes, without overwriting a stored manual preference.

- [ ] **Step 5: Verify theme behavior and types**

Run: `npm run test --workspace=frontend -- src/theme/theme.test.ts`

Expected: 2 tests PASS.

Run: `npm run typecheck:frontend`

Expected: exit 0.

- [ ] **Step 6: Commit the theme foundation**

```bash
git add frontend/package.json package-lock.json frontend/App.tsx frontend/src/theme frontend/src/contexts/ThemeContext.tsx
git commit -m "feat(ui): tao theme qsr theo vai tro"
```

### Task 2: Shared UI primitives and interaction states

**Files:**
- Create: `frontend/src/ui/AppIcon.tsx`
- Create: `frontend/src/ui/BrandMark.tsx`
- Create: `frontend/src/ui/Button.tsx`
- Create: `frontend/src/ui/Field.tsx`
- Create: `frontend/src/ui/Surface.tsx`
- Create: `frontend/src/ui/StatusBadge.tsx`
- Create: `frontend/src/ui/ScreenHeader.tsx`
- Create: `frontend/src/ui/Feedback.tsx`
- Create: `frontend/src/ui/index.ts`
- Create: `frontend/src/ui/ui.test.ts`

**Interfaces:**
- `ButtonProps`: `variant: 'primary' | 'secondary' | 'quiet' | 'danger'`, `label`, `icon?`, `loading?`, `disabled?`, `onPress`, `testID?`.
- `StatusBadgeProps`: `tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'`, `label`, `icon?`.
- `SurfaceProps`: `level: 'base' | 'raised' | 'sunken'`, `children`, `style?`.
- `ScreenHeaderProps`: `title`, `description?`, `actions?`, `leading?`.

- [ ] **Step 1: Write failing pure-style tests**

```ts
import { describe, expect, it } from 'vitest';
import { buttonMetrics, statusTone } from './tokens';

describe('UI primitives', () => {
  it('keeps primary operational buttons at least 52px high', () => {
    expect(buttonMetrics.primary.minHeight).toBeGreaterThanOrEqual(52);
  });

  it('uses distinct status semantics', () => {
    expect(statusTone.success.foreground).not.toBe(statusTone.warning.foreground);
    expect(statusTone.danger.label).toBe('critical');
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm run test --workspace=frontend -- src/ui/ui.test.ts`

Expected: FAIL because `src/ui/tokens.ts` does not exist.

- [ ] **Step 3: Implement primitives with accessible states**

Create `src/ui/tokens.ts` and the components above. Each pressable sets `accessibilityRole="button"`, visible focus styles on web, at least 44px hit height, and reduced opacity only for disabled state. `InlineAlert` exposes error text without emoji; `EmptyState` always accepts an actionable description.

- [ ] **Step 4: Verify primitive tests and frontend types**

Run: `npm run test --workspace=frontend -- src/ui/ui.test.ts`

Expected: 2 tests PASS.

Run: `npm run typecheck:frontend`

Expected: exit 0.

- [ ] **Step 5: Commit shared primitives**

```bash
git add frontend/src/ui
git commit -m "feat(ui): bo sung primitive giao dien van hanh"
```

### Task 3: Login and role shell

**Files:**
- Modify: `frontend/src/features/auth/LoginScreen.tsx`
- Modify: `frontend/src/navigation/RootNavigator.tsx`
- Modify: `frontend/src/navigation/RoleTabs.tsx`
- Modify: `frontend/src/contexts/AuthContext.tsx`
- Modify: `e2e/cashier-kitchen-flow.spec.ts`
- Modify: `e2e/admin-operations-flow.spec.ts`

**Interfaces:**
- Consumes: `BrandMark`, `Button`, `Field`, `InlineAlert`, `AppIcon`, `ScreenHeader`, and role-aware `useTheme()`.
- Produces: role shell with the existing `tab-*`, `btn-logout`, `demo-btn-*`, `input-*`, and `btn-login` test IDs.

- [ ] **Step 1: Update E2E assertions for sentence-case UI while preserving behavior**

Add assertions for `getByText('Đăng nhập')`, visible role navigation, and successful quick login. Keep every existing action selector unchanged.

- [ ] **Step 2: Run the login slice and confirm the new copy assertion fails**

Run: `npx playwright test e2e/cashier-kitchen-flow.spec.ts --grep "cashier"`

Expected: FAIL on the new sentence-case login/shell assertion.

- [ ] **Step 3: Implement the split login composition**

Desktop uses a 40/60 brand/form split with a compact shift-status motif; mobile stacks the wordmark, form, and demo account list. Replace emoji and colored demo buttons with Lucide `UserRound`, `ChefHat`, and `ShieldCheck` icons in one neutral role list. Fix quick login credentials to use the same seeded values as `.env`-driven auth behavior or surface the actual auth error without leaving stale validation text.

- [ ] **Step 4: Implement responsive RoleShell**

Desktop/tablet uses a compact left rail or top command bar according to available width; mobile uses the bottom navigation. Replace emoji labels with Lucide icons, sentence case labels, role badge, user menu, connection-safe header spacing, and per-role theme toggle.

- [ ] **Step 5: Run focused E2E and typecheck**

Run: `npm run typecheck:frontend`

Expected: exit 0.

Run: `npx playwright test e2e/cashier-kitchen-flow.spec.ts --grep "cashier"`

Expected: PASS.

- [ ] **Step 6: Commit login and shell**

```bash
git add frontend/src/features/auth/LoginScreen.tsx frontend/src/navigation frontend/src/contexts/AuthContext.tsx e2e
git commit -m "feat(ui): lam moi dang nhap va dieu huong vai tro"
```

### Task 4: POS ordering surfaces

**Files:**
- Modify: `frontend/src/features/pos/POSScreen.tsx`
- Modify: `frontend/src/features/pos/MenuCategoryPills.tsx`
- Modify: `frontend/src/features/pos/MenuItemCard.tsx`
- Modify: `frontend/src/features/pos/ModifierModal.tsx`
- Modify: `frontend/src/features/pos/ReceiptModal.tsx`
- Modify: `e2e/cashier-kitchen-flow.spec.ts`

**Interfaces:**
- Consumes: Task 2 primitives and current `RestaurantContext` values/callbacks.
- Preserves: `btn-modal-add-to-cart`, `btn-open-checkout`, `btn-dinein`, `btn-takeaway`, `pos-table-option-*`, `btn-confirm-order`, `btn-view-receipt`, `btn-done-order`, `receipt-modal`, and `btn-close-receipt`.

- [ ] **Step 1: Add E2E assertions for catalog, cart summary, and receipt hierarchy**

Assert that a cashier sees the menu catalog and “Giỏ hàng”; after adding an item, the fixed cart summary shows quantity and total; after checkout, receipt remains visible with VAT.

- [ ] **Step 2: Run the cashier flow and record the expected copy/layout assertion failure**

Run: `npx playwright test e2e/cashier-kitchen-flow.spec.ts --grep "Cashier"`

Expected: FAIL on the new catalog/cart assertion before the new composition exists.

- [ ] **Step 3: Build desktop/tablet split layout and mobile cart summary**

Use `useWindowDimensions()` to render catalog plus fixed 360px cart panel from 900px upward. Below 900px, keep the catalog full width and expose the existing cart as a bottom summary that opens checkout. Keep current cart calculations and callbacks untouched.

- [ ] **Step 4: Normalize category, item, modifier, and receipt presentation**

Categories become scrollable filters; item cards use price and availability hierarchy with radius 8; modifier groups use radio/check controls without nested tinted cards; receipt uses a printable paper hierarchy without emoji or decorative dashed excess.

- [ ] **Step 5: Verify POS flow and types**

Run: `npm run typecheck:frontend`

Expected: exit 0.

Run: `npx playwright test e2e/cashier-kitchen-flow.spec.ts --grep "Cashier"`

Expected: PASS through receipt close.

- [ ] **Step 6: Commit POS redesign**

```bash
git add frontend/src/features/pos e2e/cashier-kitchen-flow.spec.ts
git commit -m "feat(ui): toi uu giao dien pos va hoa don"
```

### Task 5: KDS operational board

**Files:**
- Modify: `frontend/src/features/kds/KDSScreen.tsx`
- Modify: `e2e/cashier-kitchen-flow.spec.ts`

**Interfaces:**
- Consumes: role dark theme, `StatusBadge`, `Button`, `ScreenHeader`, and existing socket/order actions.
- Preserves: `kds-screen-title` and `kds-action-btn-*` test IDs.

- [ ] **Step 1: Add E2E assertions for KDS board semantics**

Assert visible headings “Chờ chế biến”, “Đang chế biến”, and “Sẵn sàng”, plus a visible connection label and the created order ticket.

- [ ] **Step 2: Run the KDS flow and confirm lane assertions fail**

Run: `npx playwright test e2e/cashier-kitchen-flow.spec.ts --grep "Kitchen"`

Expected: FAIL because the existing KDS does not expose the new lane labels.

- [ ] **Step 3: Implement role-dark board and responsive lanes**

Desktop renders three columns; tablet scrolls lanes horizontally; mobile renders one filtered list with a status segmented control. Ticket age uses the existing elapsed time calculation, a left status edge, and accessible text labels. Ticket body uses order code, table/order type, items, modifiers, notes, and one state transition action.

- [ ] **Step 4: Verify socket flow, action flow, and types**

Run: `npm run typecheck:frontend`

Expected: exit 0.

Run: `npx playwright test e2e/cashier-kitchen-flow.spec.ts`

Expected: PASS for cashier creation and KDS transition.

- [ ] **Step 5: Commit KDS redesign**

```bash
git add frontend/src/features/kds/KDSScreen.tsx e2e/cashier-kitchen-flow.spec.ts
git commit -m "feat(ui): thiet ke bang kds theo trang thai"
```

### Task 6: Table operations and customer QR ordering

**Files:**
- Modify: `frontend/src/features/tables/TableScreen.tsx`
- Modify: `frontend/src/features/customer/TableOrderScreen.tsx`
- Modify: `e2e/admin-operations-flow.spec.ts`

**Interfaces:**
- Consumes: shared tokens/primitives and current table/order context callbacks.
- Preserves: `table-card-*`, `table-detail-modal`, `table-detail-title`, `btn-confirm-pay`, `btn-open-void-modal`, `btn-confirm-void`, and `btn-confirm-clean-table`.

- [ ] **Step 1: Add responsive table and QR assertions**

Assert that Admin sees filter labels and table status text; table detail still opens. Add a narrow viewport assertion that customer ordering exposes “Bàn”, “Thực đơn”, and the cart summary without internal KDS/POS wording.

- [ ] **Step 2: Run admin table flow and confirm new assertions fail**

Run: `npx playwright test e2e/admin-operations-flow.spec.ts --grep "table"`

Expected: FAIL on the new filter or sentence-case detail assertion.

- [ ] **Step 3: Redesign the table grid and operation modal**

Use a filter toolbar, stable responsive columns, dominant table number, semantic status badge, active-order amount, and elapsed time. Convert detail modal into labeled operational sections with a fixed action footer and explicit danger confirmation for void.

- [ ] **Step 4: Redesign customer QR as mobile-first**

Show table identity and order progress in a compact header, replace tracker cards with a linear timeline, provide thumb-sized menu filters, and keep cart summary above safe-area inset. Replace internal vocabulary with customer-facing copy.

- [ ] **Step 5: Verify table flow and frontend types**

Run: `npm run typecheck:frontend`

Expected: exit 0.

Run: `npx playwright test e2e/admin-operations-flow.spec.ts`

Expected: PASS including table detail.

- [ ] **Step 6: Commit table and QR redesign**

```bash
git add frontend/src/features/tables frontend/src/features/customer e2e/admin-operations-flow.spec.ts
git commit -m "feat(ui): lam moi van hanh ban va dat mon qr"
```

### Task 7: Admin menu and reporting workspace

**Files:**
- Modify: `frontend/src/features/admin/AdminScreen.tsx`
- Modify: `frontend/src/features/admin/MenuManagementScreen.tsx`
- Modify: `frontend/src/features/reports/DashboardScreen.tsx`
- Modify: `e2e/admin-operations-flow.spec.ts`

**Interfaces:**
- Consumes: `RoleShell`, shared primitives, existing admin/menu/report services and callbacks.
- Preserves: `admin-subtab-menu`, `admin-subtab-reports`, `admin-btn-add-item`, `menu-item-switch-*`, and `kpi-*` test IDs.

- [ ] **Step 1: Update admin E2E copy and hierarchy assertions**

Replace the uppercase title expectation with “Trung tâm quản trị”; assert menu search/actions and KPI labels remain visible after switching subtabs.

- [ ] **Step 2: Run admin E2E and confirm the sentence-case assertion fails**

Run: `npx playwright test e2e/admin-operations-flow.spec.ts --grep "Admin"`

Expected: FAIL on “Trung tâm quản trị”.

- [ ] **Step 3: Build desktop admin workspace**

Use a persistent sub-navigation, compact screen header, filters, and list/table presentation from tablet upward. Mobile keeps stacked menu rows with inline availability and edit actions. Keep menu form behavior but group identity, pricing, availability, and modifiers into clear sections.

- [ ] **Step 4: Recompose reports around decision hierarchy**

Lead with net revenue, then supporting order count/AOV/SOS metrics of varied visual weight. Use one restrained chart palette and a ranked top-items list. Error and empty states use shared feedback primitives.

- [ ] **Step 5: Verify admin E2E and types**

Run: `npm run typecheck:frontend`

Expected: exit 0.

Run: `npx playwright test e2e/admin-operations-flow.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit admin redesign**

```bash
git add frontend/src/features/admin frontend/src/features/reports e2e/admin-operations-flow.spec.ts
git commit -m "feat(ui): toi uu khong gian quan tri va bao cao"
```

### Task 8: Design consistency audit and full verification

**Files:**
- Audit and modify: `frontend/src/features/auth/LoginScreen.tsx`
- Audit and modify: `frontend/src/features/pos/*.tsx`
- Audit and modify: `frontend/src/features/kds/KDSScreen.tsx`
- Audit and modify: `frontend/src/features/tables/TableScreen.tsx`
- Audit and modify: `frontend/src/features/customer/TableOrderScreen.tsx`
- Audit and modify: `frontend/src/features/admin/*.tsx`
- Audit and modify: `frontend/src/features/reports/DashboardScreen.tsx`
- Audit and modify: `frontend/src/navigation/*.tsx`
- Audit and modify: `frontend/src/theme/*`
- Audit and modify: `frontend/src/ui/*`
- Modify: `README.md`

**Interfaces:**
- Consumes all prior tasks.
- Produces a verified UI at mobile 390×844, tablet 1024×768, and desktop 1440×900.

- [ ] **Step 1: Run static consistency searches**

Run:

```bash
rg -n "🍔|👤|👨‍🍳|👑|🍳|🛒|🍽️|📱|☀️|🌙|➔" frontend/src
rg -n "#[0-9A-Fa-f]{6}|rgba\(" frontend/src/features frontend/src/navigation
rg -n "borderRadius: (1[0-9]|2[0-9]|[0-9]{3,})" frontend/src
```

Expected: no operational emoji; feature screens use semantic theme tokens; large radius exists only for `pill` semantics.

- [ ] **Step 2: Fix only violations found by the audit**

Move legitimate chart colors into a named report palette, replace remaining UI literals with semantic tokens, remove decorative shadow/radius, and retain data-derived colors only where the spec permits them.

- [ ] **Step 3: Run complete automated verification**

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run test`

Expected: all backend and frontend tests PASS.

Run: `npm run doctor`

Expected: all Expo checks PASS.

Run: `npm run test:e2e`

Expected: all configured desktop and mobile Playwright projects PASS.

- [ ] **Step 4: Perform visual QA at role-specific viewports**

Capture Login at 390×844 and 1440×900; POS at 1024×768 and 1440×900; KDS at 390×844, 1024×768, and 1440×900; QR at 390×844; Admin at 1440×900. Verify no clipping, overlap, hidden actions, low contrast, or accidental scroll traps. Check both role-default mode and one manual theme toggle.

- [ ] **Step 5: Document run and design conventions**

Add a README section naming the role defaults, supported layouts, font loading, and the `src/ui` rule: business logic stays in feature/context code while reusable visual behavior belongs in UI primitives.

- [ ] **Step 6: Final commit**

```bash
git add frontend README.md e2e package-lock.json
git commit -m "chore(ui): hoan tat kiem tra giao dien da thiet bi"
```
