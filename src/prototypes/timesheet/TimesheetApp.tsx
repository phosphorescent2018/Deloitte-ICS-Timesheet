import { useEffect, useMemo, useRef, useState } from 'react';
import Calendar from './Calendar';
import DayEditor from './DayEditor';
import MonthView from './MonthView';
import WeekStrip from './WeekStrip';
import ActivityMix from './ActivityMix';
import { findActivity } from './lib/catalog';
import { addDays, fromKey, monthLabel, shortDate, toKey } from './lib/date';
import {
  blankDay,
  cloneDay,
  createLine,
  dayTotal,
  monthStats,
  statusOf,
  uid,
  validateDay,
  weekdaysOf,
  type ActivityLine,
  type AppState,
  type DayRecord,
} from './lib/model';
import { exportState, loadState, persist, resetState } from './lib/storage';
import { Icon, Modal, Toast, type ToastState, type ToastTone } from './ui';
import './timesheet.css';

type ViewMode = 'day' | 'month';

function boot(): { state: AppState; key: string } {
  return { state: loadState(), key: toKey(new Date()) };
}

function draftFor(state: AppState, key: string): DayRecord {
  const record = state.days[key];
  return record
    ? cloneDay(record)
    : blankDay(key, state.defaultLocation, state.defaultTarget);
}

