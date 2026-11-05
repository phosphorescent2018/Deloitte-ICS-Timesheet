import { useMemo, useState } from 'react';
import { formatMonth, formatWeekdayShort, useI18n } from './i18n';
import { locationLabel } from './lib/catalog';
import type { ActivityCode, AdminConfig } from './lib/config';
import { daysInMonth, toKey } from './lib/date';
import { dayTotal, statusOf, type DayRecord } from './lib/model';
import { Icon } from './ui';

interface Props {
  config: AdminConfig;
  activities: ActivityCode[];
  days: Record<string, DayRecord>;
  year: number;
  month: number;
  onChange: (next: AdminConfig) => void;
  onBack: () => void;
  onReset: () => void;
}

interface ListEditorProps {
  title: string;
  items: string[];
  placeholder: string;
  addLabel: string;
  removeLabel: string;
  duplicateLabel: string;
  atLeastOneLabel: string;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}

function ListEditor({
  title,
  items,
  placeholder,
  addLabel,
  removeLabel,
  duplicateLabel,
  atLeastOneLabel,
  onAdd,
  onRemove,
}: ListEditorProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    const next = value.trim();
    if (!next) return;
    if (items.includes(next)) {
      setError(duplicateLabel);
      return;
    }
    onAdd(next);
    setValue('');
    setError('');
  };

  return (
    <section className="card admin-card">
      <h2>{title}</h2>
      <div className="admin-tags">
        {items.map((item) => (
          <span className="admin-tag" key={item}>
            {item}
            <button
              type="button"
              title={items.length <= 1 ? atLeastOneLabel : removeLabel}
              disabled={items.length <= 1}
              onClick={() => onRemove(item)}
              aria-label={`${removeLabel} ${item}`}
            >
              <Icon.X size={11} />
            </button>
          </span>
        ))}
      </div>
      <div className="admin-add">
        <input
          value={value}
          placeholder={placeholder}
          onChange={(event) => {
            setValue(event.target.value);
            setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" className="btn btn-blue" onClick={submit}>
          <Icon.Plus size={14} />
          {addLabel}
        </button>
      </div>
      {error ? <p className="admin-error">{error}</p> : null}
    </section>
  );
}

const COLUMN_KEYS = [
  'col.index',
  'col.employee',
  'col.employeeId',
  'col.department',
  'col.businessLine',
  'col.product',
  'col.stage',
  'col.date',
  'col.weekday',
  'col.location',
  'col.target',
  'col.actual',
  'col.status',
  'col.activity',
  'col.lineHours',
  'col.remark',
  'col.note',
  'col.savedAt',
];

export default function AdminPage({ config, activities, days, year, month, onChange, onBack, onReset }: Props) {
  const { t, lang } = useI18n();

  const updateList = (field: keyof AdminConfig, next: string[]) => {
    onChange({ ...config, [field]: next });
  };

  const rows = useMemo(() => {
    const list: string[][] = [];
    const total = daysInMonth(year, month);

    for (let day = 1; day <= total; day += 1) {
      const key = toKey(new Date(year, month, day));
      const record = days[key];
      if (!record) continue;
      const totalHours = dayTotal(record);
      if (totalHours <= 0) continue;
      const status = statusOf(record);

      record.lines
        .filter((line) => line.code || line.hours !== 0)
        .forEach((line) => {
          const activity = activities.find((item) => item.code === line.code);
          list.push([
            String(list.length + 1),
            t('admin.employeeName'),
            t('admin.employeeId'),
            t('admin.department'),
            activity?.category ?? '—',
            activity?.product ?? '—',
            activity?.stage ?? '—',
            key,
            formatWeekdayShort(key, lang),
            locationLabel(record.location, lang),
            '8.0',
            totalHours.toFixed(1),
            t(`status.${status}`),
            line.code || '—',
            line.hours.toFixed(1),
            line.remark || '',
            line.note || '',
            record.savedAt
              ? new Date(record.savedAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour12: false })
              : '',
          ]);
        });
    }

    return list;
  }, [activities, days, lang, month, t, year]);

  const handleExport = () => {
    const escape = (value: string) =>
      /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    const header = COLUMN_KEYS.map((key) => t(key));
    const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `工时明细_${year}-${String(month + 1).padStart(2, '0')}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="admin-page">
      <header className="admin-head">
        <div>
          <span className="editor-kicker">{t('admin.kicker')}</span>
          <h1>{t('admin.title')}</h1>
          <p>{t('admin.subtitle')}</p>
        </div>
        <div className="admin-actions">
          <button type="button" className="btn btn-ghost" onClick={onReset}>
            <Icon.Rotate size={15} />
            {t('menu.reset')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            <Icon.ChevronLeft size={15} />
            {t('admin.back')}
          </button>
        </div>
      </header>

      <div className="admin-grid">
        <ListEditor
          title={t('admin.businessLines')}
          items={config.businessLines}
          placeholder={t('admin.addPlaceholder')}
          addLabel={t('admin.add')}
          removeLabel={t('admin.remove')}
          duplicateLabel={t('admin.duplicate')}
          atLeastOneLabel={t('admin.atLeastOne')}
          onAdd={(value) => updateList('businessLines', [...config.businessLines, value])}
          onRemove={(value) =>
            updateList(
              'businessLines',
              config.businessLines.filter((item) => item !== value),
            )
          }
        />
        <ListEditor
          title={t('admin.products')}
          items={config.products}
          placeholder={t('admin.addPlaceholder')}
          addLabel={t('admin.add')}
          removeLabel={t('admin.remove')}
          duplicateLabel={t('admin.duplicate')}
          atLeastOneLabel={t('admin.atLeastOne')}
          onAdd={(value) => updateList('products', [...config.products, value])}
          onRemove={(value) =>
            updateList(
              'products',
              config.products.filter((item) => item !== value),
            )
          }
        />
        <ListEditor
          title={t('admin.stages')}
          items={config.stages}
          placeholder={t('admin.addPlaceholder')}
          addLabel={t('admin.add')}
          removeLabel={t('admin.remove')}
          duplicateLabel={t('admin.duplicate')}
          atLeastOneLabel={t('admin.atLeastOne')}
          onAdd={(value) => updateList('stages', [...config.stages, value])}
          onRemove={(value) =>
            updateList(
              'stages',
              config.stages.filter((item) => item !== value),
            )
          }
        />
      </div>

      <div className="admin-summary">
        <span>{t('admin.combinations', { count: activities.length })}</span>
        <div className="admin-combos">
          {activities.slice(0, 10).map((activity) => (
            <code key={activity.code}>{activity.code}</code>
          ))}
          {activities.length > 10 ? <span className="muted">…</span> : null}
        </div>
      </div>

      <section className="card admin-export">
        <header className="admin-export-head">
          <div>
            <span className="editor-kicker">{t('admin.exportTitle')}</span>
            <h2>
              {formatMonth(year, month, lang)} · {t('admin.preview')}
            </h2>
            <p>{t('admin.exportDesc')}</p>
          </div>
          <button type="button" className="btn btn-blue" onClick={handleExport} disabled={rows.length === 0}>
            <Icon.Download size={15} />
            {t('admin.exportBtn')}
          </button>
        </header>

        {rows.length === 0 ? (
          <p className="admin-empty">{t('admin.empty')}</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  {COLUMN_KEYS.map((key) => (
                    <th key={key}>{t(key)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row[7]}-${row[13]}-${index}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>{cell || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
