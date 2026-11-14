import { isIP } from 'node:net';

export type Config = {
  verbose: boolean;
  uiDebug: boolean;
  homebridgeEvents: HomebridgeEventsConfig;
  devices: DeviceConfig[];
};

export type HomebridgeEventsConfig = {
  enabled: boolean;
  pin: string;
  serviceMap: Record<string, string>;
};

export type DeviceConfig = {
  name: string;
  serverName: string;
  port: number;
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
    serviceMap: {},
  },
  devices: [],
};

export const defaultDeviceConfig: DeviceConfig = {
  name: '',
  serverName: '',
  port: 6053,
  mainEntityKey: 0,
  lightConfig: {
    coolWhite: 140,
    warmWhite: 500,
  },
};

/**
 * Normalise an ESPHome server name to its bare hostname, e.g.
 * `bed-sensor.local.` / `bed-sensor.local` / `bed-sensor` -> `bed-sensor`.
 * Discovery reports names without the `.local` suffix, so this keeps comparisons consistent.
 */
export function normalizeServerName(serverName: string): string {
  return serverName
    .trim()
    .replace(/\.+$/, '')
    .replace(/\.local$/i, '');
}

/**
 * Turn a host (mDNS name, FQDN or IP) into something the OS resolver can connect to.
 * Bare hostnames get the `.local` suffix, because most Linux resolvers (nss-mdns) only
 * resolve mDNS names ending in `.local`.
 */
export function toConnectAddress(host: string): string {
  const name = normalizeServerName(host);
  if (isIP(name) || name.includes('.')) {
    return name;
  }
  return `${name}.local`;
}

/** Address to connect to for a device: the static IP if set, otherwise its mDNS name. */
export function getDeviceAddress(device: Pick<DeviceConfig, 'serverName' | 'ip'>): string {
  const ip = device.ip?.trim();
  return ip ? ip : toConnectAddress(device.serverName);
}
