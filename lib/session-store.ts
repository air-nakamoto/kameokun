// インメモリセッションストア（MVP用）
//
// 本番化時は永続層（Redis 等）に置き換える。
// 注意: Next.js のプロダクションは複数プロセス起動になり得るため、
//       インメモリ Map はシングルワーカ運用前提。
//
// TTL 設計:
//   - 期限基準は updated_at（最終アクセス/更新時刻）
//   - getSession() / updateSession() のタイミングで updated_at を更新
//   - 各操作で軽く cleanupExpiredSessions() を呼び、期限切れを掃除
//   - 期限切れの getSession() は null を返す（API 層で 404 になる）

import { randomUUID } from 'node:crypto';
import type { KameokunProblem, Stage } from './types';

export interface HistoryEntry {
  role: 'player' | 'character';
  speaker_id?: string;
  content: string;
}

export interface Session {
  id: string;
  problem: KameokunProblem;
  stage: Stage;
  history: HistoryEntry[];
  disclosed_fact_ids: string[];
  created_at: string;
  updated_at: string;
}

const DEFAULT_SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function resolveTTL(): number {
  const env = process.env.KAMEO_SESSION_TTL_MS;
  if (!env) return DEFAULT_SESSION_TTL_MS;
  const n = Number(env);
  if (Number.isFinite(n) && n > 0) return n;
  return DEFAULT_SESSION_TTL_MS;
}

const SESSION_TTL_MS = resolveTTL();
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1分間隔でしか実走しないスロットル

const sessions = new Map<string, Session>();
let lastCleanupAt = 0;

function isExpired(s: Session, now = Date.now()): boolean {
  return now - new Date(s.updated_at).getTime() > SESSION_TTL_MS;
}

function cleanupExpiredSessions(): void {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  for (const [id, s] of sessions) {
    if (isExpired(s, now)) {
      sessions.delete(id);
    }
  }
}

export function createSession(problem: KameokunProblem): Session {
  cleanupExpiredSessions();
  const id = `sess_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = new Date().toISOString();
  const session: Session = {
    id,
    problem,
    stage: 'unsolved',
    history: [],
    disclosed_fact_ids: [],
    created_at: now,
    updated_at: now,
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): Session | null {
  cleanupExpiredSessions();
  const s = sessions.get(id);
  if (!s) return null;
  if (isExpired(s)) {
    sessions.delete(id);
    return null;
  }
  // 「最終アクセス/更新」基準のため、読みでも updated_at をタッチする
  s.updated_at = new Date().toISOString();
  return s;
}

type Mutable = Pick<Session, 'stage' | 'history' | 'disclosed_fact_ids'>;

export function updateSession(
  id: string,
  patch: Partial<Mutable>,
): Session | null {
  const s = sessions.get(id);
  if (!s) return null;
  if (isExpired(s)) {
    sessions.delete(id);
    return null;
  }
  const updated: Session = {
    ...s,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  sessions.set(id, updated);
  return updated;
}

// ===== test / debug =====

export function getSessionCount(): number {
  return sessions.size;
}

export function getSessionTTL(): number {
  return SESSION_TTL_MS;
}

// テスト専用: 強制的にすべてのセッションを破棄する
export function _resetSessionsForTest(): void {
  sessions.clear();
  lastCleanupAt = 0;
}

// テスト専用: 期限切れ判定を強制実行する（throttleを無視）
export function _forceCleanupForTest(): number {
  const now = Date.now();
  let removed = 0;
  for (const [id, s] of sessions) {
    if (isExpired(s, now)) {
      sessions.delete(id);
      removed++;
    }
  }
  lastCleanupAt = now;
  return removed;
}
