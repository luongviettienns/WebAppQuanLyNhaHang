# CRISPY BITE - Fast Food Management & Ordering System

> **He Thong Da Nen Tang Dat Mon & Quan Ly Nha Hang Fast Food (Full-Stack QSR)**  
> Kien truc: Client-Server thoi gian thuc voi React Native (Expo SDK 54) + Node.js (Express + Prisma + MySQL + Socket.io).

---

## 1. Tong Quan Cong Nghe (Tech Stack)

- **Frontend**: React Native (Expo SDK 54), TypeScript, React Navigation, Axios, Socket.io Client.
- **Backend**: Node.js, Express, TypeScript, Prisma ORM, Socket.io, JSON Web Token (JWT).
- **Database**: MySQL 8.4 (chia tach ro rang giua `crispy_bite_dev` va `crispy_bite_test`).
- **Real-time Engine**: Socket.io Rooms (`restaurant:kds`) dong bo tuc thi giua POS quầy va KDS bếp.
- **Testing**: Vitest, Supertest, Jest, React Native Testing Library, Playwright.

---

## 2. Yeu Cau Moi Truong (Prerequisites)

He thong khoa chat phien ban moi truong de dam bao tinh nhat quan tren moi may phat trien:
- **Node.js**: `v24.19.0` (xem `.nvmrc`)
- **npm**: `11.17.0` (xem `package.json` engines va `.npmrc`)
- **MySQL Server**: `8.4` (hoac Docker Desktop)

---

## 3. Cau Truc Monorepo Workspaces

```text
WebAppQuanLyNhaHang/
├── backend/                  # REST API server, Prisma models, Socket gateway
│   ├── prisma/               # schema.prisma, migrations, seed script
│   └── src/                  # Controllers, services, routes, middlewares
├── frontend/                 # React Native / Expo application
│   └── src/                  # POS screen, KDS screen, Admin dashboard
├── docs/                     # Tai lieu dac ta kien truc & hop dong ky thuat
├── .gitignore                # Loai bo secrets, dependencies va cache
├── .nvmrc                    # Khoa version Node 24.19.0
├── .npmrc                    # engine-strict=true
└── package.json              # Workspaces root
```

---

## 4. Huong Dan Cai Dat & Chay Local (Getting Started)

### Buoc 1: Cau hinh Database MySQL (Native hoac Docker)
- Copy file `.env.example` thanh `.env` va dien thong tin ket noi MySQL.
- Tao 2 database `crispy_bite_dev` va `crispy_bite_test`.
- Chay script kiem tra ket noi database:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify-database.ps1
```
*(Neu dung Docker Desktop, chay `docker compose up -d`)*

### Buoc 2: Cai dat dependencies
```bash
npm install
```

### Buoc 3: Khoi chay Backend
```bash
npm run dev:backend
```

### Buoc 4: Khoi chay Frontend
```bash
npm run dev:frontend
```

---

### Buoc 5: Dat lai du lieu mau ban dau (Reset Database)
Khi can reset database ve trang thai seed chuan:
```bash
npm run db:reset
```

---

## 5. Tai Khoan Dang Nhap Mau (Default Seed Accounts)

Tat ca tai khoan mac dinh co mat khau la: `123456`

| Vai tro (Role) | Ten dang nhap (Username) | Mat khau (Password) | Pham vi truy cap (Access Scope) |
| :--- | :--- | :--- | :--- |
| **Thu ngan (CASHIER)** | `cashier` | `123456` | POS dat mon, So do ban an, Hoa don |
| **Nha bep (KITCHEN)** | `kitchen` | `123456` | KDS bep Dark Mode, Bao het mon (86'd), Prep Timer |
| **Quan tri (ADMIN)** | `admin` | `123456` | Toan quyen: Menu, Void huy don, Bao cao KPI & SOS |

*(Tren giao dien Web Login co thanh Demo Bar 1-cham giup chuyen doi tai khoan tuc thi)*

---

## 6. Kich Ban Demo Hai Thiet Bi Real-Time (Two-Device Live Demo)

1. **Cua so 1 (Thu ngan POS)**:
   - Mo trinh duyet o che do Desktop (hoac Tablet), dang nhap tai khoan `cashier`.
   - Vao tab **POS**, chon mon **Combo Ga Gion**, chon Size L va Vi Cay (bat buoc).
   - Bam **Tao don hang**, chon hinh thuc **Tai ban (Dine-in)** va chon **Ban 01**.
   - Don hang duoc tao va hien thi **Hoa don dien tu**.

2. **Cua so 2 (Nha bep KDS)**:
   - Mo trinh duyet song song (tab an danh hoac thiet bi khac), dang nhap tai khoan `kitchen`.
   - Giao dien KDS tu dong nhan don hang moi tu Bàn 01 qua **WebSocket real-time** ma khong can tai lai trang.
   - Thoi gian cho chuyen tu Xanh sang Vang va Do theo thoi gian chuan bi thuc te.
   - Nhan vien bep bam **Che bien (PREPARING)** $\rightarrow$ **San sang (READY)**.
   - Trạng thai tuc thi duoc dong bo nguoc ve POS va Live Tracker cua khach tai ban.

3. **Quan ly Menu & Bao cao (Admin)**:
   - Dang nhap `admin` $\rightarrow$ vao **Quan ly Menu** de bat/tat trang thai het mon (86'd).
   - Vao **Bao cao Doanh thu** de xem doanh thu thuan, bieu do don hang, SOS va xuat hoa don PDF.

---

## 7. Chay Kiem Thu Tu Dong (Automated Test Suites)

```bash
# 1. Chay toan bo Unit & Integration tests
npm run test

