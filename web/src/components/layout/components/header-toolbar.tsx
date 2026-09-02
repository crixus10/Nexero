import { useNavigate } from 'react-router-dom';
import { Building2, LogOut, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/auth/AuthContext';
import { getInitials } from '@/lib/helpers';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

/**
 * Trimis la esențial față de meniul original de demo (fără „Referrals",
 * „Download apps" etc. — nu au corespondent real în Nexero încă). Rămâne
 * loc de extindere firesc: pagina „Contul meu", notificări reale etc.,
 * când apar cerințe concrete — nu speculativ acum.
 */
export function HeaderToolbar() {
  const { theme, setTheme } = useTheme();
  const { email, tenantName, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  function toggleTheme() {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }

  return (
    <nav className="flex items-center gap-2.5">
      {tenantName && (
        <Badge
          variant="primary"
          appearance="light"
          size="lg"
          className="hidden sm:inline-flex max-w-48"
          title={tenantName}
        >
          <Building2 />
          <span className="truncate">{tenantName}</span>
        </Badge>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground"
        onClick={toggleTheme}
        aria-label="Comută tema"
      >
        {theme === 'light' ? <Moon /> : <Sun />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger className="cursor-pointer">
          <Avatar className="size-7">
            <AvatarFallback>{getInitials(email ?? '?', 2) || '?'}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" side="bottom" align="end" sideOffset={11}>
          <div className="flex items-center gap-3 p-3">
            <Avatar>
              <AvatarFallback>{getInitials(email ?? '?', 2) || '?'}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-semibold text-foreground truncate">
                {email ?? 'Cont'}
              </span>
              {tenantName && (
                <span className="text-xs text-muted-foreground truncate">
                  {tenantName}
                </span>
              )}
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut />
            <span>Delogare</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
