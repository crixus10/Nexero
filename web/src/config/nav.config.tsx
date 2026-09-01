import { BookUser, FilePlus, FileText, Hash, Package } from 'lucide-react';
import { MenuConfig } from '@/config/types';

/**
 * Navigare reală (nu demo) — vezi web/README.md. Un singur tab de sus
 * („Facturare") cât timp Modulul 1 e singurul construit; Stocuri/CRM se
 * adaugă aici abia când au pagini reale (docs/roadmap.md), nu speculativ.
 */
export const MENU_HEADER: MenuConfig = [
  {
    title: 'Facturare',
    path: '/invoices',
  },
];

export const MENU_SIDEBAR: MenuConfig = [
  {
    title: 'Facturare',
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
    children: [
      {
        title: 'Clienți',
        path: '/customers',
        icon: BookUser,
      },
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
];
