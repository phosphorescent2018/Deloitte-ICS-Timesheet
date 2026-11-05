import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from './i18n';
import type { ActivityCode } from './lib/config';
import { Icon } from './ui';

interface Props {
  value: string;
  activities: ActivityCode[];
  onChange: (code: string) => void;
  invalid?: boolean;
}

export default function ActivityPicker({ value, activities, onChange, invalid }: Props) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = activities.find((item) => item.code === value);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? activities.filter((item) =>
          `${item.code} ${item.name} ${item.nameZh} ${item.client} ${item.category}`
            .toLowerCase()
            .includes(needle),
        )
      : activities;
    const order: string[] = [];
    filtered.forEach((item) => {
      if (!order.includes(item.category)) order.push(item.category);
    });
    return order.map((category) => ({
      category,
      items: filtered.filter((item) => item.category === category),
    }));
  }, [activities, query]);

  return (
    <div className="picker" ref={rootRef}>
      <button
        type="button"
        className={`picker-btn${invalid ? ' is-invalid' : ''}${open ? ' is-open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="picker-value">
          {selected ? (
            <span className="picker-code">{selected.code}</span>
          ) : (
            <span className="picker-placeholder">{t('picker.placeholder')}</span>
          )}
        </span>
        <Icon.ChevronDown size={15} />
      </button>

      {open ? (
        <div className="picker-pop" role="listbox">
          <div className="picker-search">
            <Icon.Search size={15} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('picker.search')}
            />
            {query ? (
              <button
                type="button"
                className="picker-clear"
                onClick={() => setQuery('')}
                aria-label={t('picker.clear')}
              >
                <Icon.X size={13} />
              </button>
            ) : null}
          </div>
          <div className="picker-list">
            {groups.map((group) => (
              <div key={group.category} className="picker-group">
                <div className="picker-group-title">{group.category}</div>
                {group.items.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    role="option"
                    aria-selected={item.code === value}
                    className={`picker-option${item.code === value ? ' is-active' : ''}`}
                    onClick={() => {
                      onChange(item.code);
                      setOpen(false);
                      setQuery('');
                    }}
                  >
                    <span className="opt-code">{item.code}</span>
                    <span className="opt-name">{lang === 'zh' ? item.nameZh : item.name}</span>
                    <span className="opt-client">{lang === 'zh' ? item.clientZh : item.client}</span>
                  </button>
                ))}
              </div>
            ))}
            {groups.length === 0 ? (
              <div className="picker-empty">{t('picker.empty', { query })}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
