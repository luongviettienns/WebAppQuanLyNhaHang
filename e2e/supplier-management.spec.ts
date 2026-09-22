import { test, expect } from '@playwright/test';

test('supplier list and create form work on desktop and mobile without database writes', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const supplier = {
    id: 1, code: 'NCC000001', name: 'Công ty Hoàng Gia', phone: '0909000001', email: 'contact@example.com',
    address: '12 Nguyễn Trãi', taxCode: '0312345678', note: null, isActive: true, createdAt: '', updatedAt: '',
    groupId: 1, group: { id: 1, name: 'Thực phẩm' }, totalPurchase: 18491500, outstandingAmount: 1200000
  };
  let created: typeof supplier | null = null;
  const pagination = { page: 1, pageSize: 50, totalRows: 1, totalPages: 1 };
  await page.addInitScript(() => {
    localStorage.setItem('crispy_token', 'supplier-ui-fixture');
    localStorage.setItem('crispy_user', JSON.stringify({ id: 1, username: 'admin', name: 'Quản trị', role: 'ADMIN' }));
  });
  // Keep the authenticated UI fixture isolated from the real socket server.
  await page.routeWebSocket('**/socket.io/**', socket => { socket.close(); });
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/**', async route => {
    const request = route.request(); const url = new URL(request.url());
    let data: unknown = {};
    if (url.pathname.endsWith('/suppliers') && request.method() === 'POST') {
      const input = request.postDataJSON();
      created = { ...supplier, ...input, id: 2, code: 'NCC000002', totalPurchase: 0, outstandingAmount: 0 };
      await route.fulfill({ status: 201, json: { data: created } }); return;
    }
    if (url.pathname.endsWith('/suppliers')) data = { items: created ? [supplier, created] : [supplier], pagination: { ...pagination, totalRows: created ? 2 : 1 }, summary: { totalPurchase: 18491500, outstandingAmount: 1200000 } };
    else if (url.pathname.endsWith('/supplier-groups')) data = [{ id: 1, name: 'Thực phẩm' }];
    else if (url.pathname === '/api/menu') data = { categories: [] };
    else if (url.pathname === '/api/tables') data = { tables: [] };
    else if (url.pathname === '/api/orders') data = [];
    else if (url.pathname.endsWith('/catalog')) data = { rows: [], pagination, summary: { totalRows: 0, trackedRows: 0, lowStockRows: 0, negativeStockRows: 0, totalStockValue: 0 } };
    else if (url.pathname.startsWith('/api/reports')) { await route.fulfill({ status: 503, json: { error: { message: 'Không dùng báo cáo trong kiểm thử giao diện' } } }); return; }
    else if (url.pathname.startsWith('/api/price-lists')) data = { items: [], priceList: { id: 1, name: 'Bảng giá chung' } };
    await route.fulfill({ json: { data } });
  });
  await page.goto('/');
  await page.getByTestId('tab-inventory').click();
  await page.getByText('Nhà cung cấp', { exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Nhà cung cấp', exact: true })).toBeVisible();
  await expect(page.getByText('Công ty Hoàng Gia', { exact: true })).toBeVisible();
  await expect(page.getByTestId('supplier-table')).toHaveCSS('overflow-x', 'auto');
  if (page.viewportSize()!.width >= 900) expect((await page.getByTestId('supplier-filters').boundingBox())!.width).toBe(250);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: testInfo.outputPath('supplier-list.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Nhà cung cấp', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Thêm nhà cung cấp', exact: true })).toBeVisible();
  await expect(page.getByTestId('supplier-save')).toBeInViewport();
  await page.getByTestId('supplier-name').fill('Nhà cung cấp giao diện');
  await page.getByTestId('supplier-email').fill('supplier@example.com');
  await page.screenshot({ path: testInfo.outputPath('supplier-form.png'), fullPage: true, animations: 'disabled' });
  await page.getByTestId('supplier-save').click();
  await expect(page.getByText('Đã lưu Nhà cung cấp giao diện', { exact: true })).toBeVisible();
  expect(created).toMatchObject({ name: 'Nhà cung cấp giao diện', email: 'supplier@example.com' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(errors).toEqual([]);
  if (testInfo.project.name === 'Desktop Chrome') {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect.poll(() => page.getByTestId('supplier-table').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath('supplier-list-wide.png'), fullPage: true, animations: 'disabled' });
  }
});
