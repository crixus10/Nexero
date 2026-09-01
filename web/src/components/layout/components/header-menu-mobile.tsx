import { Link } from "react-router";
import { useLocation } from "react-router-dom";
import { useMenu } from "@/hooks/use-menu";
import { Menu } from "lucide-react";
import { MENU_HEADER } from "@/config/nav.config";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function HeaderMenuMobile() {
  const { pathname } = useLocation();
  const { isActive } = useMenu(pathname);

  return (
    <div className="p-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full justify-start">
            <Menu /> Main Menu
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width)">
          {MENU_HEADER.map((item, index) => {
            const active = isActive(item.path);

            return (
              <DropdownMenuItem
                key={index}
                asChild
                {...(active && { 'data-here': 'true' })}
              >
                <Link to={item.path || '#'}>{item.title}</Link>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
