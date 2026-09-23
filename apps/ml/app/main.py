import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.routers import predict, train
from app.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# APScheduler for nightly model retraining
scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Schedule nightly retraining at 2:00 AM
    scheduler.add_job(
        trigger_nightly_retrain,
        trigger="cron",
        hour=2,
        minute=0,
        id="nightly_retrain",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("ML service started. Nightly retraining scheduled at 02:00.")
    yield
    scheduler.shutdown()
    logger.info("ML service shutting down.")


async def trigger_nightly_retrain():
    """Runs every night to retrain all department models on new data."""
    from app.services.training import train_model
    from app.models.predictor import predictor
    from sqlalchemy import create_engine, text

    logger.info("Starting nightly model retraining...")
    try:
        engine = create_engine(settings.DATABASE_URL)
        with engine.connect() as conn:
            result = conn.execute(text('SELECT id FROM "Department" WHERE "isActive" = true'))
            dept_ids = [row[0] for row in result]
        engine.dispose()

        for dept_id in dept_ids:
            result = train_model(dept_id)
            if result.get("status") == "trained":
                predictor.reload(dept_id)
                logger.info(f"Retrained {dept_id}: MAE={result.get('mae_minutes', '?'):.1f}min")

        logger.info("Nightly retraining complete.")
    except Exception as e:
        logger.error(f"Nightly retraining failed: {e}")


app = FastAPI(
    title="Hospital Queue ML Service",
    description="ML prediction service for wait time estimation",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(predict.router, prefix="/api/v1")
app.include_router(train.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ml-prediction", "version": "1.0.0"}
