from fastapi import APIRouter, HTTPException, Depends, Header
from app.schemas.prediction import PredictRequest, PredictResponse
from app.models.predictor import predictor
from app.models.features import build_features, FEATURE_COLS
from app.config import settings


router = APIRouter(prefix="/predict", tags=["prediction"])


async def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key != settings.ML_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


@router.post("/wait-time", response_model=PredictResponse)
async def predict_wait_time(
    request: PredictRequest,
    _: None = Depends(verify_api_key),
):
    """
    Predict wait time for a patient checking into a department.

    Returns the predicted wait in minutes along with a confidence score
    (0 = heuristic fallback, >0 = trained ML model).
    """
    raw = request.model_dump()
    features = build_features(raw)

    predicted_min, confidence = predictor.predict(request.department_id, raw)
    version = predictor.get_version(request.department_id)

    return PredictResponse(
        predicted_wait_min=max(1, predicted_min),
        confidence_score=round(confidence, 3),
        model_version=version,
        features_used=list(features.keys()),
        is_fallback=confidence == 0.0,
    )
