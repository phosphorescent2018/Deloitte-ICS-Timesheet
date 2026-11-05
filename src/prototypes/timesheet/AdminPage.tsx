import { useEffect, useMemo, useState } from 'react';
import { formatMonth, formatWeekdayShort, useI18n } from './i18n';
import { locationLabel } from './lib/catalog';
import type { ActivityCode, AdminConfig } from './lib/config';
import { daysInMonth, toKey } from './lib/date';
import { dayTotal, statusOf, type DayRecord } from './lib/model';
import { loadUsers, newUserId, saveUsers, type AppUser, type UserRole } from './lib/users';
import { Icon, Modal } from './ui';

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
  const [users, setUsers] = useState<AppUser[]>(() => loadUsers());
  const [userForm, setUserForm] = useState<AppUser | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [userError, setUserError] = useState('');

  useEffect(() => {
    saveUsers(users);
  }, [users]);

  const openNewUser = () => {
    setEditingId('new');
    setUserError('');
    setUserForm({
      id: newUserId(),
      name: '',
      employeeId: '',
      department: t('admin.department'),
      role: 'employee',
      active: true,
    });
  };

  const openEditUser = (user: AppUser) => {
    setEditingId(user.id);
    setUserError('');
    setUserForm({ ...user });
  };

  const submitUser = () => {
    if (!userForm) return;
    const name = userForm.name.trim();
    const employeeId = userForm.employeeId.trim();
    if (!name || !employeeId) {
      setUserError(t('admin.required'));
      return;
    }
    const duplicated = users.some(
      (user) => user.id !== userForm.id && user.employeeId.toLowerCase() === employeeId.toLowerCase(),
    );
    if (duplicated) {
      setUserError(t('admin.duplicateEmployeeId'));
      return;
    }
    const next: AppUser = {
      ...userForm,
      name,
      employeeId,
      department: userForm.department.trim() || t('admin.department'),
    };
    setUsers((prev) =>
      editingId === 'new' ? [...prev, next] : prev.map((user) => (user.id === next.id ? next : user)),
    );
    setUserForm(null);
    setEditingId(null);
    setUserError('');
  };

  const removeUser = (user: AppUser) => {
    if (user.role === 'admin' && users.filter((item) => item.role === 'admin').length <= 1) return;
    setUsers((prev) => prev.filter((item) => item.id !== user.id));
  };

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

      <section className="card admin-users">
        <header className="admin-users-head">
          <div>
            <span className="editor-kicker">{t('admin.usersTitle')}</span>
            <p>{t('admin.usersDesc')}</p>
          </div>
          <button type="button" className="btn btn-blue" onClick={openNewUser}>
            <Icon.Plus size={14} />
            {t('admin.addUser')}
          </button>
        </header>
        <div className="admin-table-wrap admin-users-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('admin.userName')}</th>
                <th>{t('admin.userEmployeeId')}</th>
                <th>{t('admin.userDepartment')}</th>
                <th>{t('admin.role')}</th>
                <th>{t('admin.status')}</th>
                <th>{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const lastAdmin =
                  user.role === 'admin' && users.filter((item) => item.role === 'admin').length <= 1;
                return (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.employeeId}</td>
                    <td>{user.department}</td>
                    <td>
                      <span className={`role-badge is-${user.role}`}>{t(`role.${user.role}`)}</span>
                    </td>
                    <td>
                      <span className={`user-status ${user.active ? 'is-active' : 'is-inactive'}`}>
                        {t(user.active ? 'admin.active' : 'admin.inactive')}
                      </span>
                    </td>
                    <td className="admin-row-actions">
                      <button type="button" className="link-btn" onClick={() => openEditUser(user)}>
                        {t('admin.editUser')}
                      </button>
                      <button
                        type="button"
                        className="link-btn is-danger"
                        disabled={lastAdmin}
                        title={lastAdmin ? t('admin.lastAdmin') : t('admin.deleteUser')}
                        onClick={() => removeUser(user)}
                      >
                        {t('admin.deleteUser')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

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

      {userForm ? (
        <Modal
          title={editingId === 'new' ? t('admin.addUser') : t('admin.editUser')}
          width={560}
          onClose={() => {
            setUserForm(null);
            setUserError('');
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setUserForm(null);
                  setUserError('');
                }}
              >
                {t('admin.cancel')}
              </button>
              <button type="button" className="btn btn-blue" onClick={submitUser}>
                {t('admin.save')}
              </button>
            </>
          }
        >
          <div className="user-form">
            <label>
              <span>{t('admin.userName')}</span>
              <input
                value={userForm.name}
                onChange={(event) => setUserForm({ ...userForm, name: event.target.value })}
              />
            </label>
            <label>
              <span>{t('admin.userEmployeeId')}</span>
              <input
                value={userForm.employeeId}
                onChange={(event) => setUserForm({ ...userForm, employeeId: event.target.value })}
              />
            </label>
            <label>
              <span>{t('admin.userDepartment')}</span>
              <input
                value={userForm.department}
                onChange={(event) => setUserForm({ ...userForm, department: event.target.value })}
              />
            </label>
            <label>
              <span>{t('admin.role')}</span>
              <select
                value={userForm.role}
                onChange={(event) => setUserForm({ ...userForm, role: event.target.value as UserRole })}
              >
                <option value="employee">{t('role.employee')}</option>
                <option value="manager">{t('role.manager')}</option>
                <option value="admin">{t('role.admin')}</option>
              </select>
            </label>
            <label className="user-form-check">
              <input
                type="checkbox"
                checked={userForm.active}
                onChange={(event) => setUserForm({ ...userForm, active: event.target.checked })}
              />
              {t('admin.active')}
            </label>
            {userError ? <p className="admin-error">{userError}</p> : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
