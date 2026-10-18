import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field
from passlib.context import CryptContext
import jwt
import numpy as np
from sklearn.neural_network import MLPRegressor

from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

# Base Directory Resolution
BASE_DIR = Path(__file__).resolve().parent

# Secret key for JWT signing
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "ibm-linuxone-secure-secret-key-2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

# Database Connection (SQLite)
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'ibm_health.db'}")

engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Database User Model
class UserDB(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(50), nullable=False)
    last_name = Column(String(50), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

Base.metadata.create_all(bind=engine)

# Pydantic Schemas
class UserSignup(BaseModel):
    firstName: str
    lastName: str
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

# Machine Learning Model Setup
X_dummy = np.random.rand(100, 7)
y_dummy = np.random.rand(100, 2)
model = MLPRegressor(hidden_layer_sizes=(64, 32), max_iter=200, random_state=42)
model.fit(X_dummy, y_dummy)

# Initialize Single FastAPI App Instance
app = FastAPI(title="Fitness & Energy Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def print_server_url():
    print("\n" + "=" * 50)
    print("🚀 IBM LinuxONE Web App: http://<server-host>:8000/")
    print("📄 API Docs: http://<server-host>:8000/docs")
    print("=" * 50 + "\n")

# Helpers
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# --- API ENDPOINTS ---

@app.get("/api/health")
def health_check():
    return {"status": "online", "engine": "scikit-learn on IBM LinuxONE"}

@app.post("/api/auth/signup", status_code=status.HTTP_201_CREATED)
def signup(user: UserSignup, db: Session = Depends(get_db)):
    db_user = db.query(UserDB).filter(UserDB.email == user.email.lower()).first()
    if db_user:
        raise HTTPException(
            status_code=400, 
            detail="An account with this email address already exists."
        )

    hashed_pw = hash_password(user.password)
    new_user = UserDB(
        first_name=user.firstName,
        last_name=user.lastName,
        email=user.email.lower(),
        hashed_password=hashed_pw
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "User registered successfully"}

@app.post("/api/auth/login", response_model=TokenResponse)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.email == credentials.email.lower()).first()
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password."
        )

    access_token = create_access_token(
        data={"sub": user.email, "id": user.id},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "firstName": user.first_name
    }

@app.post("/api/predict-dashboard")
def predict_dashboard(data: UserInput):
    features = np.array([[
        data.calories_logged, data.carbs_g, data.protein_g, 
        data.fat_g, data.steps_today, data.mood_score, data.energy_score
    ]])
    
    prediction = model.predict(features)[0]
    fatigue_index = float(prediction[0] * 100)
    
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
            "recommendation": recommendation
        },
        "cognitive_fatigue_index": round(fatigue_index, 1)
    }

# --- PAGE ROUTES ---

@app.get("/")
def serve_root():
    return FileResponse(BASE_DIR / "index.html")

@app.get("/index.html")
def serve_index():
    return FileResponse(BASE_DIR / "index.html")

@app.get("/login.html")
def serve_login():
    return FileResponse(BASE_DIR / "login.html")

@app.get("/signup.html")
def serve_signup():
    return FileResponse(BASE_DIR / "signup.html")

@app.get("/forgot-password.html")
def serve_forgot_password():
    return FileResponse(BASE_DIR / "forgot-password.html")

@app.get("/reset-password.html")
def serve_reset_password():
    return FileResponse(BASE_DIR / "reset-password.html")

# --- STATIC ASSETS MOUNT ---
app.mount("/static", StaticFiles(directory=BASE_DIR), name="static")

@app.get("/{asset_path:path}")
def serve_frontend_asset(asset_path: str):
    asset = BASE_DIR / asset_path
    if asset.is_file() and asset.parent == BASE_DIR:
        return FileResponse(asset)
    raise HTTPException(status_code=404, detail="Not Found")
