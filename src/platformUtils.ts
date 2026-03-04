export type Config = {
  verbose: boolean;
  uiDebug: boolean;
  homebridgeEvents: HomebridgeEventsConfig;
  devices: DeviceConfig[];
};

export type HomebridgeEventsConfig = {
  enabled: boolean;
  pin: string;
  serviceMap: HapServiceMapping[];
};

export type HapServiceMapping = {
  key: string;
  uniqueId: string;
  stableId: string;
};

export type DeviceConfig = {
  serverName: string;
  port?: number;
  ip?: string;
  psk?: string;
  password?: string;
  mainEntityKey: number;
  excludedKeys?: number[];
  lightConfig: LightConfig;
};

export type LightConfig = {
  coolWhite?: number;
  warmWhite?: number;
};

export const defaultConfig: Config = {
  verbose: false,
  uiDebug: false,
  homebridgeEvents: {
    enabled: false,
    pin: '031-45-154',
    serviceMap: [],
  },
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
