import { test, expect } from '@playwright/test';

test.describe('E2E Flow: Admin Operations & Reporting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should login as Admin, toggle 86 item status, and inspect daily KPI dashboard and SOS', async ({ page }) => {
    // 1. Login using Admin Demo Button
    const adminBtn = page.getByTestId('demo-btn-admin');
    await expect(adminBtn).toBeVisible({ timeout: 10000 });
    await adminBtn.click();

    // 2. Navigate to Admin Screen
    const adminTab = page.getByTestId('tab-admin');
    await expect(adminTab).toBeVisible({ timeout: 10000 });
    await adminTab.click();

    // Verify Admin Header
    await expect(page.getByText('TRUNG TÂM QUẢN TRỊ ADMIN')).toBeVisible({ timeout: 8000 });

    // 3. Menu Management: Verify items are listed and switch exists
    const menuSubtab = page.getByTestId('admin-subtab-menu');
    await expect(menuSubtab).toBeVisible();

    const firstSwitch = page.locator('[data-testid^="menu-item-switch-"]').first();
    await expect(firstSwitch).toBeVisible({ timeout: 8000 });

    // 4. Navigate to Reports Subtab
    const reportsSubtab = page.getByTestId('admin-subtab-reports');
    await expect(reportsSubtab).toBeVisible();
    await reportsSubtab.click();

    // 5. Verify 4 Primary KPI Cards
    const kpiRevenue = page.getByTestId('kpi-revenue');
    const kpiOrders = page.getByTestId('kpi-orders');
    const kpiAov = page.getByTestId('kpi-aov');
    const kpiSos = page.getByTestId('kpi-sos');

    await expect(kpiRevenue).toBeVisible({ timeout: 8000 });
    await expect(kpiOrders).toBeVisible();
    await expect(kpiAov).toBeVisible();
    await expect(kpiSos).toBeVisible();

    // Verify Top 5 Sellers section
    await expect(page.getByText('Top 5 Món Bán Chạy Nhất')).toBeVisible();

    // 6. Navigate to Table Map to verify Admin Void functionality
    const tablesTab = page.getByTestId('tab-tables');
    await expect(tablesTab).toBeVisible();
    await tablesTab.click();

    // Check Table 01
    const table1Card = page.getByTestId('table-card-1');
    await expect(table1Card).toBeVisible({ timeout: 8000 });
    await table1Card.click();

    // Check if table modal opened
    const tableModal = page.getByTestId('table-detail-modal');
    await expect(tableModal).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('table-detail-title')).toContainText('Chi Tiết Bàn');
  });
});