export default function TimesheetApp() {
  const [bootState] = useState(boot);
  const [state, setState] = useState<AppState>(bootState.state);
  const [selectedKey, setSelectedKey] = useState(bootState.key);
  const [draft, setDraft] = useState<DayRecord>(() => draftFor(bootState.state, bootState.key));
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [view, setView] = useState(() => {
    const today = new Date();
    return { y: today.getFullYear(), m: today.getMonth() };
  });
  const [mode, setMode] = useState<ViewMode>('day');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pending, setPending] = useState<{ label: string; run: () => void } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const todayKey = toKey(new Date());
  const stats = useMemo(() => monthStats(state.days, view.y, view.m), [state.days, view]);
  const detailLine = draft.lines.find((line) => line.id === detailId);
  const detailActivity = detailLine ? findActivity(detailLine.code) : undefined;

  const pushToast = (text: string, tone: ToastTone = 'ok') => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  };

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const guard = (label: string, run: () => void) => {
    if (!dirty) {
      run();
      return;
    }
    setPending({ label, run });
  };

  const openDay = (key: string, syncView = true) => {
    setSelectedKey(key);
    setDraft(draftFor(state, key));
    setDirty(false);
    setIssues([]);
    if (syncView) {
      const date = fromKey(key);
      setView({ y: date.getFullYear(), m: date.getMonth() });
    }
  };

  const selectDate = (key: string, syncView = true) => {
    if (key === selectedKey) return;
    guard(`switch to ${shortDate(key)}`, () => openDay(key, syncView));
  };

  const changeMonth = (delta: number) => {
    const next = new Date(view.y, view.m + delta, 1);
    const day = Math.min(
      fromKey(selectedKey).getDate(),
      new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate(),
    );
    const key = toKey(new Date(next.getFullYear(), next.getMonth(), day));
    guard('change month', () => {
      setView({ y: next.getFullYear(), m: next.getMonth() });
      openDay(key, false);
    });
  };

  const goToday = () => {
    const today = new Date();
    guard('jump to today', () => {
      setView({ y: today.getFullYear(), m: today.getMonth() });
      setMode('day');
      openDay(toKey(today), false);
    });
  };

  const shiftDay = (delta: number) => {
    selectDate(toKey(addDays(fromKey(selectedKey), delta)));
  };

  const patchDraft = (patch: Partial<DayRecord>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const patchLine = (id: string, patch: Partial<ActivityLine>) => {
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    }));
    setDirty(true);
  };

  const addLine = () => {
    setDraft((prev) => {
      const remaining = Math.max(0, Math.round(((prev.target || 8) - dayTotal(prev)) * 10) / 10);
      return { ...prev, lines: [...prev.lines, { ...createLine(), hours: remaining }] };
    });
    setDirty(true);
  };

  const removeLine = (id: string) => {
    setDraft((prev) => ({ ...prev, lines: prev.lines.filter((line) => line.id !== id) }));
    setDirty(true);
  };

  const saveDay = () => {
    const found = validateDay(draft);
    setIssues(found);
    if (found.length > 0) {
      pushToast('Please fix the issues below before saving.', 'error');
      return;
    }
    const record: DayRecord = { ...draft, savedAt: new Date().toISOString() };
    const nextState: AppState = {
      ...state,
      defaultLocation: record.location,
      days: { ...state.days, [record.date]: record },
    };
    setState(nextState);
    persist(nextState);
    setDraft(record);
    setDirty(false);
    pushToast(`${shortDate(record.date)} saved · ${dayTotal(record).toFixed(1)} h`, 'ok');
  };

  const prefillWeek = () => {
    const formLines = draft.lines.filter((line) => line.code);
    let sourceLines: ActivityLine[] = formLines;
    let fromFallback = false;

    // 当前表单还没选代码时，回退到最近一条已保存记录作为模板。
    if (sourceLines.length === 0) {
      for (let offset = 1; offset <= 30; offset += 1) {
        const key = toKey(addDays(fromKey(selectedKey), -offset));
        const record = state.days[key];
        if (record && dayTotal(record) > 0) {
          sourceLines = record.lines.filter((line) => line.code).map((line) => ({ ...line }));
          fromFallback = true;
          break;
        }
      }
    }

    if (sourceLines.length === 0) {
      pushToast('Select an activity code before prefilling the week.', 'error');
      return;
    }

    const sourceTotal = sourceLines.reduce((sum, line) => sum + line.hours, 0);
    let template: ActivityLine[];

    if (fromFallback) {
      // 回退模板按目标工时等比缩放，并抹平四舍五入误差。
      const scaled =
        sourceTotal > 0
          ? sourceLines.map((line) => ({
              ...line,
              id: uid(),
              remark: '',
              note: '',
              hours: Math.round((line.hours / sourceTotal) * draft.target * 2) / 2,
            }))
          : sourceLines.map((line, index) => ({
              ...line,
              id: uid(),
              remark: '',
              note: '',
              hours: index === 0 ? draft.target : 0,
            }));
      const drift = Math.round((draft.target - scaled.reduce((sum, line) => sum + line.hours, 0)) * 2) / 2;
      if (drift !== 0 && scaled[0]) {
        scaled[0] = { ...scaled[0], hours: Math.max(0, Math.round((scaled[0].hours + drift) * 2) / 2) };
      }
      template = scaled;
    } else {
      template = sourceLines.map((line) => ({ ...line, id: uid(), remark: '', note: '' }));
    }

    const nextDays = { ...state.days };
    const filled: string[] = [];
    const skipped: string[] = [];

    weekdaysOf(selectedKey).forEach((key) => {
      const existing = nextDays[key];
      if (existing && dayTotal(existing) > 0) {
        skipped.push(shortDate(key));
        return;
      }
      const savedAt = new Date();
      nextDays[key] = {
        date: key,
        location: draft.location,
        target: draft.target,
        savedAt: savedAt.toISOString(),
        lines: template.map((line) => ({ ...line, id: uid() })),
      };
      filled.push(shortDate(key));
    });

    if (filled.length === 0) {
      pushToast('This week is already filled — nothing to prefill.', 'warn');
      return;
    }

    const nextState: AppState = { ...state, days: nextDays };
    setState(nextState);
    persist(nextState);

    if (filled.includes(shortDate(selectedKey))) {
      setDraft(cloneDay(nextDays[selectedKey]));
      setDirty(false);
      setIssues([]);
    }

    pushToast(
      `Prefilled ${filled.length} weekday${filled.length > 1 ? 's' : ''} (${filled.join(', ')})${
        skipped.length > 0 ? ` · skipped ${skipped.length} existing` : ''
      }`,
      'ok',
    );
  };

  const copyLastDay = () => {
    const base = fromKey(selectedKey);
    for (let offset = 1; offset <= 90; offset += 1) {
      const key = toKey(addDays(base, -offset));
      const record = state.days[key];
      if (record && dayTotal(record) > 0) {
        setDraft({ ...cloneDay(record), date: selectedKey, savedAt: null });
        setDirty(true);
        setIssues([]);
        pushToast(`Copied ${shortDate(key)} · ${dayTotal(record).toFixed(1)} h — review and save.`, 'ok');
        return;
      }
    }
    pushToast('No earlier entry found in the previous 90 days.', 'warn');
  };

  const clearDay = () => {
    setDraft(blankDay(selectedKey, draft.location, draft.target > 0 ? draft.target : state.defaultTarget));
    setDirty(true);
    setIssues([]);
    pushToast('Entry cleared — save to apply.', 'warn');
  };

  const restoreDemo = () => {
    const fresh = resetState();
    const today = new Date();
    setState(fresh);
    setView({ y: today.getFullYear(), m: today.getMonth() });
    setMode('day');
    setSelectedKey(toKey(today));
    setDraft(draftFor(fresh, toKey(today)));
    setDirty(false);
    setIssues([]);
    setResetOpen(false);
    pushToast('Demo data restored.', 'ok');
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveDay();
        return;
      }
      if (mode !== 'day') return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        shiftDay(-1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        shiftDay(1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const openDetail = (id: string) => setDetailId(id);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            ICS
          </div>
          <div className="brand-text">
            <h1>Internal Client Service Timesheet</h1>
            <p>Deloitte Global Delivery Center · Chongqing</p>
          </div>
        </div>

        <div className="topbar-right">
          <div className="seg" role="tablist" aria-label="View mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'day'}
              className={mode === 'day' ? 'is-active' : undefined}
              onClick={() => setMode('day')}
            >
              <Icon.List size={14} />
              Day
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'month'}
              className={mode === 'month' ? 'is-active' : undefined}
              onClick={() => setMode('month')}
            >
              <Icon.Grid size={14} />
              Month
            </button>
          </div>

          <div className="menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="icon-btn menu-btn"
              aria-label="More actions"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="dots">•••</span>
            </button>
            {menuOpen ? (
              <div className="menu">
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    exportState(state);
                    setMenuOpen(false);
                    pushToast('Timesheet JSON exported.', 'ok');
                  }}
                >
                  <Icon.Download size={15} />
                  Export JSON
                </button>
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    setAboutOpen(true);
                  }}
                >
                  <Icon.FileText size={15} />
                  About this prototype
                </button>
                <div className="menu-sep" />
                <button
                  type="button"
                  className="menu-item is-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    setResetOpen(true);
                  }}
                >
                  <Icon.Rotate size={15} />
                  Reset demo data
                </button>
              </div>
            ) : null}
          </div>

          <div className="user-chip">
            <span className="avatar">G</span>
            <div>
              <strong>GDC-ESH</strong>
              <span>Timesheet user</span>
            </div>
          </div>
        </div>
      </header>

      <div className="banner">
        <div className="banner-left">
          <span className="banner-dot" aria-hidden="true" />
          <strong>Reminder</strong>
          <span>– this is Internal Client Service Timesheet.</span>
        </div>
        <div className="banner-right">
          {monthLabel(view.y, view.m)} · Target 8.0 h / day
        </div>
      </div>

      <main className="layout">
        <Calendar
          year={view.y}
          month={view.m}
          selectedKey={selectedKey}
          todayKey={todayKey}
          days={state.days}
          stats={stats}
          onSelect={(key) => selectDate(key)}
          onPrev={() => changeMonth(-1)}
          onNext={() => changeMonth(1)}
          onToday={goToday}
        />

        {mode === 'day' ? (
          <div className="workspace">
            <DayEditor
              draft={draft}
              status={statusOf(draft)}
              dirty={dirty}
              issues={issues}
              onChange={patchDraft}
              onLineChange={patchLine}
              onAddLine={addLine}
              onRemoveLine={removeLine}
              onOpenDetail={openDetail}
              onSave={saveDay}
              onPrefill={prefillWeek}
              onCopyLast={copyLastDay}
              onClear={clearDay}
            />
            <div className="insights">
              <WeekStrip selectedKey={selectedKey} days={state.days} onSelect={selectDate} />
              <ActivityMix year={view.y} month={view.m} days={state.days} />
            </div>
          </div>
        ) : (
          <div className="workspace">
            <MonthView
              year={view.y}
              month={view.m}
              days={state.days}
              stats={stats}
              onSelect={(key) => {
                setMode('day');
                selectDate(key);
              }}
            />
            <div className="insights">
              <WeekStrip selectedKey={selectedKey} days={state.days} onSelect={selectDate} />
              <ActivityMix year={view.y} month={view.m} days={state.days} />
            </div>
          </div>
        )}
      </main>

      <footer className="page-foot">
        <span>Prototype · All entries are stored locally in this browser.</span>
        <span className="kbd-hints">
          <kbd>←</kbd>
          <kbd>→</kbd> change day
          <span className="dot">·</span>
          <kbd>⌘</kbd>
          <kbd>S</kbd> save
        </span>
      </footer>

      <Toast toast={toast} />

      {pending ? (
        <Modal
          title="Discard unsaved changes?"
          subtitle={`Your edits to ${shortDate(selectedKey)} have not been saved.`}
          width={460}
          onClose={() => setPending(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>
                Keep editing
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  const action = pending.run;
                  setPending(null);
                  action();
                }}
              >
                Discard changes
              </button>
            </>
          }
        >
          <p className="modal-copy">
            You are about to {pending.label}. Unsaved time will be lost — save first if you want to keep it.
          </p>
        </Modal>
      ) : null}

      {resetOpen ? (
        <Modal
          title="Reset demo data?"
          subtitle="This clears every entry in this browser and restores the seeded week."
          width={460}
          onClose={() => setResetOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setResetOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={restoreDemo}>
                Reset data
              </button>
            </>
          }
        >
          <p className="modal-copy">
            The seeded week contains Monday to Friday entries with two activity lines and one overtime day,
            so the calendar shows every state at a glance.
          </p>
        </Modal>
      ) : null}

      {aboutOpen ? (
        <Modal
          title="Internal Client Service Timesheet"
          subtitle="High-fidelity prototype · React + Vite · GitHub Pages"
          width={520}
          onClose={() => setAboutOpen(false)}
          footer={
            <button type="button" className="btn btn-blue" onClick={() => setAboutOpen(false)}>
              Close
            </button>
          }
        >
          <p className="modal-copy">
            A working reproduction of the Deloitte GDC internal timesheet: month calendar with status
            colours, daily entry sheet with activity codes, work location and target hours, plus prefill and
            copy actions. Data is persisted in <code>localStorage</code>, so a reload keeps your entries.
          </p>
        </Modal>
      ) : null}

      {detailLine ? (
        <Modal
          title="Activity detail"
          subtitle={`${shortDate(draft.date)} · ${detailLine.hours.toFixed(1)} h`}
          width={620}
          onClose={() => setDetailId(null)}
          footer={
            <button type="button" className="btn btn-blue" onClick={() => setDetailId(null)}>
              Done
            </button>
          }
        >
          <dl className="detail-list">
            <div>
              <dt>Activity code</dt>
              <dd className="mono">{detailLine.code || '—'}</dd>
            </div>
            <div>
              <dt>Activity name</dt>
              <dd>{detailActivity?.name ?? '—'}</dd>
            </div>
            <div>
              <dt>Client</dt>
              <dd>{detailActivity?.client ?? '—'}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{detailActivity?.category ?? '—'}</dd>
            </div>
          </dl>
          <p className="detail-desc">{detailActivity?.description ?? 'No description available.'}</p>
          <label className="field">
            <span>Note (saved with this line)</span>
            <textarea
              rows={3}
              value={detailLine.note}
              placeholder="Add context for reviewers, e.g. billing batch number or evidence reference…"
              onChange={(event) => patchLine(detailLine.id, { note: event.target.value })}
            />
          </label>
        </Modal>
      ) : null}
    </div>
  );
}
