-- Vote my life: ให้คะแนนชีวิตรายวัน (1 บัญชีมีได้หลายโปรไฟล์ เช่น สมาชิกในครอบครัว)

CREATE TABLE life_profiles (
  id            CHAR(36) NOT NULL PRIMARY KEY,
  owner_id      CHAR(36) NOT NULL,
  name          VARCHAR(40) NOT NULL,
  birth_date    DATE NOT NULL,
  target_years  INT NOT NULL DEFAULT 100,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY life_profiles_owner_idx (owner_id, created_at),
  CONSTRAINT lp_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT lp_target_chk CHECK (target_years BETWEEN 30 AND 120)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1 แถว = คะแนนของ 1 วัน (score 1 แย่มาก ... 5 ดีมาก)
CREATE TABLE life_votes (
  profile_id  CHAR(36) NOT NULL,
  day         DATE NOT NULL,
  score       TINYINT NOT NULL,
  note        VARCHAR(500) NULL,
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (profile_id, day),
  CONSTRAINT lv_profile_fk FOREIGN KEY (profile_id) REFERENCES life_profiles(id) ON DELETE CASCADE,
  CONSTRAINT lv_score_chk CHECK (score BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- แจ้งเตือนรายวันผ่านบอท LINE (เวลาไทย) ข้ามถ้าวันนี้ vote แล้ว
ALTER TABLE users
  ADD COLUMN life_remind_on   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN life_remind_time CHAR(5) NOT NULL DEFAULT '20:00',
  ADD COLUMN life_reminded_on DATE NULL;
