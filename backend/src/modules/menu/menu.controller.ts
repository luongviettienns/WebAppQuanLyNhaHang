import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { MenuService } from './menu.service';
import { updateSoldOutSchema, createMenuItemSchema, updateMenuItemSchema } from './menu.schemas';
import { ApiError } from '../../lib/api-error';
import { getUploadsDir } from '../../lib/uploads';

export class MenuController {
  static async getMenu(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await MenuService.getFullMenu();
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async createMenuItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = createMenuItemSchema.parse(req.body);
      const data = await MenuService.createMenuItem(validated);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async updateMenuItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const menuItemId = parseInt(req.params.id, 10);
      if (isNaN(menuItemId)) {
        throw ApiError.badRequest('ID món ăn không hợp lệ');
      }
      const validated = updateMenuItemSchema.parse(req.body);
      const data = await MenuService.updateMenuItem(menuItemId, validated);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async updateSoldOut(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const menuItemId = parseInt(req.params.id, 10);
      const { isAvailable } = updateSoldOutSchema.parse(req.body);

      const data = await MenuService.updateSoldOut(menuItemId, isAvailable);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async uploadImage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { dataUrl, fileName } = req.body;
      if (!dataUrl || typeof dataUrl !== 'string') {
        throw ApiError.badRequest('Dữ liệu ảnh (dataUrl) là bắt buộc');
      }

      const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        throw ApiError.badRequest('Định dạng ảnh không hợp lệ (yêu cầu base64 dataUrl)');
      }

      const rawExt = matches[1].toLowerCase();
      const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
      const allowedExts = ['jpg', 'png', 'webp', 'gif', 'svg+xml'];
      if (!allowedExts.includes(ext)) {
        throw ApiError.badRequest('Định dạng tệp không được hỗ trợ (chỉ nhận JPG, PNG, WEBP, GIF)');
      }

      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');

      // Giới hạn 5MB
      if (buffer.length > 5 * 1024 * 1024) {
        throw ApiError.badRequest('Dung lượng ảnh vượt quá giới hạn cho phép (tối đa 5MB)');
      }

      const uploadsDir = getUploadsDir();
      const safeExt = ext === 'svg+xml' ? 'svg' : ext;
      const fileId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const savedFileName = `menu_${fileId}.${safeExt}`;
      const filePath = path.join(uploadsDir, savedFileName);

      fs.writeFileSync(filePath, buffer);

      const imageUrl = `/uploads/${savedFileName}`;
      res.status(200).json({
        data: {
          imageUrl,
          fileName: fileName || savedFileName
        }
      });
    } catch (error) {
      next(error);
    }
  }
}
