from fastapi import APIRouter, Depends, Header, HTTPException
from app.schemas.prediction import TrainRequest, TrainResponse
from app.services.training import train_model, load_training_data
from app.models.predictor import predictor
from app.config import settings
from sqlalchemy import create_engine, text
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/train", tags=["training"])


async def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key != settings.ML_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


@router.post("/", response_model=TrainResponse)
async def trigger_training(
    request: TrainRequest,
    _: None = Depends(verify_api_key),
):
    """
    Trigger model training for one or all departments.
    Only departments with enough historical data will produce a model.
    """
    # Get all department IDs
    if request.department_id:
        dept_ids = [request.department_id]
    else:
        engine = create_engine(settings.DATABASE_URL)
        with engine.connect() as conn:
            result = conn.execute(text('SELECT id FROM "Department" WHERE "isActive" = true'))
            dept_ids = [row[0] for row in result]
        engine.dispose()

    results = {}
    trained = []

    for dept_id in dept_ids:
        result = train_model(dept_id)
        results[dept_id] = result
        if result.get("status") == "trained":
            trained.append(dept_id)
            predictor.reload(dept_id)

    return TrainResponse(departments_trained=trained, results=results)
