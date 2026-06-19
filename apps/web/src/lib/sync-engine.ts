/**
 * Compute the expected playback position for a viewer given the official server state.
 * Returns position in seconds.
 */
export interface OfficialState {
  is_playing: boolean;
  position_seconds: number;
  playback_rate: number;
  server_anchor_at: string; // ISO timestamp
  server_now?: string;      // optional reference now (for first paint)
}

export function expectedPosition(state: OfficialState, clientNow = Date.now()): number {
  if (!state.is_playing) return state.position_seconds;
  const anchor = new Date(state.server_anchor_at).getTime();
  const elapsed = (clientNow - anchor) / 1000;
  return Math.max(0, state.position_seconds + elapsed * (state.playback_rate || 1));
}

export const DRIFT_SOFT = 0.5;
export const DRIFT_HARD = 2.0;

export type DriftAction = "none" | "soft" | "hard";
export function computeDriftAction(driftSec: number): DriftAction {
  const a = Math.abs(driftSec);
  if (a >= DRIFT_HARD) return "hard";
  if (a >= DRIFT_SOFT) return "soft";
  return "none";
}
