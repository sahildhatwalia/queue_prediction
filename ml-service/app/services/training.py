import pickle
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.model_selection import TimeSeriesSplit
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, r2_score
from sqlalchemy import create_engine, text

from app.models.features import FEATURE_COLS, build_features
from app.config import settings

logger = logging.getLogger(__name__)

MODEL_DIR = Path(settings.MODEL_STORAGE_PATH)
MODEL_DIR.mkdir(parents=True, exist_ok=True)


def load_training_data(department_id: Optional[str] = None) -> pd.DataFrame:
    """
    Pull completed queue entries from PostgreSQL for training.
    Only entries with actual_wait_min recorded are useful.
    """
    engine = create_engine(settings.DATABASE_URL)

    query = """
        SELECT
            q.department_id,
            q.check_in_at,
            q.priority_score,
            q.appointment_type::text,
            q.pain_level,
            q.actual_wait_min,
            d.average_service_min AS avg_service_min_dept
        FROM "QueueEntry" q
        JOIN "Department" d ON d.id = q.department_id
        WHERE q.status = 'COMPLETED'
          AND q.actual_wait_min IS NOT NULL
          AND q.actual_wait_min > 0
    """

    params = {}
    if department_id:
        query += ' AND q.department_id = :dept_id'
        params["dept_id"] = department_id

    query += ' ORDER BY q.check_in_at ASC'

    with engine.connect() as conn:
        df = pd.read_sql(text(query), conn, params=params)

    engine.dispose()
    return df


def prepare_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add engineered features to a raw dataframe."""
    records = []
    for _, row in df.iterrows():
        feat = build_features({
            "check_in_at": row["check_in_at"],
            "current_queue_length": 5,  # placeholder — actual queue state not stored per-entry
            "doctors_active": 1,
            "avg_service_min_dept": row["avg_service_min_dept"],
            "dept_load_pct": 0.5,
            "priority_score": row["priority_score"],
            "appointment_type": {"WALK_IN": 0, "PRE_BOOKED": 1, "EMERGENCY": 2, "FOLLOW_UP": 3}.get(
                str(row["appointment_type"]), 0
            ),
            "pain_level": row["pain_level"] if pd.notna(row["pain_level"]) else 5,
        })
        feat["actual_wait_min"] = row["actual_wait_min"]
        records.append(feat)

    return pd.DataFrame(records)


def train_model(department_id: str) -> Dict[str, Any]:
    """
    Train a Random Forest model for one department.
    Uses TimeSeriesSplit to prevent data leakage from future entries.
    """
    df_raw = load_training_data(department_id)

    if len(df_raw) < settings.MIN_TRAINING_SAMPLES:
        logger.info(f"Not enough data for dept {department_id} ({len(df_raw)} samples, need {settings.MIN_TRAINING_SAMPLES})")
        return {"status": "skipped", "reason": "insufficient_data", "samples": len(df_raw)}

    df = prepare_features(df_raw)
    X = df[FEATURE_COLS]
    y = df["actual_wait_min"]

    # Time-series CV — respects temporal ordering
    tscv = TimeSeriesSplit(n_splits=min(5, len(df) // 10))

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("model", RandomForestRegressor(
            n_estimators=200,
            max_depth=8,
            min_samples_leaf=5,
            random_state=42,
            n_jobs=-1,
        )),
    ])

    # Cross-validate
    mae_scores = []
    for train_idx, val_idx in tscv.split(X):
        X_train, X_val = X.iloc[train_idx], X.iloc[val_idx]
        y_train, y_val = y.iloc[train_idx], y.iloc[val_idx]
        pipeline.fit(X_train, y_train)
        y_pred = pipeline.predict(X_val)
        mae_scores.append(mean_absolute_error(y_val, y_pred))

    # Final fit on all data
    pipeline.fit(X, y)
    y_pred_all = pipeline.predict(X)
    final_mae = float(np.mean(mae_scores))
    final_r2 = float(r2_score(y, y_pred_all))

    version = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

    # Save model bundle to disk
    model_path = MODEL_DIR / f"model_{department_id}.pkl"
    with open(model_path, "wb") as f:
        pickle.dump({"model": pipeline, "version": version, "mae": final_mae, "r2": final_r2}, f)

    logger.info(f"Trained model for dept {department_id}: MAE={final_mae:.1f}min, R²={final_r2:.3f}, samples={len(df)}")

    return {
        "status": "trained",
        "version": version,
        "mae_minutes": final_mae,
        "r2_score": final_r2,
        "samples_used": len(df),
    }
