import {
  WEEKDAYS_SHORT,
  addDays,
  fromKey,
  isoWeek,
  monthShort,
  shortDate,
  startOfWeekMonday,
  toKey,
} from './lib/date';
import { dayTotal, isOtDay, overtimeHours, statusOf, type DayRecord } from './lib/model';

interface Props {
  selectedKey: string;
  days: Record<string, DayRecord>;
  onSelect: (key: string) => void;
}

export default function WeekStrip({ selectedKey, days, onSelect }: Props) {
  const monday = startOfWeekMonday(fromKey(selectedKey));
  const week = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const total = week.reduce((sum, date) => sum + dayTotal(days[toKey(date)]), 0);
  const filled = week
    .slice(0, 5)
    .filter((date) => dayTotal(days[toKey(date)]) > 0).length;
  const overtime = week.reduce((sum, date) => {
    const record = days[toKey(date)];
    return sum + (record ? overtimeHours(record) : 0);
  }, 0);

  return (
    <section className="card week-strip" aria-label="Week at a glance">
      <header className="ws-head">
        <div>
          <span className="editor-kicker">Week at a glance</span>
          <h3>
            Week {isoWeek(monday)} · {monthShort(monday.getMonth())} {monday.getDate()} –{' '}
            {monthShort(week[6].getMonth())} {week[6].getDate()}
          </h3>
        </div>
        <div className="ws-total">
          <strong>{total.toFixed(1)} h</strong>
          <span>/ 40 h target</span>
        </div>
      </header>

      <div className="ws-grid">
        {week.map((date) => {
          const key = toKey(date);
          const record = days[key];
          const hours = dayTotal(record);
          const status = statusOf(record);
          return (
            <button
              key={key}
              type="button"
              className={`ws-day is-${status}${key === selectedKey ? ' is-selected' : ''}`}
              onClick={() => onSelect(key)}
            >
              <span className="ws-label">{WEEKDAYS_SHORT[date.getDay()]}</span>
              <strong className="ws-date">{shortDate(key)}</strong>
              <span className="ws-hours">{hours > 0 ? `${hours.toFixed(1)} h` : '—'}</span>
              <span className="ws-bar" aria-hidden="true">
                <i style={{ width: `${Math.min(100, (hours / 10) * 100)}%` }} />
              </span>
              {isOtDay(record) ? <span className="ws-ot">OT</span> : null}
            </button>
          );
        })}
      </div>

      <div className="ws-foot">
        <span>
          {filled} of 5 weekdays filled
        </span>
        <span>OT {overtime.toFixed(1)} h</span>
        <span>Remaining {Math.max(0, 40 - total).toFixed(1)} h</span>
      </div>
    </section>
  );
}
