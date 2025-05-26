export type Config = {
  verbose: boolean;
  uiDebug: boolean;
  devices: DeviceConfig[];
};

export type DeviceConfig = {
  serverName: string;
  ip: string;
  port: number;
  psk?: string;
  password?: string;
  mainEntityKey: number;
};

export const defaultConfig: DeviceConfig = {
  serverName: '',
  ip: '',
  port: 6053,
  mainEntityKey: 0,
};
