import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';
import { CreateMenuItemInput, UpdateMenuItemInput } from './menu.schemas';

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
   * Admin tao mon an moi kem cac modifier groups va options
   */
  static async createMenuItem(input: CreateMenuItemInput) {
    const category = await prisma.category.findUnique({
      where: { id: input.categoryId }
    });
    if (!category) {
      throw ApiError.badRequest(`Danh mục với ID ${input.categoryId} không tồn tại`);
    }

    const menuItem = await prisma.$transaction(async (tx) => {
      const created = await tx.menuItem.create({
        data: {
          categoryId: input.categoryId,
          name: input.name,
          description: input.description,
          basePrice: input.basePrice,
          imageUrl: input.imageUrl,
          isAvailable: input.isAvailable ?? true,
          displayOrder: input.displayOrder ?? 0,
          modifierGroups: input.modifierGroups && input.modifierGroups.length > 0 ? {
            create: input.modifierGroups.map(group => ({
              name: group.name,
              isRequired: group.isRequired ?? false,
              minSelect: group.minSelect ?? 0,
              maxSelect: group.maxSelect ?? 1,
              options: {
                create: group.options.map(opt => ({
                  name: opt.name,
                  priceDelta: opt.priceDelta ?? 0,
                  isAvailable: opt.isAvailable ?? true
                }))
              }
            }))
          } : undefined
        },
        include: {
          modifierGroups: {
            include: {
              options: true
            }
          }
        }
      });
      return created;
    });

    return { menuItem };
  }

  /**
   * Admin cap nhat thong tin mon an, gia, danh muc hoac modifier groups
   */
  static async updateMenuItem(id: number, input: UpdateMenuItemInput) {
    const existing = await prisma.menuItem.findUnique({
      where: { id }
    });
    if (!existing) {
      throw ApiError.notFound(`Món ăn với ID ${id} không tồn tại`);
    }

    if (input.categoryId !== undefined) {
      const category = await prisma.category.findUnique({
        where: { id: input.categoryId }
      });
      if (!category) {
        throw ApiError.badRequest(`Danh mục với ID ${input.categoryId} không tồn tại`);
      }
    }

    const menuItem = await prisma.$transaction(async (tx) => {
      if (input.modifierGroups !== undefined) {
        // Xoa cac modifier group cu cua mon an (options duoc cascade delete)
        await tx.modifierGroup.deleteMany({
          where: { menuItemId: id }
        });
      }

      const updated = await tx.menuItem.update({
        where: { id },
        data: {
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.basePrice !== undefined ? { basePrice: input.basePrice } : {}),
          ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
          ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
          ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
          ...(input.modifierGroups !== undefined ? {
            modifierGroups: {
              create: input.modifierGroups.map(group => ({
                name: group.name,
                isRequired: group.isRequired ?? false,
                minSelect: group.minSelect ?? 0,
                maxSelect: group.maxSelect ?? 1,
                options: {
                  create: group.options.map(opt => ({
                    name: opt.name,
                    priceDelta: opt.priceDelta ?? 0,
                    isAvailable: opt.isAvailable ?? true
                  }))
                }
              }))
            }
          } : {})
        },
        include: {
          modifierGroups: {
            include: {
              options: true
            }
          }
        }
      });

      return updated;
    });

    if (input.isAvailable !== undefined && input.isAvailable !== existing.isAvailable) {
      emitToAll('menu:itemSoldOutChanged', {
        menuItemId: menuItem.id,
        isAvailable: menuItem.isAvailable
      });
    }

    return { menuItem };
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
