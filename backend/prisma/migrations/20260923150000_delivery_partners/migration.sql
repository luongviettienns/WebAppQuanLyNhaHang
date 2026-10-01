CREATE TABLE DeliveryPartnerGroup (
  id INTEGER NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE INDEX DeliveryPartnerGroup_name_key(name)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE DeliveryPartner (
  id INTEGER NOT NULL AUTO_INCREMENT,
  code VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  phone VARCHAR(191) NULL,
  email VARCHAR(191) NULL,
  partnerType ENUM('INDIVIDUAL','COMPANY') NOT NULL DEFAULT 'INDIVIDUAL',
  address VARCHAR(255) NULL,
  province VARCHAR(100) NULL,
  district VARCHAR(100) NULL,
  ward VARCHAR(100) NULL,
  note VARCHAR(1000) NULL,
  groupId INTEGER NULL,
  isActive BOOLEAN NOT NULL DEFAULT true,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE INDEX DeliveryPartner_code_key(code),
  INDEX DeliveryPartner_name_idx(name),
  INDEX DeliveryPartner_isActive_idx(isActive),
  INDEX DeliveryPartner_groupId_idx(groupId),
  CONSTRAINT DeliveryPartner_groupId_fkey FOREIGN KEY(groupId) REFERENCES DeliveryPartnerGroup(id) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Order`
  MODIFY orderType ENUM('DINE_IN','TAKE_AWAY','DELIVERY') NOT NULL DEFAULT 'DINE_IN',
  ADD COLUMN deliveryPartnerId INTEGER NULL,
  ADD COLUMN deliveryAddress VARCHAR(255) NULL,
  ADD COLUMN deliveryFee INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN deliveryFeePaid INTEGER NOT NULL DEFAULT 0,
  ADD INDEX Order_deliveryPartnerId_status_idx(deliveryPartnerId, status),
  ADD CONSTRAINT Order_deliveryPartnerId_fkey FOREIGN KEY(deliveryPartnerId) REFERENCES DeliveryPartner(id) ON DELETE RESTRICT ON UPDATE CASCADE;
