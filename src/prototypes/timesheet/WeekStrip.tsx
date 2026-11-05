import { formatWeekRange, useI18n, weekdayLabels } from './i18n';
import { addDays, fromKey, isoWeek, shortDate, startOfWeekMonday, toKey } from './lib/date';
import { dayTotal, isOtDay, overtimeHours, statusOf, type DayRecord } from './lib/model';

interface Props {
  selectedKey: string;
  days: Record<string, DayRecord>;
  onSelect: (key: string) => void;
}

export default function WeekStrip({ selectedKey, days, onSelect }: Props) {
  const { t, lang } = useI18n();
  const monday = startOfWeekMonday(fromKey(selectedKey));
  const week = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const total = week.reduce((sum, date) => sum + dayTotal(days[toKey(date)]), 0);
  const filled = week.slice(0, 5).filter((date) => dayTotal(days[toKey(date)]) > 0).length;
  const overtime = week.reduce((sum, date) => {
    const record = days[toKey(date)];
    return sum + (record ? overtimeHours(record) : 0);
  }, 0);

  return (
    <section className="card week-strip">
      <header className="ws-head">
        <div>
          <span className="editor-kicker">{t('ws.kicker')}</span>
          <h3>
            {t('ws.title', {
              week: isoWeek(monday),
              range: formatWeekRange(monday, week[6], lang),
            })}
          </h3>
        </div>
        <div className="ws-total">
          <strong>{total.toFixed(1)} h</strong>
          <span>{t('ws.target')}</span>
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
              <span className="ws-label">{weekdayLabels(lang)[date.getDay()]}</span>
              <strong className="ws-date">{shortDate(key)}</strong>
              <span className="ws-hours">{hours > 0 ? `${hours.toFixed(1)} h` : '—'}</span>
              <span className="ws-bar" aria-hidden="true">
                <i style={{ width: `${Math.min(100, (hours / 10) * 100)}%` }} />
              </span>
              {isOtDay(record) ? <span className="ws-ot">{t('legend.ot')}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="ws-foot">
        <span>{t('ws.filled', { filled })}</span>
        <span>{t('ws.ot', { hours: overtime.toFixed(1) })}</span>
        <span>{t('ws.remaining', { hours: Math.max(0, 40 - total).toFixed(1) })}</span>
      </div>
    </section>
  );
}
