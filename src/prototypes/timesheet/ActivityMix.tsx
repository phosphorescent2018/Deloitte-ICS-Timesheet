import { useI18n } from './i18n';
import { findActivity } from './lib/catalog';
import { daysInMonth, toKey } from './lib/date';
import { type DayRecord } from './lib/model';

interface Props {
  year: number;
  month: number;
  days: Record<string, DayRecord>;
}

export default function ActivityMix({ year, month, days }: Props) {
  const { t, lang } = useI18n();
  const totals = new Map<string, number>();
  const total = daysInMonth(year, month);

  for (let day = 1; day <= total; day += 1) {
    const record = days[toKey(new Date(year, month, day))];
    record?.lines.forEach((line) => {
      if (!line.code || line.hours <= 0) return;
      totals.set(line.code, (totals.get(line.code) ?? 0) + line.hours);
    });
  }

  const rows = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const max = rows[0]?.[1] ?? 1;
  const sum = Array.from(totals.values()).reduce((acc, value) => acc + value, 0);

  return (
    <section className="card mix-card">
      <header className="mix-head">
        <div>
          <span className="editor-kicker">{t('mix.kicker')}</span>
        </div>
        <div className="mix-total">
          <strong>{sum.toFixed(1)} h</strong>
          <span>{t('mix.month')}</span>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="mix-empty">{t('mix.empty')}</p>
      ) : (
        <ul className="mix-list">
          {rows.map(([code, hours]) => {
            const activity = findActivity(code);
            return (
              <li key={code}>
                <div className="mix-line">
                  <span className="mix-code">{code}</span>
                  <span className="mix-hours">{hours.toFixed(1)} h</span>
                </div>
                <div className="mix-bar">
                  <i style={{ width: `${Math.max(6, (hours / max) * 100)}%` }} />
                </div>
                <span className="mix-name">
                  {activity ? (lang === 'zh' ? activity.nameZh : activity.name) : code}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
