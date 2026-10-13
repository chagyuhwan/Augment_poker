import type { ReactNode } from 'react';
import { IconButton } from './Button';
import { Icon, type IconName } from './Icon';

export function Modal({
  title,
  subtitle,
  icon,
  width = 640,
  onClose,
  footer,
  children,
  tone = 'default',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: IconName;
  width?: number;
  onClose?: () => void;
  footer?: ReactNode;
  children?: ReactNode;
  tone?: 'default' | 'danger';
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal modal--${tone}`} style={{ width }} role="dialog" aria-modal="true">
        <header className="modal__header">
          {icon && (
            <span className="modal__icon">
              <Icon name={icon} size={22} />
            </span>
          )}
          <div className="modal__titles">
            <h2 className="modal__title">{title}</h2>
            {subtitle && <p className="modal__subtitle">{subtitle}</p>}
          </div>
          {onClose && <IconButton icon="close" label="닫기 (ESC)" onClick={onClose} className="modal__close" />}
        </header>
        {children && <div className="modal__body">{children}</div>}
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>
  );
}
