from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timedelta
import jwt
import hashlib
import catboost
import pandas as pd
import numpy as np

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'health_surveillance')]

# Load CatBoost model
try:
    model_path = ROOT_DIR / 'outbreak_predictor.cbm'
    if model_path.exists():
        model = catboost.CatBoostClassifier()
        model.load_model(str(model_path))
        logger = logging.getLogger(__name__)
        logger.info("CatBoost model loaded successfully")
    else:
        # Create a mock model for demonstration if file doesn't exist
        model = None
        logger = logging.getLogger(__name__)
        logger.warning("CatBoost model file not found. Using mock predictions.")
except Exception as e:
    model = None
    logger = logging.getLogger(__name__)
    logger.error(f"Error loading CatBoost model: {e}")

# Create the main app without a prefix
app = FastAPI(title="Smart Health Surveillance API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer()
SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-here')

# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    message: str

class PredictionRequest(BaseModel):
    # Categorical features
    Location: str
    Source_Type: str
    
    # Numeric features
    NH4: float
    BSK5: float
    Suspended: float
    O2: float
    NO3: float
    NO2: float
    SO4: float
    PO4: float
    CL: float
    pH: float
    Turbidity: float
    Temperature: float
    Year: int
    Month: int
    Day: int

class PredictionResponse(BaseModel):
    prediction: int
    confidence: Optional[float] = None
    risk_level: str
    message: str

class NotificationRequest(BaseModel):
    location: str
    risk_level: str
    message: str

# Helper functions
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=24)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm="HS256")
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return username
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, hashed_password: str) -> bool:
    return hash_password(password) == hashed_password

# Routes
@api_router.get("/")
async def root():
    return {"message": "Smart Health Surveillance API", "status": "active"}

@api_router.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    # Simple authentication - in production, use proper user database
    # For demo purposes, accepting any username with password "health123"
    if request.password == "health123":
        access_token_expires = timedelta(hours=24)
        access_token = create_access_token(
            data={"sub": request.username}, expires_delta=access_token_expires
        )
        return LoginResponse(
            access_token=access_token,
            message=f"Welcome {request.username}! Login successful."
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

@api_router.post("/predict", response_model=PredictionResponse)
async def predict_outbreak(request: PredictionRequest, username: str = Depends(verify_token)):
    try:
        # Prepare data for prediction
        data = {
            'Location': request.Location,
            'Source_Type': request.Source_Type,
            'NH4': request.NH4,
            'BSK5': request.BSK5,
            'Suspended': request.Suspended,
            'O2': request.O2,
            'NO3': request.NO3,
            'NO2': request.NO2,
            'SO4': request.SO4,
            'PO4': request.PO4,
            'CL': request.CL,
            'pH': request.pH,
            'Turbidity': request.Turbidity,
            'Temperature': request.Temperature,
            'Year': request.Year,
            'Month': request.Month,
            'Day': request.Day
        }
        
        if model is not None:
            # Create DataFrame for prediction
            df = pd.DataFrame([data])
            
            # Make prediction
            prediction = model.predict(df)[0]
            prediction_proba = model.predict_proba(df)[0]
            confidence = float(max(prediction_proba))
        else:
            # Mock prediction based on some simple rules for demonstration
            # High risk if pH is very low/high, high turbidity, or low oxygen
            risk_factors = 0
            if request.pH < 6.5 or request.pH > 8.5:
                risk_factors += 1
            if request.Turbidity > 10:
                risk_factors += 1
            if request.O2 < 5:
                risk_factors += 1
            if request.NH4 > 2:
                risk_factors += 1
                
            prediction = 1 if risk_factors >= 2 else 0
            confidence = 0.85 if risk_factors >= 2 else 0.75
        
        # Determine risk level and message
        if prediction == 1:
            risk_level = "HIGH"
            message = "⚠️ High Risk of Water-Borne Outbreak detected in this area. Stay cautious!"
        else:
            risk_level = "LOW"
            message = "✅ Water quality parameters appear normal. Low outbreak risk detected."
        
        # Store prediction in database
        prediction_record = {
            "id": str(uuid.uuid4()),
            "username": username,
            "location": request.Location,
            "source_type": request.Source_Type,
            "prediction": int(prediction),
            "confidence": confidence,
            "risk_level": risk_level,
            "timestamp": datetime.utcnow(),
            "water_parameters": data
        }
        await db.predictions.insert_one(prediction_record)
        
        return PredictionResponse(
            prediction=int(prediction),
            confidence=confidence,
            risk_level=risk_level,
            message=message
        )
        
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Prediction failed: {str(e)}"
        )

@api_router.post("/notify")
async def trigger_notification(request: NotificationRequest, username: str = Depends(verify_token)):
    """Endpoint to trigger notifications for high-risk areas"""
    try:
        # Store notification record
        notification_record = {
            "id": str(uuid.uuid4()),
            "location": request.location,
            "risk_level": request.risk_level,
            "message": request.message,
            "triggered_by": username,
            "timestamp": datetime.utcnow()
        }
        await db.notifications.insert_one(notification_record)
        
        return {
            "status": "success",
            "message": "Notification triggered successfully",
            "notification_id": notification_record["id"]
        }
    except Exception as e:
        logger.error(f"Notification error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Notification failed: {str(e)}"
        )

@api_router.get("/predictions/history")
async def get_prediction_history(username: str = Depends(verify_token)):
    """Get user's prediction history"""
    try:
        predictions = await db.predictions.find(
            {"username": username}
        ).sort("timestamp", -1).limit(50).to_list(50)
        
        return {"predictions": predictions}
    except Exception as e:
        logger.error(f"History fetch error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch history: {str(e)}"
        )

# Legacy endpoints
@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()