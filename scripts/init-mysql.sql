-- scripts/init-mysql.sql
CREATE DATABASE IF NOT EXISTS `crispy_bite_dev` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `crispy_bite_test` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON `crispy_bite_dev`.* TO 'crispy_bite'@'%';
GRANT ALL PRIVILEGES ON `crispy_bite_test`.* TO 'crispy_bite'@'%';
FLUSH PRIVILEGES;
