import React, { createContext, useContext, useState } from "react";

type DetailView =
  | { type: "chat"; id: string }
  | { type: "post"; id: string }
  | { type: "contact"; id: string }
  | null;

type DesktopDetailContextType = {
  detail: DetailView;
  openDetail: (view: DetailView) => void;
  closeDetail: () => void;
};

const DesktopDetailContext = createContext<DesktopDetailContextType>({
  detail: null,
  openDetail: () => {},
  closeDetail: () => {},
});

export function DesktopDetailProvider({ children }: { children: React.ReactNode }) {
  const [detail, setDetail] = useState<DetailView>(null);

  const openDetail = (view: DetailView) => setDetail(view);
  const closeDetail = () => setDetail(null);

  return (
    <DesktopDetailContext.Provider value={{ detail, openDetail, closeDetail }}>
      {children}
    </DesktopDetailContext.Provider>
  );
}

export function useDesktopDetail() {
  return useContext(DesktopDetailContext);
}
