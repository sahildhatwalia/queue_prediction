import { AppointmentType, Priority } from '@hospital-queue/shared';

/**
 * Computes a triage priority score from patient attributes.
 *
 * Score breakdown:
 *   Pain level       → max 30 pts
 *   Appointment type → max 25 pts
 *   Age (elderly/child) → max 15 pts
 *   Waiting time     → max 20 pts (fairness factor, recalculated every 5 min)
 *   Pre-booked       → max 10 pts
 */
export function computePriorityScore(input) {
  let score = 0;

  // Pain level (max 30 pts)
  const clampedPain = Math.min(10, Math.max(1, input.painLevel));
  score += Math.round((clampedPain / 10) * 30);

  // Appointment type (max 25 pts)
  const typeScores = {
    [AppointmentType.EMERGENCY]: 25,
    [AppointmentType.WALK_IN]: 10,
    [AppointmentType.PRE_BOOKED]: 15,
    [AppointmentType.FOLLOW_UP]: 5,
  };
  score += typeScores[input.appointmentType] ?? 10;

  // Age: elderly (65+) and children (<12) get an extra boost (max 15 pts)
  if (input.age !== undefined) {
    if (input.age >= 65) score += 15;
    else if (input.age < 12) score += 12;
  }

  // Waiting time fairness: 2 pts per 10 min waited, max 20 pts
  const waitBonus = Math.min(20, Math.floor(input.waitedMinutes / 10) * 2);
  score += waitBonus;

  // Pre-booked appointment bonus (max 10 pts)
  if (input.isPreBooked) score += 10;

  // Clamp to 0-100
  score = Math.min(100, Math.max(0, score));

  // Map score to Priority enum
  let priority;
  if (score >= 80) priority = Priority.CRITICAL;
  else if (score >= 60) priority = Priority.HIGH;
  else if (score >= 35) priority = Priority.NORMAL;
  else priority = Priority.LOW;

  return { score, priority };
}
