import { useMemo, useState } from 'react';
import { formatMonth, formatWeekdayShort, useI18n } from './i18n';
import { locationLabel, type LocationOption } from './lib/catalog';
import type { ActivityCode, AdminConfig } from './lib/config';
import { daysInMonth, toKey } from './lib/date';
import { dayTotal, statusOf, type DayRecord } from './lib/model';
import { newUserId, type AppUser, type UserRole } from './lib/users';
import type { FeedbackItem } from './lib/feedback';
import { Icon, Modal } from './ui';

interface Props {
  config: AdminConfig;
  activities: ActivityCode[];
  days: Record<string, DayRecord>;
  year: number;
  month: number;
  users: AppUser[];
  feedback: FeedbackItem[];
  onChange: (next: AdminConfig) => void;
  onUsersChange: (users: AppUser[]) => void;
  onFeedbackChange: (feedback: FeedbackItem[]) => void;
  onBack: () => void;
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
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  const submit = () => {
    const next = value.trim();
    if (!next) return;
    if (items.includes(next)) {
      setError(duplicateLabel);
      return;
    }
    setPending(next);
  };

  const confirm = () => {
    if (!pending) return;
    onAdd(pending);
    setPending(null);
    setValue('');
    setError('');
  };

  return (
    <>
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

      {pending ? (
        <Modal
          title={t('admin.confirmAddTitle')}
          width={420}
          onClose={() => setPending(null)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>
                {t('admin.cancel')}
              </button>
              <button type="button" className="btn btn-blue" onClick={confirm}>
                {addLabel}
              </button>
            </>
          }
        >
          <p className="modal-copy">{t('admin.confirmAddBody', { value: pending, title })}</p>
        </Modal>
      ) : null}
    </>
  );
}

interface LocationEditorProps {
  title: string;
  lang: 'zh' | 'en';
  items: LocationOption[];
  placeholder: string;
  addLabel: string;
  removeLabel: string;
  duplicateLabel: string;
  specialLabel: string;
  atLeastOneLabel: string;
  onChange: (items: LocationOption[]) => void;
}

