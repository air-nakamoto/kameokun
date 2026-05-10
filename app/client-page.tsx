'use client';

import { useMemo, useRef, useState, useEffect, type CSSProperties } from 'react';

// ============== 型定義（API レスポンスのうち画面が必要とする部分のみ）==============

interface PublicProblem {
  title: string;
  intro: string;
  rules: string;
  player_visible_tags: {
    estimated_minutes: number;
    difficulty: 'beginner' | 'standard' | 'advanced';
  };
}

interface CharacterOverview {
  id: string;
  name: string;
  is_client: boolean;
}

interface SessionState {
  id: string;
  public: PublicProblem;
  characters: CharacterOverview[];
}

type ChatTurn =
  | { role: 'player'; content: string }
  | { role: 'character'; speaker_id: string; content: string };

interface SolveResult {
  status: 'unsolved' | 'stage_1_cleared' | 'stage_2_cleared';
  can_reveal_explanation: boolean;
  player_message: string;
}

interface NakamotoHint {
  narration: string;
  important_points: string[];
  underexplored_points: string[];
  suggested_next_questions: string[];
}

// ============== UI ==============

const styles: Record<string, CSSProperties> = {
  page: {
    fontFamily: 'system-ui, "Hiragino Sans", "Yu Gothic", sans-serif',
    maxWidth: 760,
    margin: '0 auto',
    padding: '1.5rem',
    lineHeight: 1.6,
    color: '#222',
  },
  card: {
    background: '#fafafa',
    border: '1px solid #ddd',
    borderRadius: 8,
    padding: '1rem',
    marginBottom: '1rem',
  },
  history: {
    background: '#fff',
    border: '1px solid #ddd',
    borderRadius: 8,
    padding: '0.75rem',
    minHeight: 200,
    maxHeight: 400,
    overflowY: 'auto',
    marginBottom: '0.75rem',
  },
  turnPlayer: {
    background: '#e8f0fe',
    padding: '0.5rem 0.75rem',
    borderRadius: 6,
    margin: '0.25rem 0 0.25rem auto',
    maxWidth: '80%',
  },
  turnCharacter: {
    background: '#f3f3f3',
    padding: '0.5rem 0.75rem',
    borderRadius: 6,
    margin: '0.25rem auto 0.25rem 0',
    maxWidth: '80%',
  },
  speakerLabel: {
    fontSize: '0.75rem',
    color: '#888',
    marginBottom: '0.15rem',
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '0.5rem',
    border: '1px solid #ccc',
    borderRadius: 6,
    fontSize: '1rem',
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  button: {
    background: '#2266dd',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '0.55rem 1rem',
    cursor: 'pointer',
    fontSize: '1rem',
  },
  buttonSecondary: {
    background: '#fff',
    color: '#333',
    border: '1px solid #ccc',
    borderRadius: 6,
    padding: '0.5rem 0.9rem',
    cursor: 'pointer',
    fontSize: '0.95rem',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  errorBox: {
    background: '#fff0f0',
    border: '1px solid #ff9999',
    color: '#a02020',
    padding: '0.6rem 0.8rem',
    borderRadius: 6,
    marginBottom: '0.75rem',
  },
  resultBox: {
    background: '#f4fbef',
    border: '1px solid #b3d4a3',
    padding: '0.7rem 0.9rem',
    borderRadius: 6,
    marginTop: '0.75rem',
  },
  hintBox: {
    background: '#fff8e6',
    border: '1px solid #e8c87a',
    padding: '0.8rem 1rem',
    borderRadius: 8,
    marginTop: '0.75rem',
  },
  hintNarration: {
    margin: '0 0 0.6rem',
    whiteSpace: 'pre-wrap',
    fontSize: '0.95rem',
  },
  hintHeading: {
    margin: '0.4rem 0 0.2rem',
    fontSize: '0.85rem',
    color: '#7a5c1a',
    fontWeight: 600,
  },
  hintList: {
    margin: '0 0 0.4rem',
    paddingLeft: '1.2rem',
    fontSize: '0.9rem',
  },
  divider: {
    border: 0,
    borderTop: '1px solid #eee',
    margin: '1.25rem 0',
  },
  tagRow: {
    display: 'flex',
    gap: '0.5rem',
    fontSize: '0.85rem',
    color: '#666',
    flexWrap: 'wrap',
  },
  tag: {
    background: '#eee',
    padding: '0.15rem 0.5rem',
    borderRadius: 12,
  },
};

const DIFFICULTY_LABEL: Record<PublicProblem['player_visible_tags']['difficulty'], string> = {
  beginner: 'やさしい',
  standard: 'ふつう',
  advanced: 'むずかしい',
};

function friendlyError(status: number): string {
  if (status === 404) {
    return 'セッションが期限切れです。新しく開始してください。';
  }
  if (status === 400) {
    return '入力に問題がありました。';
  }
  if (status === 502) {
    return 'AIの応答に問題がありました。少し時間をおいて再試行してください。';
  }
  return '通信エラーが発生しました。';
}

export default function ClientPage() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>('');
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [solveResult, setSolveResult] = useState<SolveResult | null>(null);
  const [hint, setHint] = useState<NakamotoHint | null>(null);

  const historyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [history]);

  const characterById = useMemo(() => {
    const m = new Map<string, CharacterOverview>();
    if (session) for (const c of session.characters) m.set(c.id, c);
    return m;
  }, [session]);

  function clearError() {
    if (error) setError(null);
  }

  async function startNewProblem() {
    clearError();
    setStatusMessage('問題を準備しています...');
    setBusy(true);
    try {
      const res = await fetch('/api/generate-problem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        setError(friendlyError(res.status));
        setStatusMessage(null);
        return;
      }
      const data = await res.json();
      const chars: CharacterOverview[] = data.characters_overview ?? [];
      if (!data.session_id || !data.public || chars.length === 0) {
        setError('問題データの受け取りに失敗しました。');
        setStatusMessage(null);
        return;
      }
      const defaultSpeaker =
        chars.find(c => c.is_client)?.id ?? chars[0]?.id ?? '';
      setSession({ id: data.session_id, public: data.public, characters: chars });
      setSelectedSpeakerId(defaultSpeaker);
      setHistory([]);
      setSolveResult(null);
      setHint(null);
      setInput('');
      setAnswer('');
      setStatusMessage('問題を開始しました。');
    } catch {
      setError('通信エラーが発生しました。');
      setStatusMessage(null);
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    if (!session || !input.trim() || busy) return;
    clearError();
    const playerMsg = input.trim();
    setInput('');
    setHistory(h => [...h, { role: 'player', content: playerMsg }]);
    setBusy(true);
    try {
      const res = await fetch('/api/dialogue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session_id: session.id,
          speaker_id: selectedSpeakerId,
          player_message: playerMsg,
        }),
      });
      if (!res.ok) {
        if (res.status === 404) {
          setSession(null);
          setHistory([]);
          setSolveResult(null);
          setHint(null);
        }
        setError(friendlyError(res.status));
        return;
      }
      const data = await res.json();
      setHistory(h => [
        ...h,
        {
          role: 'character',
          speaker_id: data.speaker_id ?? selectedSpeakerId,
          content: data.response ?? '',
        },
      ]);
    } catch {
      setError('通信エラーが発生しました。');
    } finally {
      setBusy(false);
    }
  }

  async function callNakamoto() {
    if (!session || busy) return;
    if (history.length === 0) {
      setError('まだ会話が始まっていません。質問してから呼んでください。');
      return;
    }
    clearError();
    setBusy(true);
    try {
      const res = await fetch('/api/nakamoto-hint', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: session.id }),
      });
      if (!res.ok) {
        if (res.status === 404) {
          setSession(null);
          setHistory([]);
          setSolveResult(null);
          setHint(null);
        }
        setError(friendlyError(res.status));
        return;
      }
      const data = await res.json();
      setHint({
        narration: data.narration ?? '',
        important_points: data.important_points ?? [],
        underexplored_points: data.underexplored_points ?? [],
        suggested_next_questions: data.suggested_next_questions ?? [],
      });
    } catch {
      setError('通信エラーが発生しました。');
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer() {
    if (!session || !answer.trim() || busy) return;
    clearError();
    setBusy(true);
    try {
      const res = await fetch('/api/solve-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session_id: session.id,
          player_answer: answer.trim(),
        }),
      });
      if (!res.ok) {
        if (res.status === 404) {
          setSession(null);
          setHistory([]);
          setSolveResult(null);
          setHint(null);
        }
        setError(friendlyError(res.status));
        return;
      }
      const data: SolveResult = await res.json();
      setSolveResult(data);
    } catch {
      setError('通信エラーが発生しました。');
    } finally {
      setBusy(false);
    }
  }

  // ============== レンダリング ==============

  return (
    <main style={styles.page}>
      <h1 style={{ marginBottom: '0.25rem' }}>亀夫君問題 MVP</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', marginTop: 0 }}>
        水平思考ユニットうみがめ部 オリジナル問題
      </p>

      {error && <div style={styles.errorBox}>{error}</div>}
      {statusMessage && !error && (
        <div
          style={{
            background: '#eef6ff',
            border: '1px solid #9fc4ee',
            color: '#24517a',
            padding: '0.6rem 0.8rem',
            borderRadius: 6,
            marginBottom: '0.75rem',
          }}
        >
          {statusMessage}
        </div>
      )}

      {!session ? (
        <section style={styles.card}>
          <h2 style={{ marginTop: 0 }}>新しい問題を始める</h2>
          <p>「開始」を押すと新しい問題が出題されます。</p>
          <button
            type="button"
            onClick={startNewProblem}
            disabled={busy}
            style={{
              ...styles.button,
              ...(busy ? styles.buttonDisabled : {}),
            }}
          >
            {busy ? '生成中...' : '開始'}
          </button>
        </section>
      ) : (
        <>
          <section style={styles.card}>
            <h2 style={{ marginTop: 0 }}>{session.public.title}</h2>
            <div style={styles.tagRow}>
              <span style={styles.tag}>
                想定 {session.public.player_visible_tags.estimated_minutes} 分
              </span>
              <span style={styles.tag}>
                難易度: {DIFFICULTY_LABEL[session.public.player_visible_tags.difficulty]}
              </span>
            </div>
            <p style={{ marginTop: '0.75rem', whiteSpace: 'pre-wrap' }}>
              {session.public.intro}
            </p>
            <details style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer', color: '#555' }}>ルール</summary>
              <p style={{ whiteSpace: 'pre-wrap', color: '#444' }}>
                {session.public.rules}
              </p>
            </details>
          </section>

          <section style={styles.card}>
            <label
              htmlFor="speaker-select"
              style={{ fontWeight: 600, fontSize: '0.95rem' }}
            >
              話しかける相手
            </label>
            <select
              id="speaker-select"
              value={selectedSpeakerId}
              onChange={e => setSelectedSpeakerId(e.target.value)}
              disabled={busy}
              style={{
                marginLeft: '0.5rem',
                padding: '0.35rem 0.5rem',
                fontSize: '1rem',
              }}
            >
              {session.characters.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.is_client ? '（相談者）' : ''}
                </option>
              ))}
            </select>
          </section>

          <section>
            <h3 style={{ marginBottom: '0.4rem' }}>会話</h3>
            <div ref={historyRef} style={styles.history}>
              {history.length === 0 ? (
                <p style={{ color: '#999', textAlign: 'center', margin: '2rem 0' }}>
                  質問を投げかけて会話を始めましょう
                </p>
              ) : (
                history.map((turn, i) => {
                  if (turn.role === 'player') {
                    return (
                      <div key={i} style={styles.turnPlayer}>
                        <div style={styles.speakerLabel}>あなた</div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{turn.content}</div>
                      </div>
                    );
                  }
                  const speaker = characterById.get(turn.speaker_id);
                  return (
                    <div key={i} style={styles.turnCharacter}>
                      <div style={styles.speakerLabel}>
                        {speaker?.name ?? turn.speaker_id}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{turn.content}</div>
                    </div>
                  );
                })
              )}
            </div>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (
                  e.key === 'Enter' &&
                  (e.metaKey || e.ctrlKey) &&
                  !busy &&
                  input.trim()
                ) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="質問を入力（Cmd/Ctrl+Enter で送信）"
              rows={2}
              disabled={busy}
              style={styles.textarea}
            />
            <div
              style={{
                marginTop: '0.4rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={callNakamoto}
                disabled={busy || history.length === 0}
                style={{
                  ...styles.buttonSecondary,
                  ...(busy || history.length === 0 ? styles.buttonDisabled : {}),
                }}
                title="中本アイアールがヒントをくれます"
              >
                🐢 ヒント
              </button>
              <button
                type="button"
                onClick={sendMessage}
                disabled={busy || !input.trim()}
                style={{
                  ...styles.button,
                  ...(busy || !input.trim() ? styles.buttonDisabled : {}),
                }}
              >
                {busy ? '送信中...' : '送信'}
              </button>
            </div>

            {hint && (
              <div style={styles.hintBox}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.3rem',
                  }}
                >
                  <strong style={{ fontSize: '0.95rem' }}>
                    🐢 中本アイアールからの作戦会議
                  </strong>
                  <button
                    type="button"
                    onClick={() => setHint(null)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      color: '#7a5c1a',
                    }}
                    aria-label="閉じる"
                  >
                    閉じる
                  </button>
                </div>
                <p style={styles.hintNarration}>{hint.narration}</p>
                {hint.important_points.length > 0 && (
                  <>
                    <div style={styles.hintHeading}>
                      ここまでに分かっていること
                    </div>
                    <ul style={styles.hintList}>
                      {hint.important_points.map((p, i) => (
                        <li key={`imp-${i}`}>{p}</li>
                      ))}
                    </ul>
                  </>
                )}
                {hint.underexplored_points.length > 0 && (
                  <>
                    <div style={styles.hintHeading}>
                      まだ深掘りできそうなところ
                    </div>
                    <ul style={styles.hintList}>
                      {hint.underexplored_points.map((p, i) => (
                        <li key={`und-${i}`}>{p}</li>
                      ))}
                    </ul>
                  </>
                )}
                {hint.suggested_next_questions.length > 0 && (
                  <>
                    <div style={styles.hintHeading}>
                      次に聞いてみるとよさそうな質問
                    </div>
                    <ul style={styles.hintList}>
                      {hint.suggested_next_questions.map((p, i) => (
                        <li key={`sug-${i}`}>{p}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </section>

          <hr style={styles.divider} />

          <section style={styles.card}>
            <h3 style={{ marginTop: 0 }}>解答する</h3>
            <p style={{ fontSize: '0.9rem', color: '#555', marginTop: 0 }}>
              真相と、相談者の次の一手を文章で説明してください。
            </p>
            <textarea
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              placeholder="分かったことと、どうすればよいと思うかを書いてください"
              rows={3}
              disabled={busy}
              style={styles.textarea}
            />
            <div style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={submitAnswer}
                disabled={busy || !answer.trim()}
                style={{
                  ...styles.button,
                  ...(busy || !answer.trim() ? styles.buttonDisabled : {}),
                }}
              >
                {busy ? '判定中...' : '解答を提出'}
              </button>
            </div>
            {solveResult && (
              <div style={styles.resultBox}>
                <strong>
                  {solveResult.status === 'stage_2_cleared'
                    ? '解決しました'
                    : solveResult.status === 'stage_1_cleared'
                      ? '真相は見えてきました'
                      : 'まだ解決には届いていません'}
                </strong>
                <p style={{ margin: '0.4rem 0 0', whiteSpace: 'pre-wrap' }}>
                  {solveResult.player_message}
                </p>
              </div>
            )}
          </section>

          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <button
              type="button"
              onClick={startNewProblem}
              disabled={busy}
              style={{
                ...styles.buttonSecondary,
                ...(busy ? styles.buttonDisabled : {}),
              }}
            >
              新しい問題を始める
            </button>
          </div>
        </>
      )}

      <footer style={{ marginTop: '2rem', fontSize: '0.8rem', color: '#888' }}>
        セッションは一定時間で自動的に期限切れになります。期限切れ後は新しい問題から始めてください。
      </footer>
    </main>
  );
}
