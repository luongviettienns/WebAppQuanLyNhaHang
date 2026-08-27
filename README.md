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

### Buoc 1: Cai dat dependencies
```bash
npm install
```

### Buoc 2: Khoi chay Backend
```bash
npm run dev:backend
```

### Buoc 3: Khoi chay Frontend
```bash
npm run dev:frontend
```

---

## 5. Quy Chuan Git & Commit
Du an ap dung **Conventional Commits** voi noi dung mo ta bang **tieng Viet khong dau** de dam bao nhat quan va chuyen nghiep:
- `feat(scope): ...` (Tinh nang moi)
- `fix(scope): ...` (Sua loi)
- `test(scope): ...` (Kiem thu)
- `refactor(scope): ...` (Tai cau truc ma nguon)
- `docs(scope): ...` (Tai lieu, ke hoach)
- `chore(scope): ...` (Cau hinh, toolchain, moi truong)