function LocationEditor({
  title,
  lang,
  items,
  placeholder,
  addLabel,
  removeLabel,
  duplicateLabel,
  specialLabel,
  atLeastOneLabel,
  onChange,
}: LocationEditorProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    const value = name.trim();
    if (!value) return;
    if (!/^[\p{L}\p{N}\s]+$/u.test(value)) {
      setError(specialLabel);
      return;
    }
    if (
      items.some(
        (item) =>
          item.labelZh.toLowerCase() === value.toLowerCase() ||
          item.label.toLowerCase() === value.toLowerCase(),
      )
    ) {
      setError(duplicateLabel);
      return;
    }
    onChange([...items, { value: `loc-${Date.now().toString(36)}`, label: value, labelZh: value }]);
    setName('');
    setError('');
  };

  const remove = (value: string) => {
    if (items.length <= 1) return;
    onChange(items.filter((item) => item.value !== value));
  };

  return (
    <section className="card admin-card admin-locations">
      <h2>{title}</h2>
      <div className="admin-tags">
        {items.map((item) => (
          <span className="admin-tag" key={item.value}>
            {lang === 'zh' ? item.labelZh : item.label}
            <button
              type="button"
              title={items.length <= 1 ? atLeastOneLabel : removeLabel}
              disabled={items.length <= 1}
              onClick={() => remove(item.value)}
              aria-label={`${removeLabel} ${item.labelZh}`}
            >
              <Icon.X size={11} />
            </button>
          </span>
        ))}
      </div>
      <div className="admin-add admin-add-location">
        <input
          value={name}
          placeholder={placeholder}
          onChange={(event) => {
            setName(event.target.value);
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
  'col.status',
  'col.activity',
  'col.lineHours',
  'col.remark',
  'col.savedAt',
];

export default function AdminPage({
  config,
  activities,
  days,
  year,
  month,
  users,
  feedback,
  onChange,
  onUsersChange,
  onFeedbackChange,
  onBack,
}: Props) {
  const { t, lang } = useI18n();
  const [userForm, setUserForm] = useState<AppUser | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [userError, setUserError] = useState('');

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
    const editing = users.find((user) => user.id === userForm.id);
    if (
      editing?.role === 'super_admin' &&
      userForm.role !== 'super_admin' &&
      users.filter((user) => user.role === 'super_admin').length <= 1
    ) {
      setUserError(t('admin.lastAdmin'));
      return;
    }
    const next: AppUser = {
      ...userForm,
      name,
      employeeId,
      department: userForm.department.trim() || t('admin.department'),
    };
    onUsersChange(
      editingId === 'new' ? [...users, next] : users.map((user) => (user.id === next.id ? next : user)),
    );
    setUserForm(null);
    setEditingId(null);
    setUserError('');
  };

  const removeUser = (user: AppUser) => {
    if (user.role === 'super_admin' && users.filter((item) => item.role === 'super_admin').length <= 1) return;
    onUsersChange(users.filter((item) => item.id !== user.id));
  };

  const updateList = (field: 'businessLines' | 'products' | 'stages', next: string[]) => {
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
            locationLabel(record.location, lang, config.locations),
            t(`status.${status}`),
            line.code || '—',
            line.hours.toFixed(1),
            line.remark || '',
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

      <LocationEditor
        title={t('admin.locations')}
        lang={lang}
        items={config.locations}
        placeholder={t('admin.locationName')}
        specialLabel={t('admin.locationSpecial')}
        addLabel={t('admin.add')}
        removeLabel={t('admin.remove')}
        duplicateLabel={t('admin.duplicate')}
        atLeastOneLabel={t('admin.atLeastOne')}
        onChange={(locations) => onChange({ ...config, locations })}
      />

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
                  user.role === 'super_admin' &&
                  users.filter((item) => item.role === 'super_admin').length <= 1;
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

      <section className="card admin-feedback">
        <header className="admin-users-head">
          <div>
            <span className="editor-kicker">{t('admin.feedbackTitle')}</span>
            <p>{t('admin.feedbackDesc')}</p>
          </div>
          <span className="admin-feedback-count">{feedback.length}</span>
        </header>

        {feedback.length === 0 ? (
          <p className="admin-empty">{t('admin.feedbackEmpty')}</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table admin-feedback-table">
              <thead>
                <tr>
                  <th>{t('admin.feedbackTime')}</th>
                  <th>{t('admin.feedbackContent')}</th>
                  <th>{t('admin.feedbackStatus')}</th>
                  <th>{t('admin.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {feedback.map((item) => {
                  const when = new Date(item.createdAt).toLocaleString(
                    lang === 'zh' ? 'zh-CN' : 'en-US',
                    { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' },
                  );
                  return (
                    <tr key={item.id}>
                      <td className="feedback-time">{when}</td>
                      <td className="feedback-content">{item.content}</td>
                      <td>
                        <span className={`feedback-status is-${item.status}`}>
                          {t(item.status === 'open' ? 'admin.feedbackOpen' : 'admin.feedbackDone')}
                        </span>
                      </td>
                      <td className="admin-row-actions">
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() =>
                            onFeedbackChange(
                              feedback.map((entry) =>
                                entry.id === item.id
                                  ? { ...entry, status: entry.status === 'open' ? 'done' : 'open' }
                                  : entry,
                              ),
                            )
                          }
                        >
                          {t(item.status === 'open' ? 'admin.feedbackResolve' : 'admin.feedbackReopen')}
                        </button>
                        <button
                          type="button"
                          className="link-btn is-danger"
                          onClick={() =>
                            onFeedbackChange(feedback.filter((entry) => entry.id !== item.id))
                          }
                        >
                          {t('admin.feedbackDelete')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
                <option value="super_admin">{t('role.super_admin')}</option>
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
