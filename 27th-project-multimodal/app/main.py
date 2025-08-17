from fastapi import FastAPI, UploadFile, File, Query
from fastapi.responses import JSONResponse
import sqlite3, os, re

BASE = os.path.dirname(os.path.dirname(__file__))
DB_PATH = os.path.join(BASE, "data", "menu.db")

app = FastAPI(title="Menu Recognition Kickoff Demo", version="0.1.0")

def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    return conn

def norm(s: str) -> str:
    if s is None: return ""
    return re.sub(r"[\s\-_/]+", "", s).lower()

@app.get("/health")
def health():
    ok = os.path.exists(DB_PATH)
    return {"ok": ok, "db": DB_PATH}

@app.get("/v1/menu/{menu_id}")
def get_menu(menu_id: int):
    conn = get_conn()
    q = """
    SELECT m.menu_id, m.std_name, m.slug,
           n.portion_g, n.kcal, n.carb_g, n.protein_g, n.fat_g,
           GROUP_CONCAT(ma.allergen_code) as allergens
    FROM menu m
    LEFT JOIN nutrition n ON m.menu_id = n.menu_id
    LEFT JOIN menu_allergen ma ON m.menu_id = ma.menu_id
    WHERE m.menu_id = ?
    GROUP BY m.menu_id
    """
    row = conn.execute(q, (menu_id,)).fetchone()
    if not row:
        return JSONResponse(status_code=404, content={"code":"NOT_FOUND","message":"Menu not found"})
    allergens = row[8].split(",") if row[8] else []
    return {
        "menu_id": row[0],
        "name": row[1],
        "slug": row[2],
        "portion_g": row[3],
        "kcal": row[4],
        "carb_g": row[5],
        "protein_g": row[6],
        "fat_g": row[7],
        "allergens": allergens
    }

@app.get("/v1/menu/search")
def search_menu(query: str = Query(..., description="메뉴/동의어 검색어")):
    conn = get_conn()
    qn = norm(query)
    sql = """
    SELECT DISTINCT m.menu_id, m.std_name, m.slug
    FROM menu m
    LEFT JOIN menu_synonym s ON m.menu_id = s.menu_id
    WHERE m.std_name_norm LIKE ?
       OR s.synonym_norm LIKE ?
    LIMIT 20
    """
    like = f"%{qn}%"
    rows = conn.execute(sql, (like, like)).fetchall()
    return {"query": query, "results": [{"menu_id": r[0], "name": r[1], "slug": r[2]} for r in rows]}

@app.post("/v1/recognize")
async def recognize_menu(image: UploadFile = File(...)):
    # 목업: 모델 연동 전, 샘플 후보 반환
    mock = [
        {"slug": "bulgogi_deopbap", "score": 0.83},
        {"slug": "jeyuk_bokkeum", "score": 0.12},
        {"slug": "bibimbap", "score": 0.05}
    ]
    conn = get_conn()
    results = []
    for c in mock:
        row = conn.execute("SELECT menu_id, std_name FROM menu WHERE slug = ?", (c["slug"],)).fetchone()
        if row:
            results.append({"menu_id": row[0], "name": row[1], "slug": c["slug"], "score": c["score"]})
    return {"candidates": results}