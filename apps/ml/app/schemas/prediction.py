from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class PredictRequest(BaseModel):
    department_id: str
    check_in_at: datetime
    current_queue_length: int = Field(ge=0)
    doctors_active: int = Field(ge=0, default=1)
    avg_service_min_dept: float = Field(gt=0, default=15.0)
    avg_service_min_doctor: Optional[float] = None
    dept_load_pct: float = Field(ge=0, le=1, default=0.5)
    priority_score: int = Field(ge=0, le=100, default=50)
    appointment_type: int = Field(ge=0, le=3, default=0)  # 0=WALK_IN, 1=PRE_BOOKED, 2=EMERGENCY, 3=FOLLOW_UP
    pain_level: int = Field(ge=1, le=10, default=5)
    hist_avg_wait_this_hour: Optional[float] = None
    hist_avg_wait_today: Optional[float] = None
    hist_queue_length_this_hour: Optional[float] = None


class PredictResponse(BaseModel):
    predicted_wait_min: int
    confidence_score: float
    model_version: str
    features_used: List[str]
    is_fallback: bool = False  # True if using heuristic fallback (no trained model yet)


class TrainRequest(BaseModel):
    department_id: Optional[str] = None  # None = train all departments
    force: bool = False  # Force retrain even if model is recent


class TrainResponse(BaseModel):
    departments_trained: List[str]
    results: dict
