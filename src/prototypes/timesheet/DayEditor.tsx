import ActivityPicker from './ActivityPicker';
import { useI18n, formatLongDate } from './i18n';
import { findActivity, locationLabel, LOCATIONS } from './lib/catalog';
import { fromKey, isoWeek, shortDate, timeLabel } from './lib/date';
import { dayTotal, type ActivityLine, type DayRecord, type DayStatus } from './lib/model';
import { Icon, StatusPill } from './ui';

interface Props {
  draft: DayRecord;
  status: DayStatus;
  dirty: boolean;
  issues: string[];
  onChange: (patch: Partial<DayRecord>) => void;
  onLineChange: (id: string, patch: Partial<ActivityLine>) => void;
  onAddLine: () => void;
  onRemoveLine: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onSave: () => void;
  onPrefill: () => void;
  onCopyLast: () => void;
  onClear: () => void;
}

function toHours(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(24, Math.max(0, Math.round(parsed * 100) / 100));
}

export default function DayEditor({
  draft,
  status,
  dirty,
  issues,
  onChange,
  onLineChange,
  onAddLine,
  onRemoveLine,
  onOpenDetail,
  onSave,
  onPrefill,
  onCopyLast,
  onClear,
}: Props) {
  const { t, lang } = useI18n();
  const total = dayTotal(draft);

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
          <div className="sh-client">{t('th.client')}</div>
          <div className="sh-date">{shortDate(draft.date)}</div>
          <div className="sh-remark">{t('th.remark')}</div>
          <div className="sh-op">{t('th.operation')}</div>
        </div>

        <div className="sheet-row">
          <div className="cell-label span2">{t('field.workLocation')}</div>
          <div className="cell-value">
            <div className="select-wrap">
              <select
                value={draft.location}
                onChange={(event) => onChange({ location: event.target.value })}
                aria-label={t('field.workLocation')}
              >
                {LOCATIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {locationLabel(option.value, lang)}
                  </option>
                ))}
              </select>
              <Icon.ChevronDown size={14} />
            </div>
          </div>
          <div className="cell-empty" />
          <div className="cell-empty" />
        </div>

        <div className="sheet-row">
          <div className="cell-label span2">{t('field.targetHours')}</div>
          <div className="cell-value">
            <div className="hours-field">
              <input
                className="input input-num"
                type="number"
                min={0}
                max={24}
                step={0.5}
                value={draft.target}
                onChange={(event) => onChange({ target: toHours(event.target.value) })}
                aria-label={t('field.targetHours')}
              />
              <span className="unit">h</span>
            </div>
          </div>
          <div className="cell-empty" />
          <div className="cell-empty" />
        </div>

        <div className="sheet-row sheet-row-total">
          <div className="cell-label span2">{t('field.totalHours')}</div>
          <div className="cell-value">
            <span className="total-value">{total.toFixed(1)}</span>
          </div>
          <div className="cell-empty" />
          <div className="cell-empty" />
        </div>

        <div className="sheet-divider" />

        {draft.lines.map((line, index) => {
          const activity = findActivity(line.code);
          return (
            <div className="sheet-row line-row" key={line.id}>
              <div className="cell-activity">
                <ActivityPicker
                  value={line.code}
                  onChange={(code) => onLineChange(line.id, { code })}
                  invalid={line.hours > 0 && !line.code}
                />
              </div>
              <div className="cell-client">
                {activity ? (
                  <span className="client-name">{lang === 'zh' ? activity.clientZh : activity.client}</span>
                ) : (
                  <span className="muted">—</span>
                )}
              </div>
              <div className="cell-value">
                <div className="hours-field">
                  <input
                    className="input input-num"
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    placeholder="0.0"
                    value={line.hours === 0 ? '' : line.hours}
                    onChange={(event) => onLineChange(line.id, { hours: toHours(event.target.value) })}
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
                  className="icon-btn"
                  title={t('detail.title')}
                  onClick={() => onOpenDetail(line.id)}
                >
                  <Icon.FileText size={17} />
                </button>
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
            {' · '}
            {t('foot.summary', { total: total.toFixed(1), target: draft.target.toFixed(1) })}
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
