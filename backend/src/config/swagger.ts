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
      { name: 'Reports & Analytics', description: 'Báo cáo doanh thu theo ngày & chỉ số KPI (Admin)' },
      { name: 'Inventory & BOM', description: 'Quản lý kho nguyên vật liệu, định lượng BOM món ăn & nhập/xuất Excel (Admin)' },
      { name: 'Audit Log', description: 'Nhật ký hoạt động hệ thống - theo dõi mọi thay đổi quan trọng (Admin)' }
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
                    password: { type: 'string', example: 'admin123' }
                  },
                  required: ['username', 'password']
                },
                examples: {
                  admin: {
                    summary: 'Admin (Quản lý)',
                    value: { username: 'admin', password: 'admin123' }
                  },
                  cashier: {
                    summary: 'Thu ngân',
                    value: { username: 'cashier', password: 'cashier123' }
                  },
                  kitchen: {
                    summary: 'Bếp (KDS)',
                    value: { username: 'kitchen', password: 'kitchen123' }
                  }
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
          summary: 'Lấy thông tin người dùng đang đăng nhập',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Thông tin user hiện tại' },
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
          parameters: [
            { name: 'date', in: 'query', required: false, schema: { type: 'string', format: 'date' }, example: '2026-09-17', description: 'Ngày cần xem báo cáo (mặc định: hôm nay)' }
          ],
          responses: {
            200: { description: 'Dữ liệu báo cáo tổng hợp' },
            403: { description: 'Chỉ Admin mới có quyền xem báo cáo' }
          }
        }
      },

      // ──────────────── INVENTORY & BOM ────────────────
      '/api/inventory/excel/template': {
        get: {
          tags: ['Inventory & BOM'],
          summary: 'Tải file Excel mẫu để nhập kho hàng loạt (Không cần đăng nhập)',
          description: 'Trả về file .xlsx chứa template nhập kho với đầy đủ hướng dẫn cột. Endpoint công khai, không yêu cầu xác thực.',
          responses: {
            200: {
              description: 'File Excel template',
              content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {} }
            }
          }
        }
      },
      '/api/inventory/ingredients': {
        get: {
          tags: ['Inventory & BOM'],
          summary: 'Danh sách nguyên vật liệu & tồn kho hiện tại (Quyền ADMIN)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'search', in: 'query', required: false, schema: { type: 'string' }, description: 'Tìm kiếm theo tên hoặc SKU' },
            { name: 'lowStockOnly', in: 'query', required: false, schema: { type: 'boolean' }, description: 'Chỉ hiện NVL sắp hết hàng' },
            { name: 'negativeStockOnly', in: 'query', required: false, schema: { type: 'boolean' }, description: 'Chỉ hiện NVL tồn kho âm (cảnh báo đỏ)' }
          ],
          responses: {
            200: {
              description: 'Danh sách NVL với tồn kho, đơn vị, giá vốn bình quân gia quyền',
              content: {
                'application/json': {
                  example: {
                    data: [
                      {
                        id: 1,
                        sku: 'ING-GA-DIEC',
                        name: 'Gà Điếc (Gà Nguyên Con)',
                        unit: 'kg',
                        stockQty: 12.5,
                        minStockQty: 5,
                        weightedAvgCost: 85000,
                        isLowStock: false,
                        isNegativeStock: false
                      }
                    ]
                  }
                }
              }
            }
          }
        },
        post: {
          tags: ['Inventory & BOM'],
          summary: 'Tạo nguyên vật liệu mới (Quyền ADMIN)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sku: { type: 'string', example: 'ING-MUOI-HAT' },
                    name: { type: 'string', example: 'Muối hạt' },
                    unit: { type: 'string', example: 'kg' },
                    minStockQty: { type: 'number', example: 1.0 }
                  },
                  required: ['sku', 'name', 'unit']
                }
              }
            }
          },
          responses: {
            201: { description: 'Tạo NVL thành công' },
            409: { description: 'SKU đã tồn tại' }
          }
        }
      },
      '/api/inventory/ingredients/{id}': {
        get: {
          tags: ['Inventory & BOM'],
          summary: 'Chi tiết nguyên vật liệu theo ID (Quyền ADMIN)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 1 }
          ],
          responses: {
            200: { description: 'Chi tiết NVL bao gồm lịch sử nhập kho' },
            404: { description: 'Không tìm thấy NVL' }
          }
        },
        patch: {
          tags: ['Inventory & BOM'],
          summary: 'Cập nhật thông tin nguyên vật liệu (Quyền ADMIN)',
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
                    name: { type: 'string', example: 'Gà Điếc Premium' },
                    unit: { type: 'string', example: 'kg' },
                    minStockQty: { type: 'number', example: 8.0 }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Cập nhật thành công' }
          }
        }
      },
      '/api/inventory/stock-in': {
        post: {
          tags: ['Inventory & BOM'],
          summary: 'Nhập kho thủ công — Cập nhật giá vốn bình quân gia quyền (Quyền ADMIN)',
          description: 'Nhập lô hàng mới. Hệ thống tự động tính lại giá vốn bình quân gia quyền theo công thức: (TồnCũ × GiáVốnCũ + SốLượngMới × GiáNhậpMới) / (TồnCũ + SốLượngMới). Nếu tồn kho đang âm, chỉ phần dương sau bù trừ mới được đưa vào công thức.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ingredientId: { type: 'integer', example: 1 },
                    qty: { type: 'number', example: 5.0, description: 'Số lượng nhập (kg, lít, cái...)' },
                    unitCost: { type: 'number', example: 85000, description: 'Giá nhập mỗi đơn vị (VND)' },
                    note: { type: 'string', example: 'Nhập hàng từ nhà cung cấp ABC' }
                  },
                  required: ['ingredientId', 'qty', 'unitCost']
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Nhập kho thành công, trả về tồn kho và giá vốn mới',
              content: {
                'application/json': {
                  example: {
                    data: {
                      stockQty: 17.5,
                      weightedAvgCost: 85000
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/inventory/excel/export': {
        get: {
          tags: ['Inventory & BOM'],
          summary: 'Xuất báo cáo tồn kho ra file Excel (Quyền ADMIN)',
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'File Excel báo cáo tồn kho hiện tại',
              content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {} }
            }
          }
        }
      },
      '/api/inventory/excel/preview': {
        post: {
          tags: ['Inventory & BOM'],
          summary: 'Preview dữ liệu nhập kho từ file Excel trước khi commit (Quyền ADMIN)',
          description: 'Upload file Excel nhập kho. Hệ thống parse và trả về danh sách hàng sẽ được nhập, lỗi nếu có, để người dùng xác nhận trước khi lưu thật.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    file: { type: 'string', format: 'binary', description: 'File Excel (.xlsx) theo đúng template' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Kết quả preview: hàng hợp lệ, hàng lỗi',
              content: {
                'application/json': {
                  example: {
                    data: {
                      validRows: [{ rowNumber: 2, sku: 'ING-GA-DIEC', qty: 5, unitCost: 85000 }],
                      errorRows: [],
                      totalValid: 1,
                      totalErrors: 0
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/inventory/excel/commit': {
        post: {
          tags: ['Inventory & BOM'],
          summary: 'Commit nhập kho hàng loạt từ file Excel (Quyền ADMIN)',
          description: 'Sau khi đã preview và xác nhận, gọi endpoint này để thực sự lưu dữ liệu nhập kho vào database. Dùng token sessionId nhận từ bước preview.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sessionId: { type: 'string', description: 'Session ID nhận từ /excel/preview', example: 'preview_abc123' }
                  },
                  required: ['sessionId']
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Nhập kho hàng loạt thành công',
              content: {
                'application/json': {
                  example: { data: { committed: 8, skipped: 0 } }
                }
              }
            }
          }
        }
      },
      '/api/inventory/recipes/{menuItemId}': {
        get: {
          tags: ['Inventory & BOM'],
          summary: 'Xem định lượng BOM của một món ăn (Quyền ADMIN)',
          description: 'Trả về danh sách nguyên vật liệu và định lượng tiêu hao cho mỗi suất của món ăn.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'menuItemId', in: 'path', required: true, schema: { type: 'integer' }, example: 1, description: 'ID của món ăn cần xem BOM' }
          ],
          responses: {
            200: {
              description: 'Danh sách nguyên liệu trong BOM + giá vốn ước tính mỗi suất',
              content: {
                'application/json': {
                  example: {
                    data: {
                      menuItemId: 1,
                      menuItemName: 'Gà Rán 2 Miếng',
                      estimatedCostPerServing: 32500,
                      ingredients: [
                        { ingredientId: 1, name: 'Gà Điếc', unit: 'kg', qtyPerServing: 0.3, unitCost: 85000, subtotal: 25500 },
                        { ingredientId: 5, name: 'Bột Chiên Giòn', unit: 'kg', qtyPerServing: 0.1, unitCost: 70000, subtotal: 7000 }
                      ]
                    }
                  }
                }
              }
            },
            404: { description: 'Không tìm thấy món ăn' }
          }
        },
        put: {
          tags: ['Inventory & BOM'],
          summary: 'Cập nhật định lượng BOM cho món ăn (Quyền ADMIN)',
          description: 'Thay thế toàn bộ BOM của món ăn. Gửi mảng rỗng để xoá hết định lượng.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'menuItemId', in: 'path', required: true, schema: { type: 'integer' }, example: 1 }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ingredients: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          ingredientId: { type: 'integer', example: 1 },
                          qtyPerServing: { type: 'number', example: 0.3, description: 'Định lượng tiêu hao mỗi suất' }
                        },
                        required: ['ingredientId', 'qtyPerServing']
                      },
                      example: [
                        { ingredientId: 1, qtyPerServing: 0.3 },
                        { ingredientId: 5, qtyPerServing: 0.1 }
                      ]
                    }
                  },
                  required: ['ingredients']
                }
              }
            }
          },
          responses: {
            200: { description: 'BOM cập nhật thành công' }
          }
        }
      },

      // ──────────────── AUDIT LOG ────────────────
      '/api/audit': {
        get: {
          tags: ['Audit Log'],
          summary: 'Lấy nhật ký hoạt động hệ thống (Quyền ADMIN)',
          description: 'Danh sách các sự kiện quan trọng: đăng nhập, thanh toán, sửa menu, nhập kho, sửa BOM... Có thể lọc theo danh mục, người thực hiện và thời gian.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 50 }, description: 'Số dòng tối đa mỗi trang' },
            { name: 'offset', in: 'query', required: false, schema: { type: 'integer', default: 0 }, description: 'Vị trí bắt đầu (phân trang)' },
            {
              name: 'category',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
                enum: ['auth', 'menu', 'order', 'payment', 'kds', 'inventory', 'system']
              },
              description: 'Lọc theo nhóm danh mục (auth=Đăng nhập, menu=Menu, order=Đơn hàng, payment=Thanh toán, kds=Bếp, inventory=Kho & BOM, system=Hệ thống)'
            },
            { name: 'userId', in: 'query', required: false, schema: { type: 'integer' }, description: 'Lọc theo ID người thực hiện' },
            { name: 'from', in: 'query', required: false, schema: { type: 'string', format: 'date-time' }, description: 'Thời điểm bắt đầu (ISO 8601)' },
            { name: 'to', in: 'query', required: false, schema: { type: 'string', format: 'date-time' }, description: 'Thời điểm kết thúc (ISO 8601)' }
          ],
          responses: {
            200: {
              description: 'Danh sách nhật ký có phân trang',
              content: {
                'application/json': {
                  example: {
                    data: {
                      logs: [
                        {
                          id: 42,
                          action: 'ORDER_PAID',
                          actorName: 'Thu Ngân - Lan',
                          targetDescription: 'Đơn #15 - Bàn 3',
                          details: 'Thanh toán 145.000đ bằng Tiền mặt',
                          createdAt: '2026-09-17T12:30:00.000Z'
                        }
                      ],
                      total: 128
                    }
                  }
                }
              }
            },
            403: { description: 'Chỉ Admin mới có quyền xem nhật ký' }
          }
        }
      }
    }
  },
  apis: []
};

export const swaggerSpec = swaggerJSDoc(options);
