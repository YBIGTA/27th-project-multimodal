import sqlite3, os, re, pandas as pd, json

BASE = os.path.dirname(os.path.dirname(__file__))
DB_PATH = os.path.join(BASE, "data", "menu.db")
INIT_SQL = os.path.join(BASE, "init.sql")
CLASS_CSV = os.path.join(BASE, "seed", "class_list.csv")
SYN_CSV = os.path.join(BASE, "seed", "menu_synonyms.csv")
NUT_CSV = os.path.join(BASE, "seed", "nutrition.csv")
ALLERGENS_CSV = os.path.join(BASE, "seed", "allergens.csv")
CONF_ALLERGEN_MAP_JSON = os.path.join(BASE, "seed", "allergen_map.json")

def norm(s: str) -> str:
    if s is None: return ""
    import re
    return re.sub(r"[\s\-_/]+", "", s).lower()

def main():
    os.makedirs(os.path.join(BASE, "data"), exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(open(INIT_SQL, "r", encoding="utf-8").read())

        # menu
        df_menu = pd.read_csv(CLASS_CSV)
        for _, r in df_menu.iterrows():
            conn.execute(
                "INSERT OR IGNORE INTO menu (slug, std_name, category, cuisine, std_name_norm) VALUES (?,?,?,?,?)",
                (r["slug"], r["display_korean"], r.get("category"), r.get("cuisine"), norm(r["display_korean"]))
            )

        # synonyms
        df_syn = pd.read_csv(SYN_CSV)
        for _, r in df_syn.iterrows():
            menu_id = conn.execute("SELECT menu_id FROM menu WHERE slug = ?", (r["slug"],)).fetchone()
            if not menu_id:
                continue
            conn.execute(
                "INSERT INTO menu_synonym (menu_id, synonym, lang, synonym_norm) VALUES (?,?,?,?)",
                (menu_id[0], r["synonym"], r.get("lang","ko"), norm(r["synonym"]))
            )

        # allergens master
        df_all = pd.read_csv(ALLERGENS_CSV)
        for _, r in df_all.iterrows():
            conn.execute(
                "INSERT OR IGNORE INTO allergen (allergen_code, display_name) VALUES (?,?)",
                (r["allergen_code"], r["display_name"])
            )

        # allergen mapping
        amap = json.load(open(CONF_ALLERGEN_MAP_JSON, "r", encoding="utf-8"))
        for slug, codes in amap.items():
            mid = conn.execute("SELECT menu_id FROM menu WHERE slug = ?", (slug,)).fetchone()
            if not mid:
                continue
            for code in codes:
                conn.execute(
                    "INSERT OR IGNORE INTO menu_allergen (menu_id, allergen_code) VALUES (?,?)",
                    (mid[0], code)
                )

        # nutrition
        df_nut = pd.read_csv(NUT_CSV)
        for _, r in df_nut.iterrows():
            mid = conn.execute("SELECT menu_id FROM menu WHERE slug = ?", (r["slug"],)).fetchone()
            if not mid:
                continue
            conn.execute(
                """INSERT INTO nutrition
                   (menu_id, portion_g, kcal, carb_g, protein_g, fat_g, sugars_g, sodium_mg, saturated_fat_g, trans_fat_g, fiber_g, source, source_version)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (mid[0], r["portion_g"], r["kcal"], r["carb_g"], r["protein_g"], r["fat_g"], r["sugars_g"],
                 r["sodium_mg"], r["saturated_fat_g"], r["trans_fat_g"], r["fiber_g"], r["source"], r["source_version"])
            )

        conn.commit()
    print("✅ Loaded seed data into", DB_PATH)

if __name__ == "__main__":
    main()