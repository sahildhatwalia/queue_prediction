import os
import pickle
import logging
from pathlib import Path
from typing import Dict, Optional, Tuple

from app.models.features import build_features, features_to_dataframe, FEATURE_COLS
from app.config import settings

logger = logging.getLogger(__name__)

MODEL_DIR = Path(settings.MODEL_STORAGE_PATH)
MODEL_DIR.mkdir(parents=True, exist_ok=True)


class Predictor:
    """
    Singleton that loads trained models from disk.
    Falls back to a simple heuristic when no trained model exists for a department.
    """

    def __init__(self):
        # Cache: department_id -> (model, version_str)
        self._models: Dict[str, Tuple[object, str]] = {}

    def predict(self, department_id: str, raw_features: dict) -> Tuple[int, float]:
        """
        Returns (predicted_wait_min, confidence_score).
        confidence_score is 0.0 for heuristic fallback, ~0.7-0.95 for trained models.
        """
        features = build_features(raw_features)
        model, version = self._get_model(department_id)

        if model is None:
            # Heuristic fallback: queue_length × avg_service_time
            queue_len = raw_features.get("current_queue_length", 1)
            avg_service = raw_features.get("avg_service_min_dept", 15)
            estimate = max(1, int(queue_len * avg_service))
            return estimate, 0.0

        try:
            df = features_to_dataframe(features)
            prediction = model.predict(df)[0]
            # Use residual std dev as a rough confidence proxy — simplified here
            confidence = 0.75
            return max(1, round(float(prediction))), confidence
        except Exception as e:
            logger.error(f"Prediction failed for dept {department_id}: {e}")
            return self._heuristic(raw_features), 0.0

    def get_version(self, department_id: str) -> str:
        _, version = self._get_model(department_id)
        return version or "fallback-heuristic"

    def reload(self, department_id: str) -> None:
        """Force reload model from disk (called after retraining)"""
        if department_id in self._models:
            del self._models[department_id]
        self._get_model(department_id)

    def _get_model(self, department_id: str) -> Tuple[Optional[object], str]:
        if department_id in self._models:
            return self._models[department_id]

        model_path = MODEL_DIR / f"model_{department_id}.pkl"
        if model_path.exists():
            try:
                with open(model_path, "rb") as f:
                    bundle = pickle.load(f)
                model = bundle["model"]
                version = bundle.get("version", "unknown")
                self._models[department_id] = (model, version)
                logger.info(f"Loaded model for dept {department_id} (v{version})")
                return model, version
            except Exception as e:
                logger.error(f"Failed to load model for {department_id}: {e}")

        self._models[department_id] = (None, "fallback")
        return None, "fallback"

    def _heuristic(self, raw: dict) -> int:
        queue_len = raw.get("current_queue_length", 1)
        avg_service = raw.get("avg_service_min_dept", 15)
        return max(1, int(queue_len * avg_service))


# Singleton instance
predictor = Predictor()
