import type { ReactNode } from 'react';
import { useNavigation } from '../../app/navigation';
import { Button } from './Button';

export function ScreenHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  const nav = useNavigation();
  return (
    <header className="screen-header">
      <Button variant="ghost" icon="arrowLeft" onClick={nav.back} sound={null}>
        뒤로 <kbd>ESC</kbd>
      </Button>
      <div className="screen-header__titles">
        <h1 className="screen-header__title">{title}</h1>
        {subtitle && <p className="screen-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="screen-header__actions">{actions}</div>}
    </header>
  );
}
