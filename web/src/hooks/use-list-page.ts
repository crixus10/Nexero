import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Listă de nomenclator cu căutare server-side (debounced, `?q=`) + paginare
 * client-side — comună Clienți/Produse/Serii facturare (fix logic-reviewer
 * pe auditul „meniu Nomenclatoare"):
 *  - ignoră un răspuns "stale": dacă un GET pornit înaintea unei
 *    creări/editări/ștergeri răspunde DUPĂ requestul declanșat de acea
 *    acțiune, lista nu mai e suprascrisă cu date vechi;
 *  - reclamă `page` când lista se micșorează sub ea (ex. ștergi ultimul
 *    rând de pe ultima pagină) — altfel tabelul se randează gol până la un
 *    clic manual pe „Anterior”.
 */
export function useListPage<T>(
  fetcher: (q?: string) => Promise<T[]>,
  toErrorMessage: (err: unknown) => string,
) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const data = await fetcher(debouncedSearch || undefined);
      if (id !== requestId.current) return; // răspuns stale — ignorat
      setItems(data);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(toErrorMessage(err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    void reload();
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const pageCount = Math.max(1, Math.ceil((items?.length ?? 0) / pageSize));
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  const pageItems = useMemo(() => {
    if (!items) return [];
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return {
    items,
    error,
    search,
    setSearch,
    page,
    setPage,
    pageSize,
    setPageSize: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
    pageItems,
    reload,
  };
}
