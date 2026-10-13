import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { audio, type SfxName } from '../../audio/audioEngine';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: ButtonVariant;
  size?: 'md' | 'lg' | 'sm';
  icon?: IconName;
  trailingIcon?: IconName;
  sound?: SfxName | null;
  children?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  trailingIcon,
  sound = 'click',
  className,
  onClick,
  onMouseEnter,
  children,
  ...rest
}: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, `btn--${size}`, className].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={classes}
      onClick={(e) => {
        if (sound) audio.play(sound);
        onClick?.(e);
      }}
      onMouseEnter={(e) => {
        if (!rest.disabled) audio.play('hover');
        onMouseEnter?.(e);
      }}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'lg' ? 22 : 18} />}
      {children && <span className="btn__label">{children}</span>}
      {trailingIcon && <Icon name={trailingIcon} size={18} />}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  onClick,
  disabled,
  className,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className ? `icon-btn ${className}` : 'icon-btn'}
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseEnter={() => !disabled && audio.play('hover')}
      onClick={() => {
        audio.play('click');
        onClick();
      }}
    >
      <Icon name={icon} size={20} />
    </button>
  );
}
