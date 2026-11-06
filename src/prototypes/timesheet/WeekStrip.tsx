import { formatWeekRange, useI18n, weekdayLabels } from './i18n';
import { addDays, fromKey, isLockedKey, isoWeek, shortDate, startOfWeekMonday, toKey } from './lib/date';
import { isWorkday } from './lib/holidays';
import { dayTotal, statusOf, type DayRecord } from './lib/model';
import { Icon } from './ui';

interface Props {
  selectedKey: string;
  editableFrom: string;
  days: Record<string, DayRecord>;
  onSelect: (key: string) => void;
}

export default function WeekStrip({ selectedKey, editableFrom, days, onSelect }: Props) {
  const { t, lang } = useI18n();
  const todayKey = toKey(new Date());
  const monday = startOfWeekMonday(fromKey(selectedKey));
  const week = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const total = week.reduce((sum, date) => sum + dayTotal(days[toKey(date)]), 0);
  const workdays = week.filter((date) => isWorkday(date)).length;
  const filled = week.filter((date) => isWorkday(date) && dayTotal(days[toKey(date)]) > 0).length;

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
          const locked = isLockedKey(key, todayKey);
          const unfilled =
            !locked && key >= editableFrom && key <= todayKey && status === 'empty' && isWorkday(date);
          return (
            <button
              key={key}
              type="button"
              className={`ws-day is-${status}${locked ? ' is-locked' : ''}${unfilled ? ' is-unfilled' : ''}${
                key === selectedKey ? ' is-selected' : ''
              }${key === todayKey ? ' is-today' : ''}`}
              onClick={() => onSelect(key)}
            >
              <span className="ws-label">{weekdayLabels(lang)[date.getDay()]}</span>
              <strong className="ws-date">{shortDate(key)}</strong>
              <span className="ws-hours">{hours > 0 ? `${hours.toFixed(1)} h` : '—'}</span>
              <span className="ws-bar" aria-hidden="true">
                <i style={{ width: `${Math.min(100, (hours / 10) * 100)}%` }} />
              </span>
              {locked ? (
                <span className="ws-lock" aria-hidden="true">
                  <Icon.Lock size={10} />
                </span>
              ) : key === todayKey ? (
                <span className="ws-today-dot" aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="ws-foot">
        <span>{t('ws.filled', { filled, workdays })}</span>
        <span>{t('ws.remaining', { hours: Math.max(0, 40 - total).toFixed(1) })}</span>
      </div>
    </section>
  );
}
