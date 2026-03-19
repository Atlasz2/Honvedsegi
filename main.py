from sqlalchemy import create_engine, text

# SQLite adatbázis (file vagy :memory:)
engine = create_engine("sqlite:///data.db")

with engine.connect() as conn:
    result = conn.execute(text("SELECT * FROM szemelyek"))
    
    for row in result:
        print(f"Név: {row.nev}, Rendfokozat: {row.rendfokozat}, "
              f"Azonosító: {row.azonosito}, "
              f"Születési hely: {row.szuletesi_hely}, "
              f"Születési idő: {row.szuletesi_ido}")