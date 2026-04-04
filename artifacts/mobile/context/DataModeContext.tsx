import React, { createContext, useContext, useEffect, useState } from "react";
import {
  getCurrentDataMode,
  getIsWifi,
  getManualOverride,
  initDataMode,
  setManualDataMode,
  subscribeDataMode,
  type DataMode,
} from "@/lib/dataMode";

type DataModeContextType = {
  dataMode: DataMode;
  isLowData: boolean;
  isWifi: boolean;
  dataSaverEnabled: boolean;
  toggleDataSaver: (enabled: boolean) => Promise<void>;
};

const DataModeContext = createContext<DataModeContextType>({
  dataMode: "low",
  isLowData: true,
  isWifi: false,
  dataSaverEnabled: true,
  toggleDataSaver: async () => {},
});

function isDataSaverOn(): boolean {
  return getManualOverride() !== "high";
}

export function DataModeProvider({ children }: { children: React.ReactNode }) {
  const [dataMode, setDataMode] = useState<DataMode>(getCurrentDataMode());
  const [dataSaverEnabled, setDataSaverEnabled] = useState<boolean>(isDataSaverOn());
  const [isWifi, setIsWifi] = useState<boolean>(getIsWifi());

  useEffect(() => {
    initDataMode().then(() => {
      setDataSaverEnabled(isDataSaverOn());
      setIsWifi(getIsWifi());
      setDataMode(getCurrentDataMode());
    });
    const unsub = subscribeDataMode((mode) => {
      setDataMode(mode);
      setIsWifi(getIsWifi());
    });
    return unsub;
  }, []);

  async function toggleDataSaver(enabled: boolean) {
    setDataSaverEnabled(enabled);
    await setManualDataMode(enabled ? "low" : "high");
    setDataMode(getCurrentDataMode());
    setIsWifi(getIsWifi());
  }

  return (
    <DataModeContext.Provider
      value={{
        dataMode,
        isLowData: dataMode === "low",
        isWifi,
        dataSaverEnabled,
        toggleDataSaver,
      }}
    >
      {children}
    </DataModeContext.Provider>
  );
}

export function useDataMode(): DataModeContextType {
  return useContext(DataModeContext);
}
