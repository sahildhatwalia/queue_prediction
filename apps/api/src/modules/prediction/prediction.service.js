import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * Prediction service — calls the FastAPI ML service to get wait time predictions.
 * Falls back to simple heuristic if the ML service is unavailable.
 */
export class PredictionService {
  constructor() {
    this.baseUrl = env.ML_SERVICE_URL;
    this.apiKey = env.ML_API_KEY;
  }

  /**
   * Get a wait time prediction from the ML service.
   * @param {object} input - prediction input features
   * @returns {Promise<{predictedWaitMin: number, confidenceScore: number, modelVersion: string}>}
   */
  async predict(input) {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/predict/wait-time`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify({
          department_id: input.departmentId,
          current_queue_length: input.currentQueueLength,
          doctors_active: input.doctorsActive ?? 1,
          avg_service_min_dept: input.avgServiceMinDept ?? 15,
          avg_service_min_doctor: input.avgServiceMinDoctor ?? 10,
          dept_load_pct: input.deptLoadPct ?? 0.5,
          priority_score: input.priorityScore ?? 50,
          appointment_type: input.appointmentType ?? 0,
          pain_level: input.painLevel ?? 5,
          check_in_at: new Date().toISOString(),
          hist_avg_wait_this_hour: input.histAvgWaitThisHour ?? 15,
          hist_avg_wait_today: input.histAvgWaitToday ?? 20,
          hist_queue_length_this_hour: input.histQueueLengthThisHour ?? 5,
        }),
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!response.ok) {
        throw new Error(`ML service error: ${response.status}`);
      }

      const data = await response.json();
      return {
        predictedWaitMin: data.predicted_wait_min,
        confidenceScore: data.confidence_score,
        modelVersion: data.model_version,
        features: data.features_used,
      };
    } catch (err) {
      logger.warn({ err: err.message, departmentId: input.departmentId }, 'ML prediction failed, using fallback');
      return null; // caller will use simple heuristic
    }
  }

  /**
   * Trigger manual model retraining.
   */
  async triggerRetrain(departmentId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/train/retrain`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify({ department_id: departmentId }),
        signal: AbortSignal.timeout(30000), // 30 second timeout for training
      });

      if (!response.ok) {
        throw new Error(`ML retrain error: ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      logger.error({ err: err.message }, 'Failed to trigger ML retraining');
      throw err;
    }
  }
}

export const predictionService = new PredictionService();
