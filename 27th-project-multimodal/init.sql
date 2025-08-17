PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS menu (
  menu_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT UNIQUE NOT NULL,
  std_name    TEXT NOT NULL,
  category    TEXT,
  cuisine     TEXT,
  std_name_norm TEXT
);

CREATE TABLE IF NOT EXISTS menu_synonym (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_id    INTEGER NOT NULL REFERENCES menu(menu_id) ON DELETE CASCADE,
  synonym    TEXT NOT NULL,
  lang       TEXT DEFAULT 'ko',
  synonym_norm TEXT
);

CREATE TABLE IF NOT EXISTS allergen (
  allergen_code TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_allergen (
  menu_id INTEGER NOT NULL REFERENCES menu(menu_id) ON DELETE CASCADE,
  allergen_code TEXT NOT NULL REFERENCES allergen(allergen_code) ON DELETE CASCADE,
  PRIMARY KEY (menu_id, allergen_code)
);

CREATE TABLE IF NOT EXISTS nutrition (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_id     INTEGER NOT NULL REFERENCES menu(menu_id) ON DELETE CASCADE,
  portion_g   REAL,
  kcal        REAL,
  carb_g      REAL,
  protein_g   REAL,
  fat_g       REAL,
  sugars_g    REAL,
  sodium_mg   REAL,
  saturated_fat_g REAL,
  trans_fat_g REAL,
  fiber_g     REAL,
  source      TEXT,
  source_version TEXT
);

CREATE INDEX IF NOT EXISTS idx_menu_std_name_norm ON menu(std_name_norm);
CREATE INDEX IF NOT EXISTS idx_synonym_norm ON menu_synonym(synonym_norm);