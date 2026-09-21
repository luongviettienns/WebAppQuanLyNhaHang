import * as XLSX from 'xlsx';

export interface ParsedExcelRow {
  rowNumber: number;
  sku: string;
  name?: string;
  unit?: string;
  quantity: number;
  costPerUnit: number;
  note?: string;
}

/**
 * Tao file Excel mau (Template) cho quan ly kho nhap hang
 */
export function generateTemplateWorkbook(): Buffer {
  const wb = XLSX.utils.book_new();

  const headers = [
    'Mã nguyên liệu',
    'Tên nguyên liệu',
    'Đơn vị tính',
    'Số lượng nhập',
    'Đơn giá nhập (VND)',
    'Ghi chú'
  ];

  const sampleRows = [
    ['ING-CHICKEN-01', 'Thịt gà fillet tươi', 'gram', 5000, 85, 'Nhà cung cấp Ba Huân'],
    ['ING-POTATO-01', 'Khoai tây đông lạnh', 'gram', 10000, 35, 'Nhập lô hàng sáng'],
    ['ING-OIL-01', 'Dầu chiên thực vật', 'ml', 20000, 40, 'Can 20 Lít'],
    ['ING-BUN-01', 'Vỏ bánh Burger mè vàng', 'cái', 100, 6000, 'Bánh tươi trong ngày']
  ];

  const wsData = [headers, ...sampleRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set do rong cot
  ws['!cols'] = [
    { wch: 18 }, // Ma
    { wch: 28 }, // Ten
    { wch: 14 }, // Don vi
    { wch: 16 }, // So luong
    { wch: 20 }, // Don gia
    { wch: 30 }  // Ghi chu
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Mau_Nhap_Kho');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Doc buffer Excel va parse thanh danh sach dong du lieu
 */
export function parseExcelBuffer(buffer: Buffer): ParsedExcelRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('File Excel không có trang tính (sheet) nào');
  }

  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rawData.length <= 1) {
    return [];
  }

  const result: ParsedExcelRow[] = [];

  // Dong 0 la header, du lieu bat dau tu dong 1 (1-indexed trong Excel la dong 2)
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;

    const sku = String(row[0] ?? '').trim();
    if (!sku) continue; // Bo qua dong trong

    const name = String(row[1] ?? '').trim();
    const unit = String(row[2] ?? '').trim();
    const quantityRaw = row[3];
    const costRaw = row[4];
    const note = String(row[5] ?? '').trim();

    const quantity = typeof quantityRaw === 'number' ? quantityRaw : parseFloat(String(quantityRaw).replace(/,/g, ''));
    const costPerUnit = typeof costRaw === 'number' ? Math.round(costRaw) : parseInt(String(costRaw).replace(/,/g, ''), 10);

    result.push({
      rowNumber: i + 1, // Dong thuc te tren Excel
      sku,
      name: name || undefined,
      unit: unit || undefined,
      quantity: isNaN(quantity) ? 0 : quantity,
      costPerUnit: isNaN(costPerUnit) ? 0 : costPerUnit,
      note: note || undefined
    });
  }

  return result;
}

/**
 * Parse the shared stock-in workbook format for a purchase-receipt preview.
 * Keeping this entry point separate makes it explicit that the caller only
 * parses rows; it does not commit stock or create a ledger transaction.
 */
export function parsePurchaseReceiptExcelBuffer(buffer: Buffer): ParsedExcelRow[] {
  return parseExcelBuffer(buffer);
}

/**
 * Xuat toan bo danh muc ton kho hien tai ra file Excel
 */
export function exportInventoryWorkbook(
  ingredients: Array<{
    sku: string;
    name: string;
    unit: string;
    currentStock: number;
    minThreshold: number;
    costPerUnit: number;
  }>
): Buffer {
  const wb = XLSX.utils.book_new();

  const headers = [
    'Mã NVL',
    'Tên nguyên liệu',
    'Đơn vị tính',
    'Tồn kho hiện tại',
    'Đơn giá vốn (VND)',
    'Tổng giá trị tồn (VND)',
    'Trạng thái cảnh báo',
    'Kiểm kê thực tế',
    'Ghi chú kiểm kê'
  ];

  const rows = ingredients.map((ing) => {
    let statusText = 'Bình thường';
    if (ing.currentStock < 0) {
      statusText = '🔴 Bán âm (Thiếu kho)';
    } else if (ing.currentStock <= ing.minThreshold) {
      statusText = '⚠️ Sắp hết hàng';
    }

    const totalValue = Math.round(ing.currentStock * ing.costPerUnit);

    return [
      ing.sku,
      ing.name,
      ing.unit,
      ing.currentStock,
      ing.costPerUnit,
      totalValue,
      statusText,
      '', // O trong de nhan vien ghi kiem ke thuc te
      ''
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  ws['!cols'] = [
    { wch: 18 },
    { wch: 28 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 22 },
    { wch: 24 },
    { wch: 18 },
    { wch: 25 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Bao_Cao_Ton_Kho');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
