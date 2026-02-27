import { createContext, useContext, type ReactNode } from "react";
import type { MobileAppController } from "../hooks/useMobileAppController";

const MobileAppContext = createContext<MobileAppController | null>(null);

export function MobileAppProvider({
  value,
  children,
}: {
  value: MobileAppController;
  children: ReactNode;
}) {
  return (
    <MobileAppContext.Provider value={value}>
      {children}
    </MobileAppContext.Provider>
  );
}

export function useMobileApp(): MobileAppController {
  const context = useContext(MobileAppContext);
  if (!context) {
    throw new Error("useMobileApp must be used within <MobileAppProvider>.");
  }
  return context;
}