# 2. Kiem tra tinh hop le TypeScript (0 loi)
npm run typecheck

# 3. Kiem tra quy chuan Expo SDK 54 (18/18 checks pass)
npm run doctor

# 4. Kiem tra tieu chuan lint ESLint
npm run lint

# 5. Chay kiem thu E2E Playwright tren ca Desktop va Mobile Viewport
npm run test:e2e

# 6. Kiem tra chat luong tong hop truoc khi release
npm run check:all
```

---

## 8. Quy Chuan Git & Commit
Du an ap dung **Conventional Commits** voi noi dung mo ta bang **tieng Viet khong dau** de dam bao nhat quan va chuyen nghiep:
- `feat(scope): ...` (Tinh nang moi)
- `fix(scope): ...` (Sua loi)
- `test(scope): ...` (Kiem thu)
- `refactor(scope): ...` (Tai cau truc ma nguon)
- `docs(scope): ...` (Tai lieu, ke hoach)
- `chore(scope): ...` (Cau hinh, toolchain, moi truong)

## 9. Quy uoc giao dien Crispy Bite

- Theme mac dinh: Login/khach, thu ngan (POS) va quan tri dung light; vai tro bep (`KITCHEN`) dung dark. Lua chon thu cong duoc luu rieng theo vai tro va khoi phuc khi tai lai. Tab bep trong tai khoan admin van theo theme cua admin.
- Layout: mobile duoi 768px dung navigation duoi; tablet 768–1199px dung navigation tren; desktop tu 1200px dung thanh dieu huong ben trai. POS co gio hang ben phai tu 900px; KDS tablet cuon ngang ba lane, mobile loc theo trang thai. Viewport QA: Login 390×844/1440×900; POS 1024×768/1440×900; KDS ca ba; QR 390×844; Admin 1440×900.
- Font Barlow Condensed dung cho wordmark, ma don, so ban va tieu de; Inter dung cho noi dung va thao tac. Font duoc bundle qua Expo. Ung dung cho tai font xong, hoac hien thi bang font he thong neu tai font loi; E2E co kiem tra dang nhap khi chan request font.
- `frontend/src/ui` chi chua trinh bay va hanh vi giao dien dung chung. Du lieu, business state, API/socket va callback nghiep vu o feature/context. Giu nguyen `testID` khi thay bo cuc. Mau/radius/typography lay tu token, nhan dung sentence case, thao tac toi thieu 44px (POS/KDS chinh 52px).
- KDS hien thi trang thai **dong bo ticket qua REST**; context hien tai chua cung cap trang thai ket noi socket. Bieu tuong QR chuyen khoan chi la minh hoa; khach can lien he nhan vien de xac nhan thong tin thanh toan. API chua tra ten snapshot mon thi giao dien hien `Món #id` thay cho dong trong. Bao cao chi truc quan hoa tong hop ngay va xep hang mon vi API chua co chuoi thoi gian.

Khi chay unit/integration tu mot launcher co nap `.env`, phai gan ro `NODE_ENV=test` **truoc khi khoi dong Vitest**. Xac minh `TEST_DATABASE_URL` tro den database ket thuc bang `_test`, khac database phat trien; cac test co thao tac reset du lieu. E2E can build moi ca frontend/backend va dung server rieng tro den database `_test`. Khong tai su dung cong dang phuc vu du lieu phat trien. E2E server can `NODE_ENV=production` de phuc vu `frontend/dist`; gan ca `DATABASE_URL` va `TEST_DATABASE_URL` ve database `_test` da xac minh truoc khi khoi dong.
