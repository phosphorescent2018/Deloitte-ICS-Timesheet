import { LOCATIONS } from './lib/catalog';
import { daysInMonth, shortDate, toKey, weekdayShort } from './lib/date';
import {
  dayTotal,
  isOtDay,
  overtimeHours,
  statusOf,
  type DayRecord,
  type MonthStats,
} from './lib/model';
import { Icon } from './ui';

interface Props {
  year: number;
  month: number;
  days: Record<string, DayRecord>;
  stats: MonthStats;
  onSelect: (key: string) => void;
}

function locationLabel(value: string): string {
  return LOCATIONS.find((option) => option.value === value)?.label ?? value;
}

export default function MonthView({ year, month, days, stats, onSelect }: Props) {
  const total = daysInMonth(year, month);
  const rows = Array.from({ length: total }, (_, index) => {
    const day = index + 1;
    const date = new Date(year, month, day);
    const key = toKey(date);
    return { key, day, weekday: weekdayShort(key), record: days[key] };
  });

  const completion = stats.workdays > 0 ? Math.round((stats.completeDays / stats.workdays) * 100) : 0;

  return (
    <section className="card month-view" aria-label="Month overview">
      <header className="mv-head">
        <div>
          <span className="editor-kicker">Month overview</span>
          <h2>
            {stats.completeDays} of {stats.workdays} working days completed
          </h2>
          <p>Click any row to open that day in the daily editor.</p>
        </div>
        <div className="mv-stats">
          <div className="mv-stat">
            <span>Hours</span>
            <strong>{stats.hours.toFixed(1)}</strong>
          </div>
          <div className="mv-stat">
            <span>OT</span>
            <strong className={stats.overtime > 0 ? 'is-ot' : undefined}>{stats.overtime.toFixed(1)}</strong>
          </div>
          <div className="mv-stat">
            <span>Completion</span>
            <strong>{completion}%</strong>
          </div>
          <div className="mv-progress">
            <span style={{ width: `${completion}%` }} />
          </div>
        </div>
      </header>

      <div className="mv-table-wrap">
        <table className="mv-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Day</th>
              <th>Location</th>
              <th>Activity</th>
              <th className="num">Hours</th>
              <th className="num">OT</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, weekday, record }) => {
              const status = statusOf(record);
              const totalHours = dayTotal(record);
              const overtime = record ? overtimeHours(record) : 0;
              return (
                <tr
                  key={key}
                  className={`${record && totalHours > 0 ? 'has-entry' : 'no-entry'} ${
                    weekday === 'Sa' || weekday === 'Su' ? 'is-weekend' : ''
                  }`}
                  onClick={() => onSelect(key)}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(key);
                    }
                  }}
                >
                  <td className="cell-date">{shortDate(key)}</td>
                  <td className="cell-weekday">{weekday}</td>
                  <td>{record ? locationLabel(record.location) : '—'}</td>
                  <td className="cell-activities">
                    {record && record.lines.filter((line) => line.code).length > 0 ? (
                      <div className="activity-tags">
                        {record.lines
                          .filter((line) => line.code)
                          .slice(0, 2)
                          .map((line) => (
                            <span key={line.id} className="activity-tag" title={line.code}>
                              {line.code.replace('ICS-GDC-', '')}
                            </span>
                          ))}
                        {record.lines.filter((line) => line.code).length > 2 ? (
                          <span className="activity-tag more">
                            +{record.lines.filter((line) => line.code).length - 2}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="num">{totalHours > 0 ? totalHours.toFixed(1) : '—'}</td>
                  <td className="num">
                    {isOtDay(record) ? <span className="ot-chip">{overtime.toFixed(1)}</span> : '—'}
                  </td>
                  <td>
                    {status === 'empty' && (weekday === 'Sa' || weekday === 'Su') ? (
                      <span className="muted">—</span>
                    ) : (
                      <span className={`mini-status is-${status}`}>
                        {status === 'complete' ? 'Completed' : status === 'partial' ? 'Partial' : 'Unfinished'}
                      </span>
                    )}
                  </td>
                  <td className="cell-open">
                    <Icon.ChevronRight size={15} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
