export type Config = {
  verbose: boolean;
  uiDebug: boolean;
  devices: DeviceConfig[];
};

export type DeviceConfig = {
  name: string;
  apiKey: string;
};