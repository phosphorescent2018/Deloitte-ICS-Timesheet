import ActivityPicker from './ActivityPicker';
import { findActivity, LOCATIONS } from './lib/catalog';
import { fromKey, isoWeek, longDate, shortDate, timeLabel } from './lib/date';
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
  const total = dayTotal(draft);

  return (
    <section className="card editor" aria-label="Daily timesheet entry">
      <header className="editor-top">
        <div className="editor-title">
          <span className="editor-kicker">Daily entry</span>
          <h2>{longDate(draft.date)}</h2>
          <span className="editor-sub">
            {shortDate(draft.date)} · Week {isoWeek(fromKey(draft.date))}
          </span>
        </div>
        <div className="editor-top-right">
          <StatusPill status={status} />
          <button type="button" className="link-btn" onClick={onClear}>
            Clear day
          </button>
        </div>
      </header>

      <div className="sheet">
        <div className="sheet-head">
          <div className="sh-activity">Activity</div>
          <div className="sh-client">Client Name</div>
          <div className="sh-date">{shortDate(draft.date)}</div>
          <div className="sh-remark">Remark</div>
          <div className="sh-op">Operation</div>
        </div>

        <div className="sheet-row">
          <div className="cell-label span2">Work Location</div>
          <div className="cell-value">
            <div className="select-wrap">
              <select
                value={draft.location}
                onChange={(event) => onChange({ location: event.target.value })}
                aria-label="Work location"
              >
                {LOCATIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
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
          <div className="cell-label span2">Target Hours</div>
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
                aria-label="Target hours"
              />
              <span className="unit">h</span>
            </div>
          </div>
          <div className="cell-empty" />
          <div className="cell-empty" />
        </div>

        <div className="sheet-row sheet-row-total">
          <div className="cell-label span2">Total Actual Hours</div>
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
                {activity ? <span className="client-name">{activity.client}</span> : <span className="muted">—</span>}
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
                    aria-label={`Line ${index + 1} hours`}
                  />
                  <span className="unit">h</span>
                </div>
              </div>
              <div className="cell-value">
                <input
                  className="input"
                  value={line.remark}
                  placeholder="Optional remark"
                  onChange={(event) => onLineChange(line.id, { remark: event.target.value })}
                  aria-label={`Line ${index + 1} remark`}
                />
              </div>
              <div className="cell-ops">
                <button
                  type="button"
                  className="icon-btn"
                  title="Activity details"
                  onClick={() => onOpenDetail(line.id)}
                >
                  <Icon.FileText size={17} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn-danger"
                  title="Remove line"
                  onClick={() => onRemoveLine(line.id)}
                >
                  <Icon.Minus size={16} />
                </button>
              </div>
            </div>
          );
        })}

        {draft.lines.length === 0 ? (
          <div className="lines-empty">No activity lines yet — add one to start filling this day.</div>
        ) : null}

        <div className="sheet-add">
          <button type="button" className="add-line" onClick={onAddLine} title="Add activity line">
            <Icon.Plus size={16} />
          </button>
          <span>Add activity line</span>
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
            {draft.savedAt ? `Last saved ${timeLabel(draft.savedAt)}` : 'Not saved yet'} ·{' '}
            {total.toFixed(1)} / {draft.target.toFixed(1)} h
          </span>
          {dirty ? <span className="dirty-flag">Unsaved changes</span> : null}
        </div>
        <div className="foot-actions">
          <button type="button" className="btn btn-blue" onClick={onPrefill}>
            <Icon.CalendarPlus size={15} />
            Prefill one week
          </button>
          <button type="button" className="btn btn-blue" onClick={onCopyLast}>
            <Icon.Copy size={15} />
            Copy last day
          </button>
          <button type="button" className="btn btn-blue btn-primary" onClick={onSave}>
            <Icon.Save size={15} />
            Save
          </button>
        </div>
      </footer>
    </section>
  );
}
