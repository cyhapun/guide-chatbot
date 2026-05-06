from dotenv import load_dotenv
from pathlib import Path
import sys
from sqlalchemy import text

# Load .env from project root (one level above backend/)
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    print(f"Warning: .env not found at {env_path}. Create .env or copy .env.example.")

try:
    # Import engine from existing db module
    from db import engine
except Exception as e:
    print("Failed to import db.engine:", e)
    sys.exit(1)


def main():
    try:
        with engine.connect() as conn:
            r = conn.execute(text("SELECT 1"))
            val = r.scalar()
            print("DB connection ok, SELECT 1 ->", val)
    except Exception as e:
        print("DB connection failed:", e)
        sys.exit(1)


if __name__ == '__main__':
    main()
