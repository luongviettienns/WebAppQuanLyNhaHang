import { Router } from 'express';
import { InventoryController } from './inventory.controller';
import { SupplierController } from './supplier.controller';
import { PurchaseReceiptController } from './purchase-receipt.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

export const inventoryRouter = Router();

// File mau Excel la tai nguyen mau khong chua du lieu nhay cam
inventoryRouter.get('/excel/template', InventoryController.downloadTemplate);

// Tat ca cac route con lai quan ly kho va dinh luong yeu cau quyen ADMIN
inventoryRouter.use(authenticate, authorize('ADMIN'));

// Danh sach kho hop nhat (read-only)
inventoryRouter.get('/catalog', InventoryController.getCatalog);
inventoryRouter.get('/catalog/export', InventoryController.exportCatalog);

// Nha cung cap toi thieu cho phieu nhap hang
inventoryRouter.get('/suppliers', SupplierController.list);
inventoryRouter.post('/suppliers', SupplierController.create);
inventoryRouter.patch('/suppliers/:id', SupplierController.update);

// Phieu nhap hang theo vong doi draft -> posted/cancelled
inventoryRouter.get('/purchase-receipts', PurchaseReceiptController.list);
inventoryRouter.post('/purchase-receipts', PurchaseReceiptController.create);
inventoryRouter.get('/purchase-receipts/:id', PurchaseReceiptController.detail);
inventoryRouter.patch('/purchase-receipts/:id', PurchaseReceiptController.update);
inventoryRouter.post('/purchase-receipts/:id/post', PurchaseReceiptController.post);
inventoryRouter.post('/purchase-receipts/:id/cancel', PurchaseReceiptController.cancel);

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
