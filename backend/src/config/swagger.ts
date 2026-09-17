import swaggerJSDoc from 'swagger-jsdoc';

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CRISPY BITE - Restaurant Management API',
      version: '1.0.0',
      description:
        'Tài liệu & Công cụ Test API Hệ thống Quản lý & Đặt món Nhà hàng Fast Food Crispy Bite (QSR POS & KDS)',
      contact: {
        name: 'Crispy Bite Dev Team'
      }
    },
    servers: [
      {
        url: 'http://localhost:4000',
        description: 'Local Development Server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Nhập Token JWT nhận từ API POST /api/auth/login để xác thực'
        }
      }
    },
    tags: [
      { name: 'System & Health', description: 'Kiểm tra trạng thái hệ thống & thông tin mạng LAN' },
      { name: 'Authentication', description: 'Đăng nhập tài khoản & lấy thông tin người dùng' },
      { name: 'Menu & Modifiers', description: 'Quản lý thực đơn, danh mục, món ăn & báo hết hàng (86d)' },
      { name: 'Dining Tables', description: 'Sơ đồ bàn ăn, mã QR quét tại bàn & cập nhật trạng thái bàn' },
      { name: 'Orders & KDS', description: 'Tạo đơn hàng, theo dõi đơn bếp (KDS), chuyển trạng thái & thanh toán' },
      { name: 'Reports & Analytics', description: 'Báo cáo doanh thu theo ngày & chỉ số KPI (Admin)' }
    ],
    paths: {
      '/health': {
        get: {
          tags: ['System & Health'],
          summary: 'Kiểm tra trạng thái máy chủ (Health Check)',
          responses: {
            200: {
              description: 'Server đang hoạt động bình thường',
              content: {
                'application/json': {
                  example: { data: { status: 'ok' } }
                }
              }
            }
          }
        }
      },
      '/api/system/network-info': {
        get: {
          tags: ['System & Health'],
          summary: 'Lấy địa chỉ IP mạng nội bộ (LAN / Wi-Fi)',
          responses: {
            200: { description: 'Danh sách địa chỉ IP server' }
          }
        }
      },
      '/api/auth/login': {
        post: {
          tags: ['Authentication'],
          summary: 'Đăng nhập hệ thống (Admin, Cashier, Kitchen)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    username: { type: 'string', example: 'admin' },
                    password: { type: 'string', example: '123456' }
                  },
                  required: ['username', 'password']
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Đăng nhập thành công, trả về JWT Token và User Info',
              content: {
                'application/json': {
                  example: {
                    data: {
                      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                      user: { id: 1, username: 'admin', name: 'Quản Lý Nhà Hàng (Admin)', role: 'ADMIN' }
                    }
                  }
                }
              }
            },
            401: { description: 'Tài khoản hoặc mật khẩu không chính xác' }
          }
        }
      },
      '/api/auth/me': {
        get: {
          tags: ['Authentication'],
          summary: 'Lấy thông tin tài khoản đang đăng nhập',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Thông tin tài khoản hiện tại' },
            401: { description: 'Chưa đăng nhập hoặc Token không hợp lệ' }
          }
        }
      },
      '/api/menu': {
        get: {
          tags: ['Menu & Modifiers'],
          summary: 'Lấy toàn bộ thực đơn (Categories, MenuItems, Modifiers)',
          responses: {
            200: { description: 'Danh sách thực đơn đầy đủ' }
          }
        },
        post: {
          tags: ['Menu & Modifiers'],
          summary: 'Tạo món ăn mới (Yêu cầu quyền ADMIN)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    categoryId: { type: 'integer', example: 1 },
                    name: { type: 'string', example: 'Gà Sốt Phô Mai Cay Special' },
                    description: { type: 'string', example: 'Gà rán ngập tràn sốt phô mai' },
                    basePrice: { type: 'number', example: 79000 },
                    menuType: { type: 'string', example: 'FOOD' },
                    itemType: { type: 'string', example: 'REGULAR' }
                  },
                  required: ['categoryId', 'name', 'basePrice']
                }
              }
            }
          },
          responses: {
            201: { description: 'Tạo món ăn thành công' },
            403: { description: 'Không có quyền truy cập (Cần quyền ADMIN)' }
          }
        }
      },
      '/api/menu/{id}/sold-out': {
        patch: {
          tags: ['Menu & Modifiers'],
          summary: 'Đánh dấu hết món / mở lại món (86d) (Quyền KITCHEN, ADMIN)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 1 }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    isAvailable: { type: 'boolean', example: false }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Cập nhật trạng thái hết món thành công' }
          }
        }
      },
      '/api/tables': {
        get: {
          tags: ['Dining Tables'],
          summary: 'Lấy sơ đồ danh sách các bàn ăn (Quyền CASHIER, ADMIN)',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Danh sách bàn ăn và trạng thái' }
          }
        }
      },
      '/api/tables/qr/{token}': {
        get: {
          tags: ['Dining Tables'],
          summary: 'Lấy thông tin bàn ăn qua QR Token (Khách quét mã tại bàn)',
          parameters: [
            { name: 'token', in: 'path', required: true, schema: { type: 'string' }, example: 'qr_table_01' }
          ],
          responses: {
            200: { description: 'Thông tin bàn ăn ứng với mã QR' }
          }
        }
      },
      '/api/tables/{id}/status': {
        patch: {
          tags: ['Dining Tables'],
          summary: 'Cập nhật trạng thái bàn ăn (Quyền CASHIER, ADMIN)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 1 }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['AVAILABLE', 'OCCUPIED', 'CLEANING'], example: 'OCCUPIED' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Trạng thái bàn được cập nhật thành công' }
          }
        }
      },
      '/api/orders': {
        get: {
          tags: ['Orders & KDS'],
          summary: 'Lấy danh sách đơn hàng cho màn hình Bếp KDS (Quyền KITCHEN, ADMIN)',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Danh sách đơn hàng cần chế biến' }
          }
        },
        post: {
          tags: ['Orders & KDS'],
          summary: 'Tạo đơn hàng mới (Khách quét QR hoặc Thu ngân tại POS)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tableId: { type: 'integer', example: 1 },
                    orderType: { type: 'string', enum: ['DINE_IN', 'TAKEAWAY'], example: 'DINE_IN' },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          menuItemId: { type: 'integer', example: 1 },
                          quantity: { type: 'integer', example: 2 },
                          notes: { type: 'string', example: 'Không lấy tương ớt' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          responses: {
            201: { description: 'Đơn hàng được tạo thành công và phát tới Bếp qua WebSocket' }
          }
        }
      },
      '/api/orders/{id}/status': {
        patch: {
          tags: ['Orders & KDS'],
          summary: 'Cập nhật trạng thái chế biến của Bếp (Quyền KITCHEN, ADMIN)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 1 }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['PENDING', 'PREPARING', 'READY', 'COMPLETED'], example: 'PREPARING' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Trạng thái đơn hàng cập nhật thành công' }
          }
        }
      },
      '/api/orders/{id}/pay': {
        post: {
          tags: ['Orders & KDS'],
          summary: 'Thanh toán đơn hàng (Quyền CASHIER, ADMIN)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 1 }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    paymentMethod: { type: 'string', enum: ['CASH', 'BANK_TRANSFER', 'CARD'], example: 'CASH' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Thanh toán thành công' }
          }
        }
      },
      '/api/reports/daily': {
        get: {
          tags: ['Reports & Analytics'],
          summary: 'Báo cáo doanh thu & chỉ số KPI theo ngày (Quyền ADMIN)',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Dữ liệu báo cáo tổng hợp' },
            403: { description: 'Chỉ Admin mới có quyền xem báo cáo' }
          }
        }
      }
    }
  },
  apis: []
};

export const swaggerSpec = swaggerJSDoc(options);
