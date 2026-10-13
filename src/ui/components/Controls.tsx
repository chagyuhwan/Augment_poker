import { useId, type CSSProperties, type ReactNode } from 'react';
import { audio } from '../../audio/audioEngine';
import { Icon, type IconName } from './Icon';

export interface SegmentOption<T> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
  ariaLabel,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'md' | 'sm';
  ariaLabel?: string;
}) {
  return (
    <div className={`segmented segmented--${size}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={opt.disabled}
            className={active ? 'segmented__item is-active' : 'segmented__item'}
            onMouseEnter={() => !opt.disabled && !active && audio.play('hover')}
            onClick={() => {
              if (active) return;
              audio.play('click');
              onChange(opt.value);
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={checked ? 'toggle is-on' : 'toggle'}
      onClick={() => {
        audio.play('click');
        onChange(!checked);
      }}
    >
      <span className="toggle__track">
        <span className="toggle__thumb" />
      </span>
      {label && <span className="toggle__label">{label}</span>}
    </button>
  );
}

export function Slider({
  value,
  onChange,
  onCommit,
  min = 0,
  max = 100,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  onCommit?: () => void;
  min?: number;
  max?: number;
  ariaLabel: string;
}) {
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        aria-label={ariaLabel}
        style={{ '--fill': `${percent}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
      />
      <span className="slider__value">{value}</span>
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  maxLength,
  type = 'text',
  icon,
  autoFocus,
  invalid,
  className,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  type?: 'text' | 'password';
  icon?: IconName;
  autoFocus?: boolean;
  invalid?: boolean;
  className?: string;
  onEnter?: () => void;
}) {
  const classes = ['input', invalid && 'is-invalid', icon && 'input--icon', className].filter(Boolean).join(' ');
  return (
    <label className={classes}>
      {icon && <Icon name={icon} size={18} />}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) onEnter();
        }}
      />
    </label>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  aside,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field" aria-describedby={error ? id : undefined}>
      <div className="field__head">
        <span className="field__label">{label}</span>
        {aside && <span className="field__aside">{aside}</span>}
      </div>
      {children}
      {error ? (
        <p className="field__error" id={id}>
          {error}
        </p>
      ) : (
        hint && <p className="field__hint">{hint}</p>
      )}
    </div>
  );
}
