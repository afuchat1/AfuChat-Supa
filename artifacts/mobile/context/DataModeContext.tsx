import React, { createContext, useContext, useEffect, useState } from "react";
import {
  getCurrentDataMode,
  getManualOverride,
  initDataMode,
  setManualDataMode,
  subscribeDataMode,
  type DataMode,
} from "@/lib/dataMode";

type DataModeContextType = {
  dataMode: DataMode;
  isLowData: boolean;
  dataSaverEnabled: boolean;
  toggleDataSaver: (enabled: boolean) => Promise<void>;
};

const DataModeContext = createContext<DataModeContextType>({
  dataMode: "high",
  isLowData: false,
  dataSaverEnabled: false,
  toggleDataSaver: async () => {},
});

export function DataModeProvider({ children }: { children: React.ReactNode }) {
  const [dataMode, setDataMode] = useState<DataMode>(getCurrentDataMode());
  const [dataSaverEnabled, setDataSaverEnabled] = useState<boolean>(
    getManualOverride() === "low"
  );

  useEffect(() => {
    initDataMode().then(() => {
      setDataSaverEnabled(getManualOverride() === "low");
    });
    const unsub = subscribeDataMode((mode) => {
      setDataMode(mode);
    });
    return unsub;
  }, []);

  async function toggleDataSaver(enabled: boolean) {
    setDataSaverEnabled(enabled);
    await setManualDataMode(enabled ? "low" : null);
    setDataMode(enabled ? "low" : getCurrentDataMode());
  }

  return (
    <DataModeContext.Provider
      value={{ dataMode, isLowData: dataMode === "low", dataSaverEnabled, toggleDataSaver }}
    >
      {children}
    </DataModeContext.Provider>
  );
}

export function useDataMode(): DataModeContextType {
  return useContext(DataModeContext);
}
