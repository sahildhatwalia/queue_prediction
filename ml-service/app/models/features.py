import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, Any


FEATURE_COLS = [
    "hour_sin",
    "hour_cos",
    "day_of_week",
    "is_weekend",
    "is_morning_rush",
    "is_evening_rush",
    "current_queue_length",
    "doctors_active",
    "avg_service_min_dept",
    "dept_load_pct",
    "priority_score",
    "appointment_type",
    "pain_level",
    "hist_avg_wait_this_hour",
    "hist_avg_wait_today",
]


def build_features(raw: Dict[str, Any]) -> Dict[str, float]:
    """
    Transform raw check-in data into ML-ready features.

    Time features use cyclic (sin/cos) encoding so that 23:00 and 00:00
    are numerically close, preserving the continuity of time-of-day patterns.
    """
    check_in_at: datetime = raw["check_in_at"]
    if isinstance(check_in_at, str):
        check_in_at = datetime.fromisoformat(check_in_at)

    hour = check_in_at.hour
    dow = check_in_at.weekday()  # 0=Monday, 6=Sunday

    # Defaults for historical features (used when no history is available yet)
    avg_service = raw.get("avg_service_min_dept", 15.0)
    hist_avg_wait_this_hour = raw.get("hist_avg_wait_this_hour") or avg_service
    hist_avg_wait_today = raw.get("hist_avg_wait_today") or avg_service

    return {
        # Cyclic time encoding
        "hour_sin": float(np.sin(2 * np.pi * hour / 24)),
        "hour_cos": float(np.cos(2 * np.pi * hour / 24)),
        "day_of_week": float(dow),
        "is_weekend": float(dow >= 5),
        "is_morning_rush": float(9 <= hour <= 11),
        "is_evening_rush": float(17 <= hour <= 19),
        # Queue state
        "current_queue_length": float(raw.get("current_queue_length", 0)),
        "doctors_active": float(raw.get("doctors_active", 1)),
        "avg_service_min_dept": float(avg_service),
        "dept_load_pct": float(raw.get("dept_load_pct", 0.5)),
        # Patient attributes
        "priority_score": float(raw.get("priority_score", 50)),
        "appointment_type": float(raw.get("appointment_type", 0)),
        "pain_level": float(raw.get("pain_level", 5)),
        # Historical context
        "hist_avg_wait_this_hour": float(hist_avg_wait_this_hour),
        "hist_avg_wait_today": float(hist_avg_wait_today),
    }


def features_to_dataframe(features: Dict[str, float]) -> pd.DataFrame:
    """Convert a feature dict to a DataFrame row for model.predict()"""
    return pd.DataFrame([features])[FEATURE_COLS]
