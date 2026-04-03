import React, { createContext, useContext, useEffect, useState } from "react";
import { getCurrentDataMode, initDataMode, subscribeDataMode, type DataMode } from "@/lib/dataMode";

type DataModeContextType = {
  dataMode: DataMode;
  isLowData: boolean;
};

const DataModeContext = createContext<DataModeContextType>({
  dataMode: "high",
  isLowData: false,
});

export function DataModeProvider({ children }: { children: React.ReactNode }) {
  const [dataMode, setDataMode] = useState<DataMode>(getCurrentDataMode());

  useEffect(() => {
    initDataMode();
    const unsub = subscribeDataMode(setDataMode);
    return unsub;
  }, []);

  return (
    <DataModeContext.Provider value={{ dataMode, isLowData: dataMode === "low" }}>
      {children}
    </DataModeContext.Provider>
  );
}

export function useDataMode(): DataModeContextType {
  return useContext(DataModeContext);
}
