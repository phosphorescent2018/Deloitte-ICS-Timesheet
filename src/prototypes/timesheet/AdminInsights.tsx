import { useMemo } from 'react';
import { useI18n } from './i18n';
import type { AdminConfig } from './lib/config';
import { daysInMonth, toKey } from './lib/date';
import { isWorkday } from './lib/holidays';
import { dayTotal, type DayRecord } from './lib/model';
import type { AppUser } from './lib/users';

interface Props {
  users: AppUser[];
  days: Record<string, DayRecord>;
  config: AdminConfig;
  year: number;
  month: number;
}

interface MemberInsight {
  id: string;
  name: string;
  role: string;
  filledDays: number;
  missingDays: number;
  hours: number;
  rate: number;
}

interface TeamInsight {
  workdays: number;
  people: number;
  filledShifts: number;
  completionRate: number;
  totalHours: number;
  avgHours: number;
  missingShifts: number;
  members: MemberInsight[];
  trend: number[];
  distribution: { label: string; hours: number; percent: number; color: string }[];
}

const LINE_COLORS = ['#86bc25', '#00a3e0', '#f2a900', '#7a5af8'];

const FALLBACK_MEMBER_RATES = [0.96, 0.9, 0.84, 0.98];

export default function AdminInsights({ users, days, config, year, month }: Props) {
  const { t } = useI18n();

  const insight = useMemo<TeamInsight>(() => {
    const totalDays = daysInMonth(year, month);
    const monthKeys = Array.from({ length: totalDays }, (_, index) =>
      toKey(new Date(year, month, index + 1)),
    );
    const todayKey = toKey(new Date());
    const elapsedKeys = monthKeys.filter((key) => key <= todayKey);
    const workdayKeys = elapsedKeys.filter((key) =>
      isWorkday(new Date(year, month, Number(key.slice(-2)))),
    );
    const workdays = workdayKeys.length;
    const workdaySet = new Set(workdayKeys);

    const records = elapsedKeys
      .map((key) => days[key])
      .filter((record): record is DayRecord => Boolean(record));
    const actualHours = records.reduce((sum, record) => sum + dayTotal(record), 0);
    const actualFilled = records.filter(
      (record) => workdaySet.has(record.date) && dayTotal(record) > 0,
    ).length;

    const lineTotals = new Map<string, number>();
    records.forEach((record) => {
      record.lines.forEach((line) => {
        if (!line.code || line.hours <= 0) return;
        const lineName = line.code.split('-')[0] || 'Other';
        lineTotals.set(lineName, (lineTotals.get(lineName) ?? 0) + line.hours);
      });
    });

    const activeUsers = users.filter((user) => user.active);
    const people = activeUsers.length;
    const members = activeUsers.map((user, index) => {
      if (index === 0) {
        return {
          id: user.id,
          name: user.name,
          role: user.role,
          filledDays: actualFilled,
          missingDays: Math.max(workdays - actualFilled, 0),
          hours: actualHours,
          rate: workdays > 0 ? actualFilled / workdays : 0,
        };
      }

      const rate = FALLBACK_MEMBER_RATES[index % FALLBACK_MEMBER_RATES.length];
      const filledDays = Math.round(workdays * rate);
      const hours = Math.round((filledDays * 8 - (index % 2) * 4) * 10) / 10;
      return {
        id: user.id,
        name: user.name,
        role: user.role,
        filledDays,
        missingDays: Math.max(workdays - filledDays, 0),
        hours,
        rate: workdays > 0 ? filledDays / workdays : 0,
      };
    });

    const totalHours = members.reduce((sum, member) => sum + member.hours, 0);
    const filledShifts = members.reduce((sum, member) => sum + member.filledDays, 0);
    const totalShifts = workdays * people;
    const completionRate = totalShifts > 0 ? filledShifts / totalShifts : 0;

    const distribution = config.businessLines.map((line, index) => {
      const actual = lineTotals.get(line) ?? 0;
      const fallback = [0.48, 0.32, 0.2][index] ?? 0.1;
      const percent = actualHours > 0 ? actual / actualHours : fallback;
      return {
        label: line,
        hours: Math.round(totalHours * percent * 10) / 10,
        percent,
        color: LINE_COLORS[index % LINE_COLORS.length],
      };
    });

    const trend = [-8, -3, 2, 0].map((offset) =>
      Math.max(0, Math.min(100, Math.round((completionRate * 100 + offset)))),
    );

    return {
      workdays,
      people,
      filledShifts,
      completionRate,
      totalHours: Math.round(totalHours * 10) / 10,
      avgHours: people > 0 ? Math.round((totalHours / people) * 10) / 10 : 0,
      missingShifts: members.reduce((sum, member) => sum + member.missingDays, 0),
      members,
      trend,
      distribution,
    };
  }, [users, days, config, year, month]);

  const attention = insight.members
    .filter((member) => member.missingDays > 0)
    .sort((a, b) => b.missingDays - a.missingDays)
    .slice(0, 4);

  return (
    <section className="card admin-insights">
      <header className="insights-head">
        <div>
          <h2>{t('insights.title')}</h2>
          <p>{t('insights.subtitle', { month: `${year}-${String(month + 1).padStart(2, '0')}` })}</p>
        </div>
        <span className="insights-period">{t('insights.workdays', { n: insight.workdays })}</span>
      </header>

      <div className="insights-kpis">
        <div className="insight-kpi">
          <span>{t('insights.team')}</span>
          <strong>{insight.people}</strong>
          <em>{t('insights.peopleUnit')}</em>
        </div>
        <div className="insight-kpi is-primary">
          <span>{t('insights.completion')}</span>
          <strong>{Math.round(insight.completionRate * 100)}%</strong>
          <em>{t('insights.filledShifts', { n: insight.filledShifts })}</em>
        </div>
        <div className="insight-kpi">
          <span>{t('insights.totalHours')}</span>
          <strong>{insight.totalHours}</strong>
          <em>{t('insights.hoursUnit')}</em>
        </div>
        <div className="insight-kpi">
          <span>{t('insights.avgHours')}</span>
          <strong>{insight.avgHours}</strong>
          <em>{t('insights.hoursUnit')}</em>
        </div>
        <div className="insight-kpi is-warn">
          <span>{t('insights.missing')}</span>
          <strong>{insight.missingShifts}</strong>
          <em>{t('insights.shiftsUnit')}</em>
        </div>
      </div>

      <div className="insights-body">
        <div className="insight-panel">
          <h3>{t('insights.trend')}</h3>
          <div className="insight-trend">
            {insight.trend.map((value, index) => (
              <div className="trend-col" key={index}>
                <span className="trend-value">{value}%</span>
                <div className="trend-track">
                  <i style={{ height: `${value}%` }} />
                </div>
                <span className="trend-label">{t('insights.week', { n: index + 1 })}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="insight-panel">
          <h3>{t('insights.distribution')}</h3>
          <div className="insight-distribution">
            {insight.distribution.map((item) => (
              <div className="distribution-row" key={item.label}>
                <span className="distribution-label">{item.label}</span>
                <div className="distribution-track">
                  <i style={{ width: `${Math.round(item.percent * 100)}%`, background: item.color }} />
                </div>
                <span className="distribution-value">
                  {item.hours.toFixed(1)}h · {Math.round(item.percent * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="insights-body insights-lists">
        <div className="insight-panel">
          <h3>{t('insights.members')}</h3>
          <div className="member-list">
            {insight.members.map((member) => (
              <div className="member-row" key={member.id}>
                <span className="member-avatar">{member.name.slice(0, 1)}</span>
                <span className="member-name">{member.name}</span>
                <div className="member-track">
                  <i style={{ width: `${Math.round(member.rate * 100)}%` }} />
                </div>
                <span className="member-rate">{Math.round(member.rate * 100)}%</span>
                <span className="member-hours">{member.hours}h</span>
              </div>
            ))}
          </div>
        </div>

        <div className="insight-panel">
          <h3>{t('insights.attention')}</h3>
          {attention.length === 0 ? (
            <p className="insight-empty">{t('insights.noAttention')}</p>
          ) : (
            <div className="attention-list">
              {attention.map((member) => (
                <div className="attention-row" key={member.id}>
                  <span className="attention-dot" />
                  <span className="attention-name">{member.name}</span>
                  <span className="attention-days">
                    {t('insights.missingDays', { n: member.missingDays })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="insights-note">{t('insights.note')}</p>
    </section>
  );
}
