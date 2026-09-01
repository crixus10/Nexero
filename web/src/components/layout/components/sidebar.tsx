import { SidebarMenu } from './sidebar-menu';

// Fără SidebarSearch (era un placeholder Metronic fără căutare reală în
// spate) — se adaugă corect când există ceva de căutat (facturi/clienți),
// nu ca decor.
export function Sidebar() {
  return (
    <div className="flex flex-col items-stretch shrink-0 w-(--sidebar-width) border-e border-border">
      <SidebarMenu />
    </div>
  );
}
