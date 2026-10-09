-- MySQL 8.0.16+ (รองรับ CHECK) · เวลาเก็บเป็น UTC ทั้งหมด

CREATE TABLE users (
  id            CHAR(36) NOT NULL PRIMARY KEY,
  line_user_id  VARCHAR(64) NOT NULL UNIQUE,
  display_name  VARCHAR(255) NOT NULL,
  picture_url   VARCHAR(1024) NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- กลุ่ม/ห้องแชตที่ bot อยู่
CREATE TABLE line_groups (
  id             CHAR(36) NOT NULL PRIMARY KEY,
  line_group_id  VARCHAR(64) NOT NULL UNIQUE,
  type           ENUM('group','room') NOT NULL DEFAULT 'group',
  name           VARCHAR(255) NULL,
  picture_url    VARCHAR(1024) NULL,
  bot_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- แคชผลการตรวจสมาชิกกลุ่มผ่าน Messaging API
CREATE TABLE group_members (
  group_id     CHAR(36) NOT NULL,
  user_id      CHAR(36) NOT NULL,
  verified_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  left_at      DATETIME(3) NULL,
  PRIMARY KEY (group_id, user_id),
  KEY group_members_user_idx (user_id),
  CONSTRAINT gm_group_fk FOREIGN KEY (group_id) REFERENCES line_groups(id) ON DELETE CASCADE,
  CONSTRAINT gm_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE polls (
  id                  CHAR(36) NOT NULL PRIMARY KEY,
  group_id            CHAR(36) NULL,
  creator_id          CHAR(36) NOT NULL,
  title               VARCHAR(200) NOT NULL,
  description         TEXT NULL,
  -- single: เลือก 1 ข้อ | multiple: หลายข้อ | battle: A vs B | rating: ให้คะแนน 1-5 | yesno: ใช่/ไม่ใช่/งดออกเสียง
  kind                ENUM('single','multiple','battle','rating','yesno') NOT NULL,
  -- group: เฉพาะสมาชิกกลุ่ม | link: ทุกคนที่มีลิงก์ | public: แสดงในหน้าสาธารณะด้วย
  audience            ENUM('group','link','public') NOT NULL,
  anonymous           BOOLEAN NOT NULL DEFAULT FALSE,
  allow_change        BOOLEAN NOT NULL DEFAULT TRUE,
  -- live: เห็นผลตลอด | after_vote: เห็นหลังโหวตแล้ว | after_close: เห็นเมื่อปิดโหวต
  results_visibility  ENUM('live','after_vote','after_close') NOT NULL DEFAULT 'live',
  max_choices         INT NOT NULL DEFAULT 1,
  closes_at           DATETIME(3) NULL,
  closed_at           DATETIME(3) NULL,
  announce            BOOLEAN NOT NULL DEFAULT TRUE,
  remind_minutes      INT NULL,
  reminded_at         DATETIME(3) NULL,
  announced_result_at DATETIME(3) NULL,
  created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY polls_group_idx (group_id, created_at),
  KEY polls_audience_idx (audience, created_at),
  KEY polls_creator_idx (creator_id, created_at),
  KEY polls_due_idx (closed_at, closes_at),
  CONSTRAINT polls_group_fk FOREIGN KEY (group_id) REFERENCES line_groups(id) ON DELETE SET NULL,
  CONSTRAINT polls_creator_fk FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT polls_max_choices_chk CHECK (max_choices >= 1),
  CONSTRAINT polls_remind_chk CHECK (remind_minutes IS NULL OR remind_minutes > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE poll_options (
  id        CHAR(36) NOT NULL PRIMARY KEY,
  poll_id   CHAR(36) NOT NULL,
  label     VARCHAR(120) NOT NULL,
  emoji     VARCHAR(16) NULL,
  position  INT NOT NULL,
  UNIQUE KEY poll_options_pos_uq (poll_id, position),
  CONSTRAINT po_poll_fk FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1 แถว = 1 ตัวเลือกที่ผู้ใช้เลือก (multiple มีได้หลายแถวต่อคน)
CREATE TABLE votes (
  poll_id     CHAR(36) NOT NULL,
  user_id     CHAR(36) NOT NULL,
  option_id   CHAR(36) NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (poll_id, user_id, option_id),
  KEY votes_option_idx (option_id),
  KEY votes_user_idx (user_id, created_at),
  CONSTRAINT votes_poll_fk FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
  CONSTRAINT votes_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT votes_option_fk FOREIGN KEY (option_id) REFERENCES poll_options(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
