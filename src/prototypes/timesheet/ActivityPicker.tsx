import { useEffect, useMemo, useRef, useState } from 'react';
import { ACTIVITIES, findActivity, type ActivityCategory } from './lib/catalog';
import { Icon } from './ui';

interface Props {
  value: string;
  onChange: (code: string) => void;
  invalid?: boolean;
}

const CATEGORY_ORDER: ActivityCategory[] = [
  'ESH',
  'Tax',
  'Consulting',
  'Risk Advisory',
  'Administration',
  'Leave',
];

export default function ActivityPicker({ value, onChange, invalid }: Props) {
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

  const selected = findActivity(value);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? ACTIVITIES.filter((item) =>
          `${item.code} ${item.name} ${item.client} ${item.category}`.toLowerCase().includes(needle),
        )
      : ACTIVITIES;
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: filtered.filter((item) => item.category === category),
    })).filter((group) => group.items.length > 0);
  }, [query]);

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
            <>
              <span className="picker-code">{selected.code}</span>
              <span className="picker-name">{selected.name}</span>
            </>
          ) : (
            <span className="picker-placeholder">Select activity code…</span>
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
              placeholder="Search code, client or activity…"
            />
            {query ? (
              <button type="button" className="picker-clear" onClick={() => setQuery('')} aria-label="Clear">
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
                    <span className="opt-name">{item.name}</span>
                    <span className="opt-client">{item.client}</span>
                  </button>
                ))}
              </div>
            ))}
            {groups.length === 0 ? (
              <div className="picker-empty">No activity code matches “{query}”.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
