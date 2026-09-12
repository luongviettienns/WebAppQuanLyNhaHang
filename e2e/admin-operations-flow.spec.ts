import { test, expect } from '@playwright/test';

test.describe('E2E Flow: Admin Operations & Reporting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should login as admin, inspect reporting, and open table operations', async ({ page }) => {
    // 1. Login using Admin Demo Button
    await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
    const adminBtn = page.getByTestId('demo-btn-admin');
    await expect(adminBtn).toBeVisible({ timeout: 10000 });
    await adminBtn.click();

    // 2. Navigate to Admin Screen
    const adminTab = page.getByTestId('tab-admin');
    await expect(adminTab).toBeVisible({ timeout: 10000 });
    await expect(adminTab.getByText('Quản trị')).toBeVisible();
    await adminTab.click();

    // Verify the sentence-case admin hierarchy.
    await expect(page.getByRole('heading', { name: 'Trung tâm quản trị' })).toBeVisible({ timeout: 8000 });

    // 3. Menu Management: Verify filters, actions, items, and availability controls.
    const menuSubtab = page.getByTestId('admin-subtab-menu');
    await expect(menuSubtab).toBeVisible();
    await expect(page.getByPlaceholder('Tìm món theo tên hoặc mô tả')).toBeVisible();
    await expect(page.getByTestId('admin-btn-add-item')).toContainText('Thêm món');

    const firstSwitch = page.locator('[data-testid^="menu-item-switch-"]').first();
    await expect(firstSwitch).toBeVisible({ timeout: 8000 });

    // 4. Navigate to Reports Subtab
    const reportsSubtab = page.getByTestId('admin-subtab-reports');
    await expect(reportsSubtab).toBeVisible();
    await reportsSubtab.click();

    // 5. Verify the decision hierarchy remains readable after switching subtabs.
    const kpiRevenue = page.getByTestId('kpi-revenue');
    const kpiOrders = page.getByTestId('kpi-orders');
    const kpiAov = page.getByTestId('kpi-aov');
    const kpiSos = page.getByTestId('kpi-sos');

    await expect(kpiRevenue).toBeVisible({ timeout: 8000 });
    await expect(kpiOrders).toBeVisible();
    await expect(kpiAov).toBeVisible();
    await expect(kpiSos).toBeVisible();
    await expect(kpiRevenue.getByText('Doanh thu thuần')).toBeVisible();
    await expect(kpiOrders.getByText('Đơn hàng')).toBeVisible();
    await expect(kpiAov.getByText('Giá trị đơn trung bình')).toBeVisible();
    await expect(kpiSos.getByText('Tốc độ phục vụ')).toBeVisible();

    // Verify Top 5 Sellers section
    await expect(page.getByRole('heading', { name: 'Món bán chạy' })).toBeVisible();

    // 6. Navigate to Table Map to verify Admin Void functionality
    const tablesTab = page.getByTestId('tab-tables');
    await expect(tablesTab).toBeVisible();
    await tablesTab.click();

    // Table operations expose status filters and readable status text.
    await expect(page.getByRole('button', { name: 'Tất cả (12)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bàn trống (12)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đang phục vụ (0)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chờ dọn (0)' })).toBeVisible();
    await expect(page.getByText('Sẵn sàng', { exact: true }).first()).toBeVisible();

    // Check Table 01
    const table1Card = page.getByTestId('table-card-1');
    await expect(table1Card).toBeVisible({ timeout: 8000 });
    await table1Card.click();

    // Check if table modal opened
    const tableModal = page.getByTestId('table-detail-modal');
    await expect(tableModal).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('table-detail-title')).toContainText('Bàn 01');
  });

  test('shows a mobile-first customer table ordering flow without internal system wording', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.getByTestId('demo-btn-admin').click();
    await expect(page.getByTestId('tab-qr_table')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('tab-qr_table').click();

    await expect(page.getByText('Bàn 04', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Thực đơn' })).toBeVisible();

    await page.getByText('Gà Rán Giòn Cay (3 Miếng)', { exact: true }).click();
    const cartSummary = page.getByTestId('customer-cart-summary');
    await expect(cartSummary).toBeVisible();
    await expect(cartSummary.getByText('Giỏ hàng')).toBeVisible();
    await expect(cartSummary).toContainText('1 món');
    await expect(cartSummary.getByRole('button', { name: 'Gửi món' })).toBeVisible();

    await expect(page.locator('body')).not.toContainText(/\b(?:KDS|POS)\b/);
  });
});
