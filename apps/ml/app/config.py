from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    ML_API_KEY: str = "dev-ml-key"
    DATABASE_URL: str = "postgresql://hospital:hospitalpass@localhost:5432/hospital_queue"
    MLFLOW_TRACKING_URI: str = "http://localhost:5000"
    MODEL_STORAGE_PATH: str = "./models"
    MIN_TRAINING_SAMPLES: int = 50  # Minimum samples before training a model

    class Config:
        env_file = "../../.env"
        extra = "ignore"


settings = Settings()
