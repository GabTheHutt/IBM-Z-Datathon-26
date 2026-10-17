import hashlib
import hmac
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import jwt
import numpy as np
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import Column, DateTime, Integer, String, create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

try:  # scikit-learn can be awkward to install on s390x; don't let it stop the site
    from sklearn.neural_network import MLPRegressor
except Exception as exc:  # pragma: no cover
    MLPRegressor = None
    print(f"[warn] scikit-learn unavailable ({exc}); /api/predict-dashboard will use a simple fallback.")

BASE_DIR = Path(__file__).resolve().parent

# ---------------------------------------------------------------- config
def load_secret() -> str:
    env = os.getenv("JWT_SECRET_KEY")
    if env:
        return env
    secret_file = BASE_DIR / ".jwt_secret"
    if secret_file.exists():
        return secret_file.read_text().strip()
    secret = secrets.token_hex(32)
    secret_file.write_text(secret)
    os.chmod(secret_file, 0o600)
    return secret


SECRET_KEY = load_secret()
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24
PBKDF2_ROUNDS = 600_000

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'ibm_health.db'}")
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class UserDB(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(50), nullable=False)
    last_name = Column(String(50), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


Base.metadata.create_all(bind=engine)

# ---------------------------------------------------------------- schemas
class UserSignup(BaseModel):
    firstName: str = Field(min_length=1, max_length=50)
    lastName: str = Field(min_length=1, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=15)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    firstName: str


class UserInput(BaseModel):
    calories_logged: float
    carbs_g: float
    protein_g: float
    fat_g: float
    steps_today: int
    mood_score: int
    energy_score: int


# ---------------------------------------------------------------- ML model
model = None
if MLPRegressor is not None:
    rng = np.random.RandomState(42)
    model = MLPRegressor(hidden_layer_sizes=(64, 32), max_iter=200, random_state=42)
    model.fit(rng.rand(100, 7), rng.rand(100, 2))


# ---------------------------------------------------------------- app
@asynccontextmanager
async def lifespan(_: FastAPI):
    print("\n" + "=" * 50)
    print("IBM LinuxONE Web App: http://<server-host>:8000/")
    print("API docs:             http://<server-host>:8000/docs")
    print("=" * 50 + "\n")
    yield


app = FastAPI(title="Fitness & Energy Tracker API", lifespan=lifespan)
bearer = HTTPBearer(auto_error=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Password hashing uses only the standard library (no bcrypt/passlib build problems on s390x).
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ROUNDS)
    return f"pbkdf2${PBKDF2_ROUNDS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, rounds, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(rounds))
        return hmac.compare_digest(digest.hex(), digest_hex)
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=15))
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: Session = Depends(get_db),
) -> UserDB:
    unauthorised = HTTPException(status_code=401, detail="Please log in again.")
    if creds is None:
        raise unauthorised
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        raise unauthorised
    user = db.query(UserDB).filter(UserDB.email == payload.get("sub")).first()
    if user is None:
        raise unauthorised
    return user


# ---------------------------------------------------------------- API
@app.get("/api/health")
def health_check():
    return {"status": "online", "ml_model": model is not None}


@app.post("/api/auth/signup", status_code=status.HTTP_201_CREATED)
def signup(user: UserSignup, db: Session = Depends(get_db)):
    email = user.email.lower()
    if db.query(UserDB).filter(UserDB.email == email).first():
        raise HTTPException(status_code=400, detail="An account with this email address already exists.")
    db.add(
        UserDB(
            first_name=user.firstName.strip(),
            last_name=user.lastName.strip(),
            email=email,
            hashed_password=hash_password(user.password),
        )
    )
    db.commit()
    return {"message": "User registered successfully"}


@app.post("/api/auth/login", response_model=TokenResponse)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.email == credentials.email.lower()).first()
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="The email or password is incorrect.")
    token = create_access_token(
        {"sub": user.email, "id": user.id},
        timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": token, "token_type": "bearer", "firstName": user.first_name}


@app.get("/api/auth/me")
def me(user: UserDB = Depends(current_user)):
    return {"firstName": user.first_name, "lastName": user.last_name, "email": user.email}


@app.post("/api/predict-dashboard")
def predict_dashboard(data: UserInput, user: UserDB = Depends(current_user)):
    if model is not None:
        features = np.array([[
            data.calories_logged, data.carbs_g, data.protein_g,
            data.fat_g, data.steps_today, data.mood_score, data.energy_score,
        ]])
        fatigue_index = float(model.predict(features)[0][0] * 100)
    else:
        fatigue_index = max(0.0, min(100.0, 100 - data.energy_score * 10))

    protein_deficit = 140 - data.protein_g
    if protein_deficit > 20:
        recommendation = f"Increase protein intake by {int(protein_deficit)}g to prevent cognitive fatigue."
    else:
        recommendation = "Your macros are well balanced for today's load!"

    return {
        "calories": {"current": data.calories_logged, "goal": 2200},
        "macros": {
            "carbs": {"current": data.carbs_g, "target": 220},
            "protein": {"current": data.protein_g, "target": 140},
            "fat": {"current": data.fat_g, "target": 60},
            "recommendation": recommendation,
        },
        "cognitive_fatigue_index": round(fatigue_index, 1),
    }


# ---------------------------------------------------------------- front-end files
# Only these file types are ever served, so ibm_health.db, main.py, .jwt_secret etc. stay private.
PUBLIC_SUFFIXES = {".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp", ".woff2"}


@app.get("/")
def serve_root():
    return FileResponse(BASE_DIR / "index.html")


@app.get("/{asset_path:path}")
def serve_frontend_asset(asset_path: str):
    asset = (BASE_DIR / asset_path).resolve()
    if asset.is_file() and asset.parent == BASE_DIR and asset.suffix.lower() in PUBLIC_SUFFIXES:
        return FileResponse(asset)
    raise HTTPException(status_code=404, detail="Not Found")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))