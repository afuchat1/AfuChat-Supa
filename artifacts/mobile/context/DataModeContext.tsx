import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import {
  getCurrentDataMode,
  getIsWifi,
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
  dataMode: "high",
  isLowData: false,
  isWifi: true,
  dataSaverEnabled: false,
  toggleDataSaver: async () => {},
});

export function DataModeProvider({ children }: { children: React.ReactNode }) {
  const [dataMode, setDataMode] = useState<DataMode>(getCurrentDataMode());
  const [isWifi, setIsWifi] = useState<boolean>(getIsWifi());

  useEffect(() => {
    initDataMode().then(() => {
      setIsWifi(getIsWifi());
      setDataMode(getCurrentDataMode());
    });
    const unsub = subscribeDataMode((mode) => {
      setDataMode(mode);
      setIsWifi(getIsWifi());
    });
    return unsub;
  }, []);

  // Data saver is only relevant on native and only when on cellular (not wifi)
  const dataSaverEnabled = Platform.OS !== "web" && !isWifi && dataMode === "low";

  async function toggleDataSaver(enabled: boolean) {
    if (Platform.OS === "web") return;
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
