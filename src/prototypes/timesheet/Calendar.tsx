import { dayTotal, isOtDay, statusOf, type DayRecord, type MonthStats } from './lib/model';
import {
  WEEKDAYS_SHORT,
  fromKey,
  isWeekend,
  isoWeek,
  monthLabel,
  monthGrid,
  shortDate,
  toKey,
} from './lib/date';
import { Icon } from './ui';

interface Props {
  year: number;
  month: number;
  selectedKey: string;
  todayKey: string;
  days: Record<string, DayRecord>;
  stats: MonthStats;
  onSelect: (key: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export default function Calendar({
  year,
  month,
  selectedKey,
  todayKey,
  days,
  stats,
  onSelect,
  onPrev,
  onNext,
  onToday,
}: Props) {
  const grid = monthGrid(year, month);

  return (
    <section className="card calendar" aria-label="Month calendar">
      <header className="cal-head">
        <div>
          <h2>{monthLabel(year, month)}</h2>
          <p className="cal-sub">Week {isoWeek(fromKey(selectedKey))} · 5 working days</p>
        </div>
        <div className="cal-nav">
          <button type="button" className="icon-btn" onClick={onPrev} aria-label="Previous month">
            <Icon.ChevronLeft size={16} />
          </button>
          <button type="button" className="btn btn-mini" onClick={onToday}>
            Today
          </button>
          <button type="button" className="icon-btn" onClick={onNext} aria-label="Next month">
            <Icon.ChevronRight size={16} />
          </button>
        </div>
      </header>

      <div className="cal-weekdays">
        {WEEKDAYS_SHORT.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="cal-grid">
        {grid.map((date) => {
          const key = toKey(date);
          const record = days[key];
          const total = dayTotal(record);
          const status = statusOf(record);
          const overtime = isOtDay(record);
          const classes = ['cal-day'];

          if (date.getMonth() !== month) classes.push('is-out');
          if (isWeekend(date)) classes.push('is-weekend');
          if (status === 'complete') classes.push('is-done');
          if (status === 'partial') classes.push('is-partial');
          if (status === 'empty' && key < todayKey && !isWeekend(date)) classes.push('is-past-empty');
          if (key === todayKey) classes.push('is-today');
          if (key === selectedKey) classes.push('is-selected');

          const title = `${shortDate(key)} · ${total > 0 ? `${total.toFixed(1)} h` : 'no entry'}${
            overtime ? ' · OT' : ''
          }`;

          return (
            <button
              key={key}
              type="button"
              className={classes.join(' ')}
              onClick={() => onSelect(key)}
              title={title}
              aria-label={title}
              aria-pressed={key === selectedKey}
            >
              <span className="cal-num">{date.getDate()}</span>
              {overtime ? <span className="cal-ot-dot" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>

      <div className="cal-legend">
        <span className="legend-item">
          <i className="swatch swatch-empty" /> Unfinished
        </span>
        <span className="legend-item">
          <i className="swatch swatch-partial" /> Partial
        </span>
        <span className="legend-item">
          <i className="swatch swatch-done" /> Completed
        </span>
        <span className="legend-item">
          <i className="swatch swatch-ot" /> OT
        </span>
        <span className="legend-item">
          <i className="swatch swatch-today" /> Today
        </span>
        <span className="legend-item">
          <i className="swatch swatch-selected" /> Selected
        </span>
      </div>

      <div className="cal-stats">
        <div className="cal-stat">
          <span>Filled</span>
          <strong>
            {stats.filledDays}
            <em>/{stats.workdays}</em>
          </strong>
        </div>
        <div className="cal-stat">
          <span>Hours</span>
          <strong>{stats.hours.toFixed(1)}</strong>
        </div>
        <div className="cal-stat">
          <span>OT</span>
          <strong className={stats.overtime > 0 ? 'is-ot' : undefined}>{stats.overtime.toFixed(1)}</strong>
        </div>
      </div>
    </section>
  );
}
