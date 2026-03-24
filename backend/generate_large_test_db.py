from app.db import Base, engine, SessionLocal
from app.seed import reseed_large_test_database


def main() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        reseed_large_test_database(db)
    print("Large test database generated successfully.")


if __name__ == "__main__":
    main()
