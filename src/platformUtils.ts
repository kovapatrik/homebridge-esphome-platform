export type Config = {
  verbose: boolean;
  uiDebug: boolean;
  devices: DeviceConfig[];
};

export type DeviceConfig = {
  serverName: string;
  port?: number;
  ip?: string;
  psk?: string;
  password?: string;
  mainEntityKey: number;
  lightConfig: LightConfig;
};

export type LightConfig = {
  coolWhite?: number;
  warmWhite?: number;
};

export const defaultConfig: Config = {
  verbose: false,
  uiDebug: false,
  devices: [],
};

export const defaultDeviceConfig: DeviceConfig = {
  serverName: '',
  port: 6053,
  mainEntityKey: 0,
  lightConfig: {
    coolWhite: 140,
    warmWhite: 500,
  },
};
