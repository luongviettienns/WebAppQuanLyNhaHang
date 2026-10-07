const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.resolve(__dirname, '../docs/screenshots_bao_cao');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function checkHealth(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => {
      resolve(false);
    });
  });
}

async function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await checkHealth(url);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 600));
  }
  return false;
}

async function run() {
  console.log('🚀 Checking Backend Server (http://localhost:4000/health)...');
  let isRunning = await checkHealth('http://localhost:4000/health');
  let serverProcess = null;

  if (!isRunning) {
    console.log('⚡ Starting Backend Server (node backend/dist/src/server.js)...');
    serverProcess = spawn('node', ['backend/dist/src/server.js'], {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'development', PORT: '4000' }
    });

    serverProcess.stdout.on('data', (d) => process.stdout.write(`[SERVER] ${d}`));
    serverProcess.stderr.on('data', (d) => process.stderr.write(`[SERVER ERR] ${d}`));

    const ready = await waitForServer('http://localhost:4000/health');
    if (!ready) {
      console.error('❌ Server failed to start within timeout.');
      if (serverProcess) serverProcess.kill();
      process.exit(1);
    }
  }
  console.log('✅ Backend Server is READY!');

  const browser = await chromium.launch({ headless: true });
  const capturedList = [];

  async function takeShot(page, filename, label) {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    const filePath = path.join(OUTPUT_DIR, filename);
    await page.screenshot({ path: filePath, fullPage: false, animations: 'disabled' });
    console.log(`📸 [CAPTURED] ${filename} - ${label}`);
    capturedList.push({ file: filename, label, path: filePath });
  }

  try {
    // =========================================================================
    // 1. Hình 4.1: Màn hình đăng nhập và tab theo ba vai trò
    // =========================================================================
    console.log('\n--- 1. Capturing Hinh_4_1 ---');
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto('http://localhost:4000/');
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('[data-testid="btn-login"]', { timeout: 10000 });
      await takeShot(page, 'Hinh_4_1_DangNhap_BaVaiTro.png', 'Màn hình đăng nhập hệ thống');
      await context.close();
    }

    // =========================================================================
    // 2. Hình 4.2: POS với giỏ hàng và bước xác nhận tạo đơn
    // =========================================================================
    console.log('\n--- 2. Capturing Hinh_4_2 ---');
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto('http://localhost:4000/');
      await page.waitForSelector('[data-testid="btn-login"]', { timeout: 10000 });
      await page.fill('[data-testid="input-username"]', 'cashier');
      await page.fill('[data-testid="input-password"]', 'cashier123');
      await page.click('[data-testid="btn-login"]');
      await page.waitForSelector('[data-testid="tab-pos"]', { timeout: 10000 });

      // Click first menu item
      const itemCard = page.locator('[data-testid^="menu-item-"]').first();
      await itemCard.waitFor({ timeout: 10000 });
      await itemCard.click();

      // If modifier modal opens
      const addToCartBtn = page.locator('[data-testid="btn-modal-add-to-cart"]');
      if (await addToCartBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        const firstOpt = page.locator('[data-testid^="modifier-option-"]').first();
        if (await firstOpt.isVisible({ timeout: 1000 }).catch(() => false)) {
          await firstOpt.click();
        }
        await addToCartBtn.click();
      }

      // Add another item if cart only has 1
      const secondItem = page.locator('[data-testid^="menu-item-"]').nth(1);
      if (await secondItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        await secondItem.click();
        if (await addToCartBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          const firstOpt = page.locator('[data-testid^="modifier-option-"]').first();
          if (await firstOpt.isVisible({ timeout: 1000 }).catch(() => false)) {
            await firstOpt.click();
          }
          await addToCartBtn.click();
        }
      }

      await page.waitForTimeout(500);
      // Open Checkout Modal
      const checkoutBtn = page.locator('[data-testid="btn-open-checkout"]');
      if (await checkoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await checkoutBtn.click();
        await page.waitForTimeout(600);
      }

      await takeShot(page, 'Hinh_4_2_POS_GioHang_TaoDon.png', 'POS với giỏ hàng và bước xác nhận tạo đơn');
      await context.close();
    }

    // =========================================================================
    // 3. Hình 4.3: KDS có vé ở trạng thái chờ, chế biến, sẵn sàng
    // =========================================================================
    console.log('\n--- 3. Capturing Hinh_4_3 ---');
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto('http://localhost:4000/');
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForSelector('[data-testid="btn-login"]', { timeout: 10000 });
      await page.fill('[data-testid="input-username"]', 'kitchen');
      await page.fill('[data-testid="input-password"]', 'kitchen123');
      await page.click('[data-testid="btn-login"]');
      await page.waitForSelector('[data-testid="kds-screen-title"]', { timeout: 15000 });
      await page.waitForTimeout(1000);

      await takeShot(page, 'Hinh_4_3_KDS_DieuPhoiBep.png', 'KDS có vé ở trạng thái chờ, chế biến, sẵn sàng');
      await context.close();
    }

    // =========================================================================
    // 4. Hình 4.4: Trang QR của khách, giỏ hàng và theo dõi đơn (Mobile 390x844)
    // =========================================================================
    console.log('\n--- 4. Capturing Hinh_4_4 ---');
    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
      });
      const page = await context.newPage();
      await page.goto('http://localhost:4000/?table=4&token=QR-TABLE-04');
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForLoadState('networkidle');

      const addMoreBtn = page.getByRole('button', { name: 'Gọi thêm món' });
      if (await addMoreBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await addMoreBtn.click();
      }

      await page.waitForSelector('[data-testid^="menu-item-"]', { timeout: 10000 });
      // Select an item
      const itemToClick = page.getByText('Gà Rán Giòn Cay (3 Miếng)', { exact: true });
      if (await itemToClick.isVisible({ timeout: 3000 }).catch(() => false)) {
        await itemToClick.click();
      } else {
        await page.locator('[data-testid^="menu-item-"]').first().click();
      }

      // Add to cart in modal
      const modalAddBtn = page.getByRole('button', { name: 'Thêm vào giỏ' });
      if (await modalAddBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await modalAddBtn.click();
      }

      await page.waitForTimeout(600);
      await takeShot(page, 'Hinh_4_4_KhachHang_QR_TheoDoiDon.png', 'Trang QR của khách, giỏ hàng và theo dõi đơn');
      await context.close();
    }

    // Helper for Admin tabs
    async function captureAdminTab(tabTestId, filename, label, additionalAction) {
      console.log(`\n--- Capturing ${filename} (${label}) ---`);
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await page.goto('http://localhost:4000/');
      await page.waitForSelector('[data-testid="btn-login"]', { timeout: 10000 });
      await page.fill('[data-testid="input-username"]', 'admin');
      await page.fill('[data-testid="input-password"]', 'admin123');
      await page.click('[data-testid="btn-login"]');
      await page.waitForSelector('[data-testid="tab-reports"]', { timeout: 15000 });

      if (tabTestId !== 'tab-reports') {
        const tab = page.locator(`[data-testid="${tabTestId}"]`);
        await tab.waitFor({ timeout: 10000 });
        await tab.click();
      }

      await page.waitForTimeout(1000);
      if (additionalAction) {
        await additionalAction(page);
      }
      await takeShot(page, filename, label);
      await context.close();
    }

    // =========================================================================
    // 5. Hình 4.5: Sơ đồ bàn và danh sách đặt bàn
    // =========================================================================
    await captureAdminTab('tab-tables', 'Hinh_4_5_SoDoBan_DatBan.png', 'Sơ đồ bàn và danh sách đặt bàn');

    // =========================================================================
    // 6. Hình 4.6: Quản lý thực đơn, bảng giá và voucher
    // =========================================================================
    await captureAdminTab('tab-menu', 'Hinh_4_6_ThucDon_BangGia_Voucher.png', 'Quản lý thực đơn, bảng giá và voucher');

    // =========================================================================
    // 7. Hình 4.7: Màn hình kho, định lượng và phiếu nhập
    // =========================================================================
    await captureAdminTab('tab-inventory', 'Hinh_4_7_Kho_DinhLuong_PhieuNhap.png', 'Màn hình kho, định lượng và phiếu nhập');

    // =========================================================================
    // 8. Hình 4.8: Màn hình khách hàng và đối tác
    // =========================================================================
    await captureAdminTab('tab-customers', 'Hinh_4_8_KhachHang_DoiTacGiaoHang.png', 'Màn hình khách hàng và đối tác');

    // =========================================================================
    // 9. Hình 4.9: Workspace nhân sự, lịch ca, chấm công và lương
    // =========================================================================
    await captureAdminTab('tab-employees', 'Hinh_4_9_NhanSu_LichCa_ChamCong_Luong.png', 'Workspace nhân sự, lịch ca, chấm công và lương');

    // =========================================================================
    // 10. Hình 4.10: Sổ quỹ, phiếu thu, phiếu chi
    // =========================================================================
    await captureAdminTab('tab-cashbook', 'Hinh_4_10_SoQuy_PhieuThuChi.png', 'Sổ quỹ, phiếu thu, phiếu chi');

    // =========================================================================
    // 11. Hình 4.11: Dashboard báo cáo ngày và nhật ký kiểm toán
    // =========================================================================
    await captureAdminTab('tab-reports', 'Hinh_4_11_Dashboard_BaoCao_NhatKy.png', 'Dashboard báo cáo ngày và nhật ký kiểm toán');

    // =========================================================================
    // BONUS / PHỤ TRỢ: Chụp thêm các màn hình bổ trợ hữu ích
    // =========================================================================
    await captureAdminTab('tab-audit', 'Hinh_4_11b_NhatKyKiemToan_AuditLog.png', 'Nhật ký kiểm toán hệ thống');
    await captureAdminTab('tab-reservations', 'Hinh_4_5b_DanhSachDatBan.png', 'Danh sách đặt bàn của khách');
    await captureAdminTab('tab-pricing', 'Hinh_4_6b_Admin_BangGia.png', 'Bảng giá theo kênh bán');
    await captureAdminTab('tab-vouchers', 'Hinh_4_6c_Admin_Voucher_KhuyenMai.png', 'Danh sách voucher và khuyến mãi');

    console.log('\n🎉 TOÀN BỘ ẢNH ĐÃ ĐƯỢC CHỤP THÀNH CÔNG!');
    console.log(`📂 Thư mục lưu ảnh: ${OUTPUT_DIR}`);
    console.table(capturedList);

  } catch (err) {
    console.error('❌ Lỗi trong quá trình chụp ảnh:', err);
  } finally {
    await browser.close();
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

run();
