import { useEffect, useState } from 'react';
import { UsersApi } from '../api';
import type { UserRef } from '../api/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

/**
 * Selector de useri reali ai firmei (Team/Assignees din demo) — checkbox-uri
 * simple, nu un combobox nou (volumul e mic: câțiva useri per firmă la
 * pachetele Start/Business, vezi docs/pricing.md). `UsersApi.list()`
 * întoarce listă goală (nu eroare) dacă userul curent nu e owner/admin —
 * vezi comentariul din web/src/api/index.ts.
 */
export function UserMultiSelect({
  label,
  selectedIds,
  onChange,
}: {
  label: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [users, setUsers] = useState<UserRef[] | null>(null);

  useEffect(() => {
    void UsersApi.list().then(setUsers);
  }, []);

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  }

  if (users === null) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {users.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nicio persoană disponibilă (necesită rol owner/admin să vezi lista de useri).
        </p>
      ) : (
        <div className="max-h-32 space-y-1.5 overflow-y-auto rounded-md border border-border p-2">
          {users.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                size="sm"
                checked={selectedIds.includes(u.id)}
                onCheckedChange={() => toggle(u.id)}
              />
              <span>{u.fullName || u.email}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
