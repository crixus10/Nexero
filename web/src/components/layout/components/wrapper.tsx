import { Outlet } from 'react-router-dom';
import { useLayout } from './context';
import { Sidebar } from './sidebar';
import { Header } from './header';

export function Wrapper() {
  const {isMobile} = useLayout();

  return (
    <>
      <Header />

      <div className="flex flex-col lg:flex-row grow pt-(--header-height)">
        <div className="flex grow rounded-xl bg-background border border-input m-2.5 mt-0">
          {!isMobile && <Sidebar />}
          <div className="grow overflow-y-auto">
            <main className="grow py-5" role="content">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </>
  );
}
