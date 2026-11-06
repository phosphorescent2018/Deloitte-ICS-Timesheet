import { useEffect, useMemo, useRef, useState } from 'react';
import Calendar from './Calendar';
import DayEditor from './DayEditor';
import MonthView from './MonthView';
import WeekStrip from './WeekStrip';
import ActivityMix from './ActivityMix';
import { formatMonth, useI18n } from './i18n';
import mindigitalMark from './assets/mindigital-mark.svg';
import AdminPage from './AdminPage';
import { buildActivities, loadConfig, saveConfig, type AdminConfig } from './lib/config';
import { addDays, editableFromKey, fromKey, isFutureMonthKey, isLockedKey, shortDate, toKey } from './lib/date';
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
  type ValidationIssue,
} from './lib/model';
import { loadState, persist } from './lib/storage';
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
  const { t, lang, setLang } = useI18n();
  const [bootState] = useState(boot);
  const [state, setState] = useState<AppState>(bootState.state);
  const [selectedKey, setSelectedKey] = useState(bootState.key);
  const [draft, setDraft] = useState<DayRecord>(() => draftFor(bootState.state, bootState.key));
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [view, setView] = useState(() => {
    const today = new Date();
    return { y: today.getFullYear(), m: today.getMonth() };
  });
  const [mode, setMode] = useState<ViewMode>('day');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pending, setPending] = useState<{ label: string; run: () => void } | null>(null);
  const [approvalKey, setApprovalKey] = useState<string | null>(null);
  const [futureKey, setFutureKey] = useState<string | null>(null);
  const [page, setPage] = useState<'timesheet' | 'admin'>('timesheet');
  const [config, setConfig] = useState<AdminConfig>(() => loadConfig());
  const toastTimer = useRef<number | null>(null);

  const todayKey = toKey(new Date());
  const editableFrom = editableFromKey(todayKey);
  const activities = useMemo(() => buildActivities(config), [config]);
  const stats = useMemo(() => monthStats(state.days, view.y, view.m), [state.days, view]);

  const applyConfig = (next: AdminConfig) => {
    setConfig(next);
    saveConfig(next);
  };

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
    if (isFutureMonthKey(key, todayKey)) {
      setFutureKey(key);
      return;
    }
    if (isLockedKey(key, todayKey)) {
      setApprovalKey(key);
      return;
    }
    if (key === selectedKey) return;
    guard(t('action.switch', { date: shortDate(key) }), () => openDay(key, syncView));
  };

  const changeMonth = (delta: number) => {
    const next = new Date(view.y, view.m + delta, 1);
    setView({ y: next.getFullYear(), m: next.getMonth() });
  };

  const goToday = () => {
    const today = new Date();
    guard(t('action.today'), () => {
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
    if (isLockedKey(draft.date, todayKey)) {
      setApprovalKey(draft.date);
      return;
    }
    const found = validateDay(draft);
    setIssues(found);
    if (found.length > 0) {
      pushToast(t('toast.fixIssues'), 'error');
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
    pushToast(t('toast.saved', { date: shortDate(record.date), hours: dayTotal(record).toFixed(1) }), 'ok');
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
      pushToast(t('toast.noCode'), 'error');
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

    weekdaysOf(selectedKey).filter((key) => !isLockedKey(key, todayKey)).forEach((key) => {
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
      pushToast(t('toast.weekFull'), 'warn');
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
      t('toast.prefillDone', {
        count: filled.length,
        dates: filled.join('、'),
        skipped: skipped.length > 0 ? t('toast.prefillSkipped', { count: skipped.length }) : '',
      }),
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
        pushToast(
          t('toast.copied', { date: shortDate(key), hours: dayTotal(record).toFixed(1) }),
          'ok',
        );
        return;
      }
    }
    pushToast(t('toast.noPrevious'), 'warn');
  };

  const clearDay = () => {
    setDraft(blankDay(selectedKey, draft.location, draft.target > 0 ? draft.target : state.defaultTarget));
    setDirty(true);
    setIssues([]);
    pushToast(t('toast.cleared'), 'warn');
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

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <img src={mindigitalMark} alt="" />
          </div>
          <div className="brand-text">
            <h1>{t('app.title')}</h1>
            <p>{t('app.subtitle')}</p>
          </div>
        </div>

        <div className="topbar-right">
          {page === 'timesheet' ? (
            <div className="seg" role="tablist" aria-label={t('app.day')}>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'day'}
                className={mode === 'day' ? 'is-active' : undefined}
                onClick={() => setMode('day')}
              >
                <Icon.List size={14} />
                {t('app.day')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'month'}
                className={mode === 'month' ? 'is-active' : undefined}
                onClick={() => setMode('month')}
              >
                <Icon.Grid size={14} />
                {t('app.month')}
              </button>
            </div>
          ) : null}

          <div className="seg seg-lang" role="group" aria-label={t('app.lang')}>
            <button
              type="button"
              className={lang === 'zh' ? 'is-active' : undefined}
              onClick={() => setLang('zh')}
            >
              中文
            </button>
            <button
              type="button"
              className={lang === 'en' ? 'is-active' : undefined}
              onClick={() => setLang('en')}
            >
              EN
            </button>
          </div>

          <button
            type="button"
            className="icon-btn nav-btn"
            aria-label={page === 'admin' ? t('nav.timesheet') : t('nav.admin')}
            title={page === 'admin' ? t('nav.timesheet') : t('nav.admin')}
            onClick={() => setPage(page === 'admin' ? 'timesheet' : 'admin')}
          >
            {page === 'admin' ? <Icon.ChevronLeft size={16} /> : <Icon.Settings size={16} />}
          </button>

          <div className="user-chip">
            <span className="avatar">吕</span>
            <div>
              <strong>吕薇庆</strong>
              <span>{t('app.role')}</span>
            </div>
          </div>
        </div>
      </header>

      {page === 'timesheet' ? (
        <div className="banner">
          <div className="banner-left">
            <span className="banner-dot" aria-hidden="true" />
            <strong>{t('banner.reminder')}</strong>
            <span>{t('banner.text')}</span>
          </div>
          <div className="banner-right">
            {t('banner.period', { month: formatMonth(view.y, view.m, lang), hours: '8.0' })}
          </div>
        </div>
      ) : null}

      {page === 'admin' ? (
        <main className="admin-main">
          <AdminPage
            config={config}
            activities={activities}
            days={state.days}
            year={view.y}
            month={view.m}
            onChange={applyConfig}
            onBack={() => setPage('timesheet')}
          />
        </main>
      ) : null}

      <main className="layout" style={{ display: page === 'admin' ? 'none' : undefined }}>
        <Calendar
          year={view.y}
          month={view.m}
          selectedKey={selectedKey}
          todayKey={todayKey}
          editableFrom={editableFrom}
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
              activities={activities}
              status={statusOf(draft)}
              dirty={dirty}
              issues={issues.map((issue) => t(issue.key, issue.vars))}
              onChange={patchDraft}
              onLineChange={patchLine}
              onAddLine={addLine}
              onRemoveLine={removeLine}
              onSave={saveDay}
              onPrefill={prefillWeek}
              onCopyLast={copyLastDay}
              onClear={clearDay}
            />
            <div className="insights">
              <WeekStrip
                selectedKey={selectedKey}
                editableFrom={editableFrom}
                days={state.days}
                onSelect={selectDate}
              />
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
              <WeekStrip
                selectedKey={selectedKey}
                editableFrom={editableFrom}
                days={state.days}
                onSelect={selectDate}
              />
              <ActivityMix year={view.y} month={view.m} days={state.days} />
            </div>
          </div>
        )}
      </main>

      <footer className="page-foot" style={{ display: page === 'admin' ? 'none' : undefined }}>
        <span>{t('foot.note')}</span>
        <span className="kbd-hints">
          <kbd>←</kbd>
          <kbd>→</kbd> {t('foot.changeDay')}
          <span className="dot">·</span>
          <kbd>⌘</kbd>
          <kbd>S</kbd> {t('foot.save')}
        </span>
      </footer>

      <Toast toast={toast} />

      {pending ? (
        <Modal
          title={t('discard.title')}
          subtitle={t('discard.subtitle', { date: shortDate(selectedKey) })}
          width={460}
          onClose={() => setPending(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>
                {t('btn.keepEditing')}
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
                {t('btn.discard')}
              </button>
            </>
          }
        >
          <p className="modal-copy">{t('discard.body', { action: pending.label })}</p>
        </Modal>
      ) : null}

      {futureKey ? (
        <Modal
          title={t('future.title')}
          subtitle={shortDate(futureKey)}
          width={460}
          onClose={() => setFutureKey(null)}
          footer={
            <button type="button" className="btn btn-blue" onClick={() => setFutureKey(null)}>
              {t('future.confirm')}
            </button>
          }
        >
          <p className="modal-copy">{t('future.body', { date: shortDate(futureKey) })}</p>
        </Modal>
      ) : null}

      {approvalKey ? (
        <Modal
          title={t('approval.title')}
          subtitle={t('approval.subtitle', { date: shortDate(approvalKey) })}
          width={480}
          onClose={() => setApprovalKey(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setApprovalKey(null)}>
                {t('btn.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-blue"
                onClick={() => {
                  setApprovalKey(null);
                  pushToast(t('toast.approval'), 'ok');
                }}
              >
                {t('approval.confirm')}
              </button>
            </>
          }
        >
          <p className="modal-copy">{t('approval.body', { date: shortDate(approvalKey) })}</p>
        </Modal>
      ) : null}

    </div>
  );
}
