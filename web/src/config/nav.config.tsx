import {
  Building2,
  CheckSquare,
  FilePlus,
  FileText,
  Hash,
  LayoutDashboard,
  Package,
  StickyNote,
  Users,
  Workflow,
} from 'lucide-react';
import { MenuConfig } from '@/config/types';

/**
 * Navigare reală (nu demo) — vezi web/README.md. Două module de sus,
 * fiecare cu propriul grup (sau grupuri) de sidebar, filtrate prin
 * `rootPath` (vezi sidebar-menu.tsx) — Layout 11 original (vendor) NU are
 * acest mecanism (un singur MENU_SIDEBAR static, indiferent de tab-ul
 * activ), dar cu 2 module reale (nu doar tab-uri „#" de decor) sidebar-ul
 * neseparat ar amesteca Facturare cu CRM-ul, greșit din start.
 */
export const MENU_HEADER: MenuConfig = [
  {
    title: 'Facturare',
    path: '/invoices',
    rootPath: '/invoices',
  },
  {
    title: 'Clienți',
    path: '/crm',
    rootPath: '/crm',
  },
];

export const MENU_SIDEBAR: MenuConfig = [
  {
    title: 'Facturare',
    rootPath: '/invoices',
    children: [
      {
        title: 'Facturi',
        path: '/invoices',
        icon: FileText,
      },
      {
        title: 'Factură nouă',
        path: '/invoices/new',
        icon: FilePlus,
      },
    ],
  },
  {
    title: 'Nomenclatoare',
    rootPath: '/invoices',
    children: [
      {
        title: 'Produse',
        path: '/products',
        icon: Package,
      },
      {
        title: 'Serii facturare',
        path: '/invoice-series',
        icon: Hash,
      },
    ],
  },
  {
    title: 'Clienți',
    rootPath: '/crm',
    children: [
      {
        title: 'Dashboard',
        path: '/crm',
        icon: LayoutDashboard,
      },
      {
        title: 'Contacte',
        path: '/crm/contacts',
        icon: Users,
      },
      {
        title: 'Companii',
        path: '/crm/companies',
        icon: Building2,
      },
      {
        title: 'Deal-uri',
        path: '/crm/deals',
        icon: Workflow,
      },
      {
        title: 'Sarcini',
        path: '/crm/tasks',
        icon: CheckSquare,
      },
      {
        title: 'Note',
        path: '/crm/notes',
        icon: StickyNote,
      },
    ],
  },
];
