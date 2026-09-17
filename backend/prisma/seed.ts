import { MenuItemType, MenuType, PrismaClient, Role, TableStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const defaultPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

function generateQrCodeToken() {
  return `qr_${randomBytes(18).toString('base64url')}`;
}

function isLegacyQrCodeToken(token?: string | null) {
  return /^QR-TABLE-\d{2}$/.test(token ?? '');
}

function formatMenuSku(sequence: number) {
  return `SP${sequence.toString().padStart(6, '0')}`;
}

function inferMenuType(categoryName: string): MenuType {
  if (categoryName.includes('Đồ Uống')) {
    return MenuType.DRINK;
  }
  return MenuType.FOOD;
}

function inferMenuItemType(categoryName: string): MenuItemType {
  if (categoryName.includes('Combo')) {
    return MenuItemType.COMBO;
  }
  return MenuItemType.REGULAR;
}

export async function seedDatabase(prisma: PrismaClient = defaultPrisma) {
  console.log('🌱 Bat dau seed du lieu mau cho CRISPY BITE...');

  // 1. Seed 3 Tai khoan nguoi dung (bcrypt cost 12)
  const salt = await bcrypt.genSalt(12);
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  const cashierPassword = process.env.SEED_CASHIER_PASSWORD || 'cashier123';
  const kitchenPassword = process.env.SEED_KITCHEN_PASSWORD || 'kitchen123';

  const adminHash = await bcrypt.hash(adminPassword, salt);
  const cashierHash = await bcrypt.hash(cashierPassword, salt);
  const kitchenHash = await bcrypt.hash(kitchenPassword, salt);

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash: adminHash, name: 'Quản Lý Nhà Hàng (Admin)', role: Role.ADMIN },
    create: { username: 'admin', passwordHash: adminHash, name: 'Quản Lý Nhà Hàng (Admin)', role: Role.ADMIN }
  });

  await prisma.user.upsert({
    where: { username: 'cashier' },
    update: { passwordHash: cashierHash, name: 'Thu Ngân Quầy (Cashier)', role: Role.CASHIER },
    create: { username: 'cashier', passwordHash: cashierHash, name: 'Thu Ngân Quầy (Cashier)', role: Role.CASHIER }
  });

  await prisma.user.upsert({
    where: { username: 'kitchen' },
    update: { passwordHash: kitchenHash, name: 'Bếp Trưởng (Kitchen)', role: Role.KITCHEN },
    create: { username: 'kitchen', passwordHash: kitchenHash, name: 'Bếp Trưởng (Kitchen)', role: Role.KITCHEN }
  });

  console.log('✅ Da tao 3 tai khoan User: admin, cashier, kitchen');

  // 2. Seed 12 Ban an (Table 01 -> 12)
  for (let i = 1; i <= 12; i++) {
    const tableNum = i;
    const existingTable = await prisma.diningTable.findUnique({
      where: { tableNumber: tableNum },
      select: { qrCodeToken: true }
    });
    const token =
      existingTable && !isLegacyQrCodeToken(existingTable.qrCodeToken)
        ? existingTable.qrCodeToken
        : generateQrCodeToken();
    const cap = tableNum <= 4 ? 2 : tableNum <= 10 ? 4 : 8;

    await prisma.diningTable.upsert({
      where: { tableNumber: tableNum },
      update: { qrCodeToken: token, capacity: cap, status: TableStatus.AVAILABLE },
      create: { tableNumber: tableNum, qrCodeToken: token, capacity: cap, status: TableStatus.AVAILABLE }
    });
  }
  console.log('✅ Da tao 12 Ban an voi QR Tokens duy nhat');

  // 3. Seed Danh muc & 20+ Mon an
  const categoriesData = [
    {
      name: 'Combo Tiết Kiệm',
      displayOrder: 1,
      items: [
        {
          name: 'Combo 1 Người: Gà Giòn + Khoai + Nước',
          description: '1 miếng gà rán giòn rụm + 1 khoai tây chiên vừa + 1 ly Pepsi mát lạnh',
          basePrice: 69000,
          modifiers: [
            {
              name: '1. Chọn Vị Gà',
              isRequired: true,
              minSelect: 1,
              maxSelect: 1,
              options: [
                { name: 'Gà Giòn Truyền Thống', priceDelta: 0 },
                { name: 'Gà Cay Nồng Crispy', priceDelta: 0 },
                { name: 'Gà Sốt Bơ Tỏi Hàn Quốc', priceDelta: 5000 }
              ]
            },
            {
              name: '2. Nâng Cấp Khoai & Nước',
              isRequired: false,
              minSelect: 0,
              maxSelect: 1,
              options: [
                { name: 'Nâng Size Lớn (Khoai L + Pepsi L)', priceDelta: 10000 },
                { name: 'Đổi Khoai sang Phô Mai Que (2c)', priceDelta: 12000 }
              ]
            }
          ]
        },
        {
          name: 'Combo 2 Người: Siêu No Đậm Vị',
          description: '3 miếng gà giòn + 1 Burger Bò Phô Mai + 2 ly nước ngọt',
          basePrice: 159000,
          modifiers: [
            {
              name: 'Chọn Vị Gà Rán',
              isRequired: true,
              minSelect: 1,
              maxSelect: 1,
              options: [
                { name: 'Tất Cả Gà Truyền Thống', priceDelta: 0 },
                { name: 'Mix Cay & Truyền Thống', priceDelta: 0 },
                { name: 'Phủ Sốt Phô Mai Cay Toàn Bộ', priceDelta: 12000 }
              ]
            }
          ]
        },
        {
          name: 'Combo Gia Đình Vui Vẻ',
          description: '6 miếng gà rán + 1 phần Gà Popcorn + 1 Khoai tây lớn + 4 ly nước',
          basePrice: 289000,
          modifiers: [
            {
              name: 'Chọn Vị Gà',
              isRequired: true,
              minSelect: 1,
              maxSelect: 1,
              options: [
                { name: 'Mix Cay & Không Cay', priceDelta: 0 },
                { name: 'Gà Truyền Thống Toàn Bộ', priceDelta: 0 }
              ]
            }
          ]
        }
      ]
    },
    {
      name: 'Gà Rán Giòn Rụm',
      displayOrder: 2,
      items: [
        {
          name: 'Gà Rán Giòn Cay (1 Miếng)',
          description: 'Miếng gà tươi tẩm bột chiên giòn theo công thức độc quyền Crispy Bite',
          basePrice: 35000,
          modifiers: [
            {
              name: 'Chọn Phần Thịt Gà',
              isRequired: true,
              minSelect: 1,
              maxSelect: 1,
              options: [
                { name: 'Đùi Gà Giòn', priceDelta: 0 },
                { name: 'Cánh Gà Giòn', priceDelta: 0 },
                { name: 'Má Đùi Gà', priceDelta: 0 },
                { name: 'Ức Gà', priceDelta: 0 }
              ]
            }
          ]
        },
        {
          name: 'Gà Rán Giòn Cay (2 Miếng)',
          description: '2 miếng gà giòn rụm vàng ươm, thơm ngon khó cưỡng',
          basePrice: 68000,
          modifiers: [
            {
              name: 'Chọn Vị Gà',
              isRequired: true,
              minSelect: 1,
              maxSelect: 1,
              options: [
                { name: 'Truyền Thống', priceDelta: 0 },
                { name: 'Cay Nồng', priceDelta: 0 },
                { name: 'Sốt Cay Hàn Quốc', priceDelta: 8000 }
              ]
            }
          ]
        },
        {
          name: 'Gà Rán Giòn Cay (3 Miếng)',
          description: '3 miếng gà giòn ăn thoả thích cho tín đồ mê gà rán',
          basePrice: 99000,
          modifiers: []
        },
        {
          name: 'Gà Rán Sốt Phô Mai Cay (2 Miếng)',
          description: 'Gà rán ngập tràn sốt phô mai béo ngậy xen lẫn vị cay hấp dẫn',
          basePrice: 79000,
          modifiers: []
        },
        {
          name: 'Gà Popcorn Lắc Phô Mai',
          description: 'Từng viên thịt gà rút xương giòn tan lắc phô mai đậm đà',
          basePrice: 45000,
          modifiers: []
        }
      ]
    },
    {
      name: 'Burger & Cơm',
      displayOrder: 3,
      items: [
        {
          name: 'Burger Bò Nướng Phô Mai',
          description: 'Bò nhập khẩu nướng lửa hồng kèm phô mai Cheddar và rau xà lách tươi',
          basePrice: 55000,
          modifiers: [
            {
              name: 'Thêm Topping Burger',
              isRequired: false,
              minSelect: 0,
              maxSelect: 2,
              options: [
                { name: 'Thêm 1 Lát Phô Mai Cheddar', priceDelta: 8000 },
                { name: 'Thêm 1 Miếng Thịt Bò Nướng', priceDelta: 25000 }
              ]
            }
          ]
        },
        {
          name: 'Burger Gà Giòn Cay Đặc Biệt',
          description: 'Thịt đùi gà phi lê chiên xù giòn tan với sốt mayo cay',
          basePrice: 49000,
          modifiers: []
        },
        {
          name: 'Burger Tôm Hoàng Gia',
          description: 'Chả tôm tươi giòn ngọt tự nhiên kèm sốt Tartar thanh mát',
          basePrice: 59000,
          modifiers: []
        },
        {
          name: 'Cơm Gà Rán Sốt Tiêu Đen',
          description: 'Cơm dẻo thơm ăn kèm gà rán giòn rụm và sốt tiêu đen đậm vị',
          basePrice: 49000,
          modifiers: []
        },
        {
          name: 'Cơm Gà Giòn Sốt Teriyaki',
          description: 'Cơm nóng ăn kèm gà giòn sốt Teriyaki ngọt dịu chuẩn vị Nhật',
          basePrice: 49000,
          modifiers: []
        }
      ]
    },
    {
      name: 'Món Ăn Kèm & Snack',
      displayOrder: 4,
      items: [
        {
          name: 'Khoai Tây Chiên Giòn (Vừa)',
          description: 'Khoai tây cắt thanh vàng giòn rụm',
          basePrice: 25000,
          modifiers: [
            {
              name: 'Chọn Bột Lắc',
              isRequired: false,
              minSelect: 0,
              maxSelect: 1,
              options: [
                { name: 'Lắc Bột Phô Mai', priceDelta: 5000 },
                { name: 'Lắc Xí Muội Cay', priceDelta: 5000 }
              ]
            }
          ]
        },
        {
          name: 'Khoai Tây Chiên Giòn (Lớn)',
          description: 'Khoai tây chiên phần lớn chia sẻ cùng bạn bè',
          basePrice: 35000,
          modifiers: []
        },
        {
          name: 'Phô Mai Que Mozzarella (3 Cây)',
          description: 'Phô mai kéo sợi béo ngậy giòn vỏ ngoài',
          basePrice: 39000,
          modifiers: []
        },
        {
          name: 'Bắp Cải Trộn Coleslaw',
          description: 'Rau bắp cải giòn mát trộn sốt kem chua ngọt giải ngấy',
          basePrice: 19000,
          modifiers: []
        },
        {
          name: 'Mực Vòng Chiên Giòn Calamari',
          description: 'Khoanh mực tẩm bột chiên vàng giòn thơm nức',
          basePrice: 49000,
          modifiers: []
        }
      ]
    },
    {
      name: 'Đồ Uống & Tráng Miệng',
      displayOrder: 5,
      items: [
        {
          name: 'Pepsi Tươi Mát Lạnh',
          description: 'Nước ngọt có gas Pepsi chính hãng sảng khoái',
          basePrice: 18000,
          modifiers: [
            {
              name: 'Chọn Kích Thước Ly',
              isRequired: true,
              minSelect: 1,
              maxSelect: 1,
              options: [
                { name: 'Ly Vừa (M)', priceDelta: 0 },
                { name: 'Ly Lớn (L)', priceDelta: 6000 }
              ]
            }
          ]
        },
        {
          name: '7Up Vị Chanh Tươi',
          description: 'Nước ngọt 7Up có gas giải nhiệt cực đã',
          basePrice: 18000,
          modifiers: []
        },
        {
          name: 'Mirinda Cam Sủi Bọt',
          description: 'Nước ngọt vị cam ngọt ngào bung tỏa bọt gas',
          basePrice: 18000,
          modifiers: []
        },
        {
          name: 'Trà Đào Cam Sả Tươi Mát',
          description: 'Trà đào thơm ngát kết hợp cam tươi và sả thanh nhiệt',
          basePrice: 32000,
          modifiers: []
        },
        {
          name: 'Kem Tươi Vani Ốc Quế',
          description: 'Kem tươi vani ngọt ngào mềm mịn trong ốc quế giòn tan',
          basePrice: 10000,
          modifiers: []
        }
      ]
    }
  ];

  const usedMenuSkus = new Set(
    (await prisma.menuItem.findMany({ select: { sku: true } })).map((item) => item.sku)
  );
  let nextMenuSkuNumber = 1;
  const reserveNextMenuSku = () => {
    let sku = formatMenuSku(nextMenuSkuNumber);
    while (usedMenuSkus.has(sku)) {
      nextMenuSkuNumber += 1;
      sku = formatMenuSku(nextMenuSkuNumber);
    }
    usedMenuSkus.add(sku);
    nextMenuSkuNumber += 1;
    return sku;
  };

  for (const catData of categoriesData) {
    let category = await prisma.category.findFirst({
      where: { name: catData.name }
    });

    if (!category) {
      category = await prisma.category.create({
        data: {
          name: catData.name,
          displayOrder: catData.displayOrder
        }
      });
    }

    for (let idx = 0; idx < catData.items.length; idx++) {
      const itemData = catData.items[idx];
      let menuItem = await prisma.menuItem.findFirst({
        where: { name: itemData.name, categoryId: category.id }
      });

      if (!menuItem) {
        menuItem = await prisma.menuItem.create({
          data: {
            categoryId: category.id,
            sku: reserveNextMenuSku(),
            name: itemData.name,
            description: itemData.description,
            basePrice: itemData.basePrice,
            displayOrder: idx + 1,
            isAvailable: true,
            menuType: inferMenuType(catData.name),
            itemType: inferMenuItemType(catData.name),
            trackStock: false,
            stockQuantity: 0,
            position: null
          }
        });
      }

      // Modifier Groups
      for (const modGroupData of itemData.modifiers) {
        let modGroup = await prisma.modifierGroup.findFirst({
          where: { menuItemId: menuItem.id, name: modGroupData.name }
        });

        if (!modGroup) {
          modGroup = await prisma.modifierGroup.create({
            data: {
              menuItemId: menuItem.id,
              name: modGroupData.name,
              isRequired: modGroupData.isRequired,
              minSelect: modGroupData.minSelect,
              maxSelect: modGroupData.maxSelect
            }
          });
        }

        for (const optData of modGroupData.options) {
          const existingOpt = await prisma.modifierOption.findFirst({
            where: { modifierGroupId: modGroup.id, name: optData.name }
          });

          if (!existingOpt) {
            await prisma.modifierOption.create({
              data: {
                modifierGroupId: modGroup.id,
                name: optData.name,
                priceDelta: optData.priceDelta,
                isAvailable: true
              }
            });
          }
        }
      }
    }
  }

  console.log('✅ Da tao thanh cong 5 Danh muc va 21+ Mon an kem Modifiers');

  // 4. Seed 8 Nguyen vat lieu trong yeu (BOM & Kho)
  console.log('📦 Bat dau seed Danh muc Nguyen vat lieu va Dinh luong BOM...');
  const sampleIngredients = [
    {
      sku: 'ING-CHICKEN-01',
      name: 'Thịt gà fillet tươi',
      unit: 'gram',
      currentStock: 25000, // 25kg
      minThreshold: 5000,
      costPerUnit: 85 // 85d/g = 85.000d/kg
    },
    {
      sku: 'ING-WINGS-01',
      name: 'Cánh gà khúc giữa tươi',
      unit: 'gram',
      currentStock: 15000,
      minThreshold: 3000,
      costPerUnit: 95 // 95.000d/kg
    },
    {
      sku: 'ING-POTATO-01',
      name: 'Khoai tây đông lạnh nhập khẩu',
      unit: 'gram',
      currentStock: 30000,
      minThreshold: 5000,
      costPerUnit: 35 // 35.000d/kg
    },
    {
      sku: 'ING-OIL-01',
      name: 'Dầu chiên thực vật cao cấp',
      unit: 'ml',
      currentStock: 40000, // 40L
      minThreshold: 10000,
      costPerUnit: 40 // 40.000d/L
    },
    {
      sku: 'ING-BUN-01',
      name: 'Vỏ bánh Burger mè vàng',
      unit: 'cái',
      currentStock: 200,
      minThreshold: 30,
      costPerUnit: 6000
    },
    {
      sku: 'ING-BEEF-01',
      name: 'Bò miếng nướng Burger 100g',
      unit: 'miếng',
      currentStock: 150,
      minThreshold: 20,
      costPerUnit: 22000
    },
    {
      sku: 'ING-CHEESE-01',
      name: 'Phô mai Cheddar lát béo',
      unit: 'lát',
      currentStock: 300,
      minThreshold: 50,
      costPerUnit: 5000
    },
    {
      sku: 'ING-COCA-01',
      name: 'Lon nước ngọt Coca-Cola 320ml',
      unit: 'lon',
      currentStock: 120,
      minThreshold: 24,
      costPerUnit: 7500
    }
  ];

  const ingredientMap = new Map<string, number>();

  for (const ing of sampleIngredients) {
    const record = await prisma.ingredient.upsert({
      where: { sku: ing.sku },
      update: {
        name: ing.name,
        unit: ing.unit,
        currentStock: ing.currentStock,
        minThreshold: ing.minThreshold,
        costPerUnit: ing.costPerUnit,
        isActive: true
      },
      create: {
        sku: ing.sku,
        name: ing.name,
        unit: ing.unit,
        currentStock: ing.currentStock,
        minThreshold: ing.minThreshold,
        costPerUnit: ing.costPerUnit,
        isActive: true
      }
    });

    ingredientMap.set(ing.sku, record.id);

    // Ghi log STOCK_IN ban dau neu chua co
    const existingTx = await prisma.inventoryTransaction.findFirst({
      where: { ingredientId: record.id, note: 'Tồn kho ban đầu khi khởi tạo hệ thống' }
    });

    if (!existingTx) {
      await prisma.inventoryTransaction.create({
        data: {
          ingredientId: record.id,
          type: 'STOCK_IN',
          quantity: ing.currentStock,
          costAmount: Math.round(ing.currentStock * ing.costPerUnit),
          note: 'Tồn kho ban đầu khi khởi tạo hệ thống'
        }
      });
    }
  }

  // 5. Cai dat BOM cho tat ca cac mon an trong thuc don
  const allMenuItems = await prisma.menuItem.findMany();
  const menuItemByName = new Map(allMenuItems.map((m) => [m.name, m.id]));

  const recipeDefinitions: Array<{
    menuItemName: string;
    ingredients: Array<{ sku: string; qty: number }>;
  }> = [
    // 1. Combo Tiet Kiem
    {
      menuItemName: 'Combo 1 Người: Gà Giòn + Khoai + Nước',
      ingredients: [
        { sku: 'ING-CHICKEN-01', qty: 180 }, // 180g gà
        { sku: 'ING-POTATO-01', qty: 120 },  // 120g khoai
        { sku: 'ING-OIL-01', qty: 35 },      // 35ml dầu
        { sku: 'ING-COCA-01', qty: 1 }       // 1 lon nước ngọt
      ]
    },
    {
      menuItemName: 'Combo 2 Người: Siêu No Đậm Vị',
      ingredients: [
        { sku: 'ING-CHICKEN-01', qty: 540 }, // 3 miếng gà (540g)
        { sku: 'ING-OIL-01', qty: 75 },      // 75ml dầu
        { sku: 'ING-BUN-01', qty: 1 },       // 1 vỏ burger
        { sku: 'ING-BEEF-01', qty: 1 },      // 1 miếng bò
        { sku: 'ING-CHEESE-01', qty: 1 },    // 1 lát phô mai
        { sku: 'ING-COCA-01', qty: 2 }       // 2 lon nước
      ]
    },
    {
      menuItemName: 'Combo Gia Đình Vui Vẻ',
      ingredients: [
        { sku: 'ING-CHICKEN-01', qty: 1230 }, // 6 miếng gà + 1 phần popcorn (1.230g)
        { sku: 'ING-POTATO-01', qty: 200 },   // 1 phần khoai tây lớn (200g)
        { sku: 'ING-OIL-01', qty: 160 },      // 160ml dầu
        { sku: 'ING-COCA-01', qty: 4 }        // 4 lon nước
      ]
    },

    // 2. Ga Ran Gion Rum
    {
      menuItemName: 'Gà Rán Giòn Cay (1 Miếng)',
      ingredients: [
        { sku: 'ING-CHICKEN-01', qty: 180 },
        { sku: 'ING-OIL-01', qty: 25 }
      ]
    },
    {
      menuItemName: 'Gà Rán Giòn Cay (2 Miếng)',
      ingredients: [
        { sku: 'ING-CHICKEN-01', qty: 360 },
        { sku: 'ING-OIL-01', qty: 50 }
      ]
    },
    {
      menuItemName: 'Gà Rán Giòn Cay (3 Miếng)',
      ingredients: [
        { sku: 'ING-CHICKEN-01', qty: 540 },
        { sku: 'ING-OIL-01', qty: 75 }
      ]
    },
    {
      menuItemName: 'Gà Rán Sốt Phô Mai Cay (2 Miếng)',
      ingredients: [
        { sku: 'ING-CHICKEN-01', qty: 360 },
        { sku: 'ING-CHEESE-01', qty: 1 },
        { sku: 'ING-OIL-01', qty: 50 }
      ]
    },
    {
      menuItemName: 'Gà Popcorn Lắc Phô Mai',
      ingredients: [
        { sku: 'ING-CHICKEN-01', qty: 150 },
        { sku: 'ING-CHEESE-01', qty: 1 },
        { sku: 'ING-OIL-01', qty: 20 }
      ]
    },

    // 3. Burger & Com
    {
      menuItemName: 'Burger Bò Nướng Phô Mai',
      ingredients: [
        { sku: 'ING-BUN-01', qty: 1 },
        { sku: 'ING-BEEF-01', qty: 1 },
        { sku: 'ING-CHEESE-01', qty: 1 }
      ]
    },
    {
      menuItemName: 'Burger Gà Giòn Cay Đặc Biệt',
      ingredients: [
        { sku: 'ING-BUN-01', qty: 1 },
        { sku: 'ING-CHICKEN-01', qty: 140 },
        { sku: 'ING-CHEESE-01', qty: 1 },
        { sku: 'ING-OIL-01', qty: 20 }
      ]
    },
    {
      menuItemName: 'Burger Tôm Hoàng Gia',
      ingredients: [
        { sku: 'ING-BUN-01', qty: 1 },
        { sku: 'ING-CHEESE-01', qty: 1 }
      ]
    },
    {
      menuItemName: 'Cơm Gà Rán Sốt Tiêu Đen',
      ingredients: [
        { sku: 'ING-CHICKEN-01', qty: 180 },
        { sku: 'ING-OIL-01', qty: 25 }
      ]
    },
    {
      menuItemName: 'Cơm Gà Giòn Sốt Teriyaki',
      ingredients: [
        { sku: 'ING-CHICKEN-01', qty: 180 },
        { sku: 'ING-OIL-01', qty: 25 }
      ]
    },

    // 4. Mon An Kem & Snack
    {
      menuItemName: 'Khoai Tây Chiên Giòn (Vừa)',
      ingredients: [
        { sku: 'ING-POTATO-01', qty: 120 },
        { sku: 'ING-OIL-01', qty: 15 }
      ]
    },
    {
      menuItemName: 'Khoai Tây Chiên Giòn (Lớn)',
      ingredients: [
        { sku: 'ING-POTATO-01', qty: 200 },
        { sku: 'ING-OIL-01', qty: 25 }
      ]
    },
    {
      menuItemName: 'Phô Mai Que Mozzarella (3 Cây)',
      ingredients: [
        { sku: 'ING-CHEESE-01', qty: 2 },
        { sku: 'ING-OIL-01', qty: 15 }
      ]
    },
    {
      menuItemName: 'Mực Vòng Chiên Giòn Calamari',
      ingredients: [
        { sku: 'ING-OIL-01', qty: 25 }
      ]
    },

    // 5. Do Uong
    {
      menuItemName: 'Pepsi Tươi Mát Lạnh',
      ingredients: [
        { sku: 'ING-COCA-01', qty: 1 }
      ]
    },
    {
      menuItemName: '7Up Vị Chanh Tươi',
      ingredients: [
        { sku: 'ING-COCA-01', qty: 1 }
      ]
    },
    {
      menuItemName: 'Mirinda Cam Sủi Bọt',
      ingredients: [
        { sku: 'ING-COCA-01', qty: 1 }
      ]
    }
  ];

  // Xoa sach dinh luong cu de dong bo dinh luong chuan xac 100%
  await prisma.menuItemIngredient.deleteMany();

  let matchedRecipesCount = 0;
  for (const def of recipeDefinitions) {
    const menuItemId = menuItemByName.get(def.menuItemName);
    if (!menuItemId) {
      console.warn(`⚠️ Canh bao: Khong tim thay mon an co ten "${def.menuItemName}" de map BOM`);
      continue;
    }
    matchedRecipesCount++;

    for (const item of def.ingredients) {
      const ingId = ingredientMap.get(item.sku);
      if (!ingId) continue;

      await prisma.menuItemIngredient.upsert({
        where: {
          menuItemId_ingredientId: {
            menuItemId,
            ingredientId: ingId
          }
        },
        update: {
          quantityRequired: item.qty
        },
        create: {
          menuItemId,
          ingredientId: ingId,
          quantityRequired: item.qty
        }
      });
    }
  }

  console.log(`✅ Da seed 8 Nguyen lieu va Dinh luong BOM cho ${matchedRecipesCount}/${recipeDefinitions.length} mon an thanh cong`);
  console.log('🎉 SEED DATABASE HOAN TAT 100%!');
}

if (require.main === module) {
  seedDatabase()
    .catch((e) => {
      console.error('❌ Loi trong qua trinh seed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await defaultPrisma.$disconnect();
    });
}
