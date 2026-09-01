import { useCallback } from "react";
import { Link, useLocation } from "react-router";
import { MENU_SIDEBAR } from "@/config/nav.config";
import {
  AccordionMenu,
  AccordionMenuGroup,
  AccordionMenuItem,
  AccordionMenuLabel,
} from '@/components/ui/accordion-menu';
import { ScrollArea } from "@/components/ui/scroll-area";

export function SidebarMenu() {
  const { pathname } = useLocation();

  // Memoize matchPath to prevent unnecessary re-renders. „/invoices" nu
  // trebuie să rămână activ pe „/invoices/new" — comparație exactă, nu
  // startsWith, exact pentru cazul ăsta (spre deosebire de tiparul original
  // Metronic, care excludea explicit doar ruta lor de layout implicită).
  const matchPath = useCallback(
    (path: string): boolean => path === pathname,
    [pathname],
  );

  // Grupurile de sidebar se filtrează pe `rootPath` (tab-ul de sus activ) —
  // Layout 11 vendor nu are acest mecanism (un singur MENU_SIDEBAR static),
  // dar cu 2 module reale (Facturare/Clienți), fără filtrare, sidebar-ul
  // le-ar amesteca pe amândouă mereu. Fallback: dacă niciun grup nu are
  // rootPath (sau nu potrivește nimic azi), arată tot — degradare
  // sigură, nu sidebar gol.
  const visibleGroups = MENU_SIDEBAR.filter(
    (item) => !item.rootPath || pathname.startsWith(item.rootPath),
  );
  const groups = visibleGroups.length > 0 ? visibleGroups : MENU_SIDEBAR;

  return (
    <ScrollArea className="grow h-[calc(100vh-5.5rem)] lg:h-[calc(100vh-4rem)] my-2.5 lg:my-7.5 px-2.5 me-0.5 pe-2">
      <AccordionMenu
        selectedValue={pathname}
        matchPath={matchPath}
        type="multiple"
        className="space-y-7.5"
        classNames={{
          separator: '-mx-2 mb-2.5',
          label: 'text-xs font-normal text-muted-foreground',
          item: 'h-8.5 px-2.5 text-sm font-normal text-foreground hover:text-primary data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground [&[data-selected=true]_svg]:opacity-100',
          group: '',
        }}
      >
        {groups.map((item, index) => {
          return (
            <AccordionMenuGroup key={index}>
              <AccordionMenuLabel>
                {item.title}
              </AccordionMenuLabel>
              {item.children?.map((child, index) => {
                return (
                  <AccordionMenuItem key={index} value={child.path || '#'}>
                    <Link to={child.path || '#'}>
                      {child.icon && <child.icon />}
                      <span>{child.title}</span>
                    </Link>          
                  </AccordionMenuItem>
                )
              })}
            </AccordionMenuGroup>
          )
        })}
      </AccordionMenu>
    </ScrollArea>
  );
}
