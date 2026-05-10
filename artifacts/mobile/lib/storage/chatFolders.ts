import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "chat_folders_v1";

export type FolderFilter = "personal" | "groups" | "channels" | "unread";

export type ChatFolder = {
  id: string;
  name: string;
  icon: string;
  filter: FolderFilter;
  createdAt: number;
};

export async function loadFolders(): Promise<ChatFolder[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ChatFolder[]) : [];
  } catch {
    return [];
  }
}

export async function saveFolders(folders: ChatFolder[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(folders));
}

export async function createFolder(
  data: Omit<ChatFolder, "id" | "createdAt">,
): Promise<ChatFolder> {
  const folder: ChatFolder = {
    ...data,
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    createdAt: Date.now(),
  };
  const existing = await loadFolders();
  await saveFolders([...existing, folder]);
  return folder;
}

export async function updateFolder(
  id: string,
  updates: Partial<Pick<ChatFolder, "name" | "icon" | "filter">>,
): Promise<void> {
  const folders = await loadFolders();
  await saveFolders(folders.map((f) => (f.id === id ? { ...f, ...updates } : f)));
}

export async function deleteFolder(id: string): Promise<void> {
  const folders = await loadFolders();
  await saveFolders(folders.filter((f) => f.id !== id));
}
