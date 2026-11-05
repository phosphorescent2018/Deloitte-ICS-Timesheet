import { formatMonth, useI18n, weekdayLabels } from './i18n';
import { dayTotal, statusOf, type DayRecord, type MonthStats } from './lib/model';
import { fromKey, isWeekend, isoWeek, monthGrid, shortDate, toKey } from './lib/date';
import { Icon } from './ui';

interface Props {
  year: number;
  month: number;
  selectedKey: string;
  todayKey: string;
  editableFrom: string;
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
  editableFrom,
  days,
  stats,
  onSelect,
  onPrev,
  onNext,
  onToday,
}: Props) {
  const { t, lang } = useI18n();
  const grid = monthGrid(year, month);

  return (
    <section className="card calendar">
      <header className="cal-head">
        <div>
          <h2>{formatMonth(year, month, lang)}</h2>
          <p className="cal-sub">{t('cal.week', { week: isoWeek(fromKey(selectedKey)) })}</p>
        </div>
        <div className="cal-nav">
          <button type="button" className="icon-btn" onClick={onPrev} aria-label={t('cal.prev')}>
            <Icon.ChevronLeft size={16} />
          </button>
          <button type="button" className="btn btn-mini" onClick={onToday}>
            {t('cal.today')}
          </button>
          <button type="button" className="icon-btn" onClick={onNext} aria-label={t('cal.next')}>
            <Icon.ChevronRight size={16} />
          </button>
        </div>
      </header>

      <div className="cal-weekdays">
        {weekdayLabels(lang).map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="cal-grid">
        {grid.map((date) => {
          const key = toKey(date);
          const record = days[key];
          const total = dayTotal(record);
          const status = statusOf(record);
          const locked = key < editableFrom;
          const classes = ['cal-day'];

          if (date.getMonth() !== month) classes.push('is-out');
          if (isWeekend(date)) classes.push('is-weekend');
          if (status === 'complete') classes.push('is-done');
          if (status === 'partial') classes.push('is-partial');
          const inEditableWindow = key >= editableFrom && key <= todayKey;
          if (status === 'empty' && inEditableWindow && !isWeekend(date)) classes.push('is-unfilled');
          if (status === 'empty' && key < todayKey && !isWeekend(date)) classes.push('is-past-empty');
          if (locked) classes.push('is-locked');
          if (key === todayKey) classes.push('is-today');
          if (key === selectedKey) classes.push('is-selected');

          const title = locked
            ? t('cal.cellLocked', { date: shortDate(key) })
            : total > 0
              ? t('cal.cell', {
                  date: shortDate(key),
                  hours: total.toFixed(1),
                })
              : t('cal.cellEmpty', { date: shortDate(key) });

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
              {locked ? (
                <span className="cal-lock" aria-hidden="true">
                  <Icon.Lock size={9} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="cal-legend">
        <span className="legend-item">
          <i className="swatch swatch-empty" /> {t('legend.unfinished')}
        </span>
        <span className="legend-item">
          <i className="swatch swatch-partial" /> {t('legend.partial')}
        </span>
        <span className="legend-item">
          <i className="swatch swatch-done" /> {t('legend.completed')}
        </span>
        <span className="legend-item">
          <i className="swatch swatch-today" /> {t('legend.today')}
        </span>
        <span className="legend-item">
          <i className="swatch swatch-selected" /> {t('legend.selected')}
        </span>
        <span className="legend-item">
          <i className="swatch swatch-locked" /> {t('legend.locked')}
        </span>
      </div>

      <div className="cal-stats">
        <div className="cal-stat">
          <span>{t('cal.filled')}</span>
          <strong>
            {stats.filledDays}
            <em>/{stats.workdays}</em>
          </strong>
        </div>
        <div className="cal-stat">
          <span>{t('cal.hours')}</span>
          <strong>{stats.hours.toFixed(1)}</strong>
        </div>
      </div>
    </section>
  );
}
