import { ReactNode } from 'react';

function Toolbar({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3.5 pb-5">
      {children}
    </div>
  );
}

function ToolbarActions({ children }: { children?: ReactNode }) {
  return <div className="flex items-center gap-2.5">{children}</div>;
}

function ToolbarHeading ({ children }: { children: ReactNode }) {
  return <div className="flex flex-col justify-center gap-2">{children}</div>;
}

function ToolbarPageTitle ({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-base font-medium leading-none text-foreground">
      {children}
    </h1>
  );
};

function ToolbarDescription ({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
      {children}
    </div>
  );
};

export {
  Toolbar,
  ToolbarActions,
  ToolbarHeading,
  ToolbarPageTitle,
  ToolbarDescription
};
