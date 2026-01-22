declare module "get-windows-shortcut-properties" {
  interface ShortcutProperties {
    TargetPath?: string;
    Arguments?: string;
    WorkingDirectory?: string;
    IconLocation?: string;
    Description?: string;
    Hotkey?: string;
    WindowStyle?: number;
  }

  export function sync(filePath: string): ShortcutProperties;
  export function sync(filePaths: string[]): ShortcutProperties[];
}
