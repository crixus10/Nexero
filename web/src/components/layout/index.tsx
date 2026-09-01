import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { MENU_SIDEBAR } from '@/config/nav.config';
import { useMenu } from '@/hooks/use-menu';
import { Wrapper } from './components/wrapper';
import { LayoutProvider } from './components/context';

/**
 * Shell-ul aplicației (Metronic Layout 11, ales dintre 39 de variante — vezi
 * discuția din sesiunea de curățare a pachetului ThemeForest). Titlul de
 * tab urmează pagina curentă din `nav.config.tsx`, nu mai e hardcodat.
 */
export function AppLayout() {
  const { pathname } = useLocation();
  const { getCurrentItem } = useMenu(pathname);
  const item = getCurrentItem(MENU_SIDEBAR);

  return (
    <>
      <Helmet>
        <title>{item?.title ? `${item.title} — Nexero` : 'Nexero'}</title>
      </Helmet>

      <LayoutProvider
        bodyClassName="bg-muted overflow-hidden"
        style={
          {
            '--sidebar-width': '240px',
            '--sidebar-width-mobile': '240px',
            '--header-height': '54px',
            '--header-height-mobile': '54px',
          } as React.CSSProperties
        }
      >
        <Wrapper />
      </LayoutProvider>
    </>
  );
}
