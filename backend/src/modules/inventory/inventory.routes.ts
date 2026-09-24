import { Router } from 'express';
import { InventoryController } from './inventory.controller';
import { SupplierController } from './supplier.controller';
import { PurchaseReceiptController } from './purchase-receipt.controller';
import { InventoryCheckController } from './inventory-check.controller';
import { InventoryWasteController } from './inventory-waste.controller';
import { PurchaseReturnController } from './purchase-return.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

export const inventoryRouter = Router();

// File mau Excel la tai nguyen mau khong chua du lieu nhay cam
inventoryRouter.get('/excel/template', InventoryController.downloadTemplate);

// Cac route danh cho Bep va Quan ly (KITCHEN & ADMIN)
inventoryRouter.post('/kitchen-waste', authenticate, authorize('KITCHEN', 'ADMIN'), InventoryController.recordKitchenWaste);
inventoryRouter.get('/low-stock-alerts', authenticate, authorize('KITCHEN', 'ADMIN'), InventoryController.getLowStockAlerts);

// Tat ca cac route con lai quan ly kho va dinh luong yeu cau quyen ADMIN
inventoryRouter.use(authenticate, authorize('ADMIN'));

// Danh sach kho hop nhat (read-only)
inventoryRouter.get('/catalog', InventoryController.getCatalog);
inventoryRouter.get('/catalog/export', InventoryController.exportCatalog);

// Nha cung cap toi thieu cho phieu nhap hang
inventoryRouter.get('/supplier-groups', SupplierController.groups);
inventoryRouter.post('/supplier-groups', SupplierController.saveGroup);
inventoryRouter.patch('/supplier-groups/:id', SupplierController.saveGroup);
inventoryRouter.get('/suppliers', SupplierController.list);
inventoryRouter.post('/suppliers', SupplierController.create);
inventoryRouter.get('/suppliers/export', SupplierController.export);
inventoryRouter.get('/suppliers/import/template', SupplierController.template);
inventoryRouter.post('/suppliers/import/preview', SupplierController.preview);
inventoryRouter.post('/suppliers/import/commit', SupplierController.commit);
inventoryRouter.get('/suppliers/:id/receipts', SupplierController.receipts);
inventoryRouter.get('/suppliers/:id', SupplierController.detail);
inventoryRouter.patch('/suppliers/:id', SupplierController.update);

// Phieu nhap hang theo vong doi draft -> posted/cancelled
inventoryRouter.get('/purchase-receipts', PurchaseReceiptController.list);
inventoryRouter.post('/purchase-receipts', PurchaseReceiptController.create);
inventoryRouter.get('/purchase-receipts/export', PurchaseReceiptController.export);
inventoryRouter.post('/purchase-receipts/import/preview', PurchaseReceiptController.previewImport);
inventoryRouter.get('/purchase-receipts/:id', PurchaseReceiptController.detail);
inventoryRouter.patch('/purchase-receipts/:id', PurchaseReceiptController.update);
inventoryRouter.post('/purchase-receipts/:id/post', PurchaseReceiptController.post);
inventoryRouter.post('/purchase-receipts/:id/cancel', PurchaseReceiptController.cancel);

// Phieu kiem kho theo vong doi draft -> balanced/cancelled
inventoryRouter.get('/purchase-returns', PurchaseReturnController.list);
inventoryRouter.post('/purchase-returns', PurchaseReturnController.create);
inventoryRouter.get('/purchase-returns/export', PurchaseReturnController.export);
inventoryRouter.post('/purchase-returns/import/preview', PurchaseReturnController.previewImport);
inventoryRouter.get('/purchase-returns/:id', PurchaseReturnController.detail);
inventoryRouter.patch('/purchase-returns/:id', PurchaseReturnController.update);
inventoryRouter.post('/purchase-returns/:id/complete', PurchaseReturnController.complete);
inventoryRouter.post('/purchase-returns/:id/cancel', PurchaseReturnController.cancel);

// Phieu kiem kho theo vong doi draft -> balanced/cancelled
inventoryRouter.get('/checks', InventoryCheckController.list);
inventoryRouter.post('/checks', InventoryCheckController.create);
inventoryRouter.get('/checks/export', InventoryCheckController.export);
inventoryRouter.post('/checks/import/preview', InventoryCheckController.previewImport);
inventoryRouter.get('/checks/:id', InventoryCheckController.detail);
inventoryRouter.patch('/checks/:id', InventoryCheckController.update);
inventoryRouter.post('/checks/:id/balance', InventoryCheckController.balance);
inventoryRouter.post('/checks/:id/cancel', InventoryCheckController.cancel);

// Phieu xuat huy theo vong doi draft -> completed/cancelled
inventoryRouter.get('/wastes', InventoryWasteController.list);
inventoryRouter.post('/wastes', InventoryWasteController.create);
inventoryRouter.get('/wastes/export', InventoryWasteController.export);
inventoryRouter.post('/wastes/import/preview', InventoryWasteController.previewImport);
inventoryRouter.get('/wastes/:id', InventoryWasteController.detail);
inventoryRouter.patch('/wastes/:id', InventoryWasteController.update);
inventoryRouter.post('/wastes/:id/complete', InventoryWasteController.complete);
inventoryRouter.post('/wastes/:id/cancel', InventoryWasteController.cancel);

// Nguyen vat lieu
inventoryRouter.get('/ingredients', InventoryController.getIngredients);
inventoryRouter.post('/ingredients', InventoryController.createIngredient);
inventoryRouter.get('/ingredients/:id', InventoryController.getIngredientById);
inventoryRouter.patch('/ingredients/:id', InventoryController.updateIngredient);

// Nhap kho thu cong
inventoryRouter.post('/stock-in', InventoryController.stockIn);

// Nhap xuat Excel
inventoryRouter.get('/excel/template', InventoryController.downloadTemplate);
inventoryRouter.get('/excel/export', InventoryController.exportStock);
inventoryRouter.post('/excel/preview', InventoryController.previewExcel);
inventoryRouter.post('/excel/commit', InventoryController.commitExcel);

// Dinh luong BOM mon an
inventoryRouter.get('/recipes/:menuItemId', InventoryController.getRecipe);
inventoryRouter.put('/recipes/:menuItemId', InventoryController.updateRecipe);
