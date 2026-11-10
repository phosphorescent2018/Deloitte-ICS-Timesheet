import { formatMonth, useI18n, weekdayLabels } from './i18n';
import { dayTotal, statusOf, type DayRecord } from './lib/model';
import { addDays, fromKey, isLockedKey, isWeekend, isoWeek, monthGrid, shortDate, startOfWeekMonday, toKey } from './lib/date';
import { holidayInfo, isWorkday, makeupWorkdayInfo } from './lib/holidays';
import { Icon } from './ui';

interface Props {
  year: number;
  month: number;
  selectedKey: string;
  todayKey: string;
  editableFrom: string;
  days: Record<string, DayRecord>;
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
  onSelect,
  onPrev,
  onNext,
  onToday,
}: Props) {
  const { t, lang } = useI18n();
  const grid = monthGrid(year, month);
  const weekStart = startOfWeekMonday(fromKey(selectedKey));
  const workdaysInWeek = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)).filter((date) =>
    isWorkday(date),
  ).length;

  return (
    <section className="card calendar">
      <header className="cal-head">
        <div>
          <h2>{formatMonth(year, month, lang)}</h2>
          <p className="cal-sub">{t('cal.week', { week: isoWeek(fromKey(selectedKey)), days: workdaysInWeek })}</p>
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
          const locked = isLockedKey(key, todayKey);
          const holiday = holidayInfo(key);
          const makeup = makeupWorkdayInfo(key);
          const weekend = isWeekend(date) && !makeup;
          const classes = ['cal-day'];

          if (date.getMonth() !== month) classes.push('is-out');
          if (weekend) classes.push('is-weekend');
          if (holiday) classes.push('is-holiday');
          if (makeup) classes.push('is-makeup');
          if (status === 'complete') classes.push('is-done');
          if (status === 'partial') classes.push('is-partial');
          const inEditableWindow = key >= editableFrom && key <= todayKey;
          if (status === 'empty' && inEditableWindow && isWorkday(date)) classes.push('is-unfilled');
          if (status === 'empty' && key < todayKey && isWorkday(date)) classes.push('is-past-empty');
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
              {holiday ? (
                <span className="cal-day-tag is-holiday" title={lang === 'zh' ? holiday.nameZh : holiday.nameEn}>
                  休
                </span>
              ) : makeup ? (
                <span className="cal-day-tag is-makeup" title={lang === 'zh' ? makeup.nameZh : makeup.nameEn}>
                  班
                </span>
              ) : null}
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
        <span className="legend-item">
          <i className="swatch swatch-makeup" /> {t('legend.makeup')}
        </span>
      </div>
    </section>
  );
}
