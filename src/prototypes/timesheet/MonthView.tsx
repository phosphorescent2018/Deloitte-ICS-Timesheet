import { useI18n, formatWeekdayShort } from './i18n';
import { locationLabel, type LocationOption } from './lib/catalog';
import { daysInMonth, fromKey, isLockedKey, shortDate, toKey } from './lib/date';
import { isWorkday } from './lib/holidays';
import {
  dayTotal,
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
  locations: LocationOption[];
  onSelect: (key: string) => void;
}

export default function MonthView({ year, month, days, stats, locations, onSelect }: Props) {
  const { t, lang } = useI18n();
  const todayKey = toKey(new Date());
  const total = daysInMonth(year, month);
  const rows = Array.from({ length: total }, (_, index) => {
    const day = index + 1;
    const date = new Date(year, month, day);
    const key = toKey(date);
    return {
      key,
      weekday: formatWeekdayShort(key, lang),
      weekend: !isWorkday(fromKey(key)),
      locked: isLockedKey(key, todayKey),
      record: days[key],
    };
  });

  const completion = stats.workdays > 0 ? Math.round((stats.completeDays / stats.workdays) * 100) : 0;

  return (
    <section className="card month-view">
      <header className="mv-head">
        <div>
          <span className="editor-kicker">{t('mv.kicker')}</span>
          <h2>{t('mv.summary', { done: stats.completeDays, workdays: stats.workdays })}</h2>
          <p>{t('mv.hint')}</p>
        </div>
        <div className="mv-stats">
          <div className="mv-stat">
            <span>{t('mv.hours')}</span>
            <strong>{stats.hours.toFixed(1)}</strong>
          </div>
          <div className="mv-stat">
            <span>{t('mv.completion')}</span>
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
              <th>{t('th.date')}</th>
              <th>{t('th.weekday')}</th>
              <th>{t('th.location')}</th>
              <th>{t('th.activity')}</th>
              <th className="num">{t('mv.hours')}</th>
              <th>{t('th.status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, weekday, weekend, locked, record }) => {
              const status = statusOf(record);
              const totalHours = dayTotal(record);
              return (
                <tr
                  key={key}
                  className={`${record && totalHours > 0 ? 'has-entry' : 'no-entry'} ${weekend ? 'is-weekend' : ''}${
                    locked ? ' is-locked' : ''
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
                  <td className="cell-date">
                    {shortDate(key)}
                    {key === todayKey ? <span className="mv-today-dot" aria-hidden="true" /> : null}
                  </td>
                  <td className="cell-weekday">{weekday}</td>
                  <td>{record ? locationLabel(record.location, lang, locations) : '—'}</td>
                  <td className="cell-activities">
                    {record && record.lines.filter((line) => line.code).length > 0 ? (
                      <div className="activity-tags">
                        {record.lines
                          .filter((line) => line.code)
                          .slice(0, 2)
                          .map((line) => (
                            <span key={line.id} className="activity-tag" title={line.code}>
                              {line.code}
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
                  <td>
                    {locked ? (
                      <span className="mini-status is-locked">{t('status.locked')}</span>
                    ) : status === 'empty' && weekend ? (
                      <span className="muted">—</span>
                    ) : (
                      <span className={`mini-status is-${status}`}>{t(`status.${status}`)}</span>
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
