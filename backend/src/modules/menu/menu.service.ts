import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';

export class MenuService {
  /**
   * Lay toan bo danh muc mon an kem cac nhom Modifier va lua chon Option
   */
  static async getFullMenu() {
    const categories = await prisma.category.findMany({
      orderBy: { displayOrder: 'asc' },
      include: {
        menuItems: {
          orderBy: { displayOrder: 'asc' },
          include: {
            modifierGroups: {
              include: {
                options: true
              }
            }
          }
        }
      }
    });

    return { categories };
  }

  /**
   * Cap nhat trang thai con hang / het hang (86d) cua mon an
   */
  static async updateSoldOut(menuItemId: number, isAvailable: boolean) {
    const existing = await prisma.menuItem.findUnique({
      where: { id: menuItemId }
    });

    if (!existing) {
      throw ApiError.notFound(`Món ăn với ID ${menuItemId} không tồn tại`);
    }

    const updated = await prisma.menuItem.update({
      where: { id: menuItemId },
      data: { isAvailable },
      include: {
        modifierGroups: {
          include: {
            options: true
          }
        }
      }
    });

    // Phat su kien real-time xuong toan bo may POS va KDS
    emitToAll('menu:itemSoldOutChanged', {
      menuItemId: updated.id,
      isAvailable: updated.isAvailable
    });

    return { menuItem: updated };
  }
}
