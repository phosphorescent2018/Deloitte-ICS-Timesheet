import { useEffect, useState } from 'react';
import ActivityPicker from './ActivityPicker';
import { useI18n, formatLongDate } from './i18n';
import { locationLabel, type LocationOption } from './lib/catalog';
import type { ActivityCode } from './lib/config';
import { fromKey, isoWeek, shortDate, timeLabel } from './lib/date';
import { DAILY_MAX_HOURS, type ActivityLine, type DayRecord, type DayStatus } from './lib/model';
import { Icon, StatusPill } from './ui';

interface Props {
  draft: DayRecord;
  activities: ActivityCode[];
  locations: LocationOption[];
  status: DayStatus;
  dirty: boolean;
  issues: string[];
  onChange: (patch: Partial<DayRecord>) => void;
  onLineChange: (id: string, patch: Partial<ActivityLine>) => void;
  onAddLine: () => void;
  onRemoveLine: (id: string) => void;
  onSave: () => void;
  onPrefill: () => void;
  onCopyLast: () => void;
  onClear: () => void;
}

export default function DayEditor({
  draft,
  activities,
  locations,
  status,
  dirty,
  issues,
  onChange,
  onLineChange,
  onAddLine,
  onRemoveLine,
  onSave,
  onPrefill,
  onCopyLast,
  onClear,
}: Props) {
  const { t, lang } = useI18n();
  const [hourText, setHourText] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyActivity = async (line: ActivityLine) => {
    if (!line.code) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(line.code);
      ok = true;
    } catch {
      try {
        const area = document.createElement('textarea');
        area.value = line.code;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        ok = document.execCommand('copy');
        area.remove();
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopiedId(line.id);
      window.setTimeout(() => setCopiedId((current) => (current === line.id ? null : current)), 1200);
    }
  };

  useEffect(() => {
    setHourText({});
  }, [draft.date]);

  const commitHours = (id: string, raw: string) => {
    setHourText((prev) => ({ ...prev, [id]: raw }));
    if (raw.trim() === '') {
      onLineChange(id, { hours: 0 });
      return;
    }
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) {
      onLineChange(id, {
        hours: Math.min(DAILY_MAX_HOURS, Math.max(-DAILY_MAX_HOURS, Math.round(parsed * 100) / 100)),
      });
    }
  };

  return (
    <section className="card editor">
      <header className="editor-top">
        <div className="editor-title">
          <span className="editor-kicker">{t('editor.kicker')}</span>
          <h2>{formatLongDate(draft.date, lang)}</h2>
          <span className="editor-sub">
            {shortDate(draft.date)} · {t('cal.week', { week: isoWeek(fromKey(draft.date)) })}
          </span>
        </div>
        <div className="editor-top-right">
          <StatusPill status={status} />
          <button type="button" className="link-btn" onClick={onClear}>
            {t('editor.clear')}
          </button>
        </div>
      </header>

      <div className="sheet">
        <div className="sheet-head">
          <div className="sh-activity">{t('th.activity')}</div>
          <div className="sh-date">{shortDate(draft.date)}</div>
          <div className="sh-remark">{t('th.remark')}</div>
          <div className="sh-op">{t('th.operation')}</div>
        </div>

        <div className="sheet-row">
          <div className="cell-label">{t('field.workLocation')}</div>
          <div className="cell-value">
            <div className="select-wrap">
              <select
                value={draft.location}
                onChange={(event) => onChange({ location: event.target.value })}
                aria-label={t('field.workLocation')}
              >
                {!locations.some((option) => option.value === draft.location) ? (
                  <option value={draft.location}>
                    {locationLabel(draft.location, lang, locations)}
                  </option>
                ) : null}
                {locations.map((option) => (
                  <option key={option.value} value={option.value}>
                    {lang === 'zh' ? option.labelZh : option.label}
                  </option>
                ))}
              </select>
              <Icon.ChevronDown size={14} />
            </div>
          </div>
          <div className="cell-empty" />
          <div className="cell-empty" />
        </div>

        <div className="sheet-divider" />

        {draft.lines.map((line, index) => {
          return (
            <div className="sheet-row line-row" key={line.id}>
              <div className="cell-activity">
                <ActivityPicker
                  value={line.code}
                  activities={activities}
                  onChange={(code) => onLineChange(line.id, { code })}
                  invalid={line.hours > 0 && !line.code}
                />
                <button
                  type="button"
                  className={`copy-activity${line.code ? '' : ' is-hidden'}${
                    copiedId === line.id ? ' is-done' : ''
                  }`}
                  title={copiedId === line.id ? t('btn.copied') : t('btn.copyActivity')}
                  aria-label={copiedId === line.id ? t('btn.copied') : t('btn.copyActivity')}
                  onClick={() => copyActivity(line)}
                  tabIndex={line.code ? 0 : -1}
                >
                  {copiedId === line.id ? <Icon.Check size={14} /> : <Icon.Copy size={14} />}
                </button>
              </div>
              <div className="cell-value">
                <div className="hours-field">
                  <input
                    className="input input-num"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.0"
                    value={hourText[line.id] ?? (line.hours === 0 ? '' : String(line.hours))}
                    onChange={(event) => commitHours(line.id, event.target.value)}
                    aria-label={t('field.hoursAria', { n: index + 1 })}
                  />
                  <span className="unit">h</span>
                </div>
              </div>
              <div className="cell-value">
                <input
                  className="input"
                  value={line.remark}
                  placeholder={t('field.remarkPlaceholder')}
                  onChange={(event) => onLineChange(line.id, { remark: event.target.value })}
                  aria-label={t('field.remarkAria', { n: index + 1 })}
                />
              </div>
              <div className="cell-ops">
                <button
                  type="button"
                  className="icon-btn icon-btn-danger"
                  title={t('btn.removeLine')}
                  onClick={() => onRemoveLine(line.id)}
                >
                  <Icon.Minus size={16} />
                </button>
              </div>
            </div>
          );
        })}

        {draft.lines.length === 0 ? <div className="lines-empty">{t('empty.lines')}</div> : null}

        <div className="sheet-add">
          <button type="button" className="add-line" onClick={onAddLine} title={t('btn.addLine')}>
            <Icon.Plus size={16} />
          </button>
          <span>{t('btn.addLine')}</span>
        </div>
      </div>

      {issues.length > 0 ? (
        <div className="editor-alert" role="alert">
          <Icon.Alert size={15} />
          <ul>
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <footer className="editor-foot">
        <div className="foot-meta">
          <Icon.Clock size={14} />
          <span>
            {draft.savedAt ? t('foot.lastSaved', { time: timeLabel(draft.savedAt) }) : t('foot.notSaved')}
          </span>
          {dirty ? <span className="dirty-flag">{t('foot.unsaved')}</span> : null}
        </div>
        <div className="foot-actions">
          <button type="button" className="btn btn-blue" onClick={onPrefill}>
            <Icon.CalendarPlus size={15} />
            {t('btn.prefill')}
          </button>
          <button type="button" className="btn btn-blue" onClick={onCopyLast}>
            <Icon.Copy size={15} />
            {t('btn.copyLast')}
          </button>
          <button type="button" className="btn btn-blue btn-primary" onClick={onSave}>
            <Icon.Save size={15} />
            {t('btn.save')}
          </button>
        </div>
      </footer>
    </section>
  );
}
