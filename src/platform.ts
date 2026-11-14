import EventEmitter from 'node:events';
import { HapClient, type ServiceType } from '@homebridge/hap-client';
import type { HapMonitor } from '@homebridge/hap-client/dist/monitor.js';
import { Manager, discover } from '@kovapatrik/esphomeapi-manager';
import type { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import defaultsDeep from 'lodash/defaultsDeep.js';
import EsphomeAccessory from './platformAccesory.js';
import { type Config, type DeviceConfig, defaultConfig, defaultDeviceConfig, getDeviceAddress, normalizeServerName } from './platformUtils.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

export class EsphomePlatform extends EventEmitter implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  public readonly discoveredCacheUUIDs: string[] = [];

  /** Latest known state for each mapped service, keyed by dot-notation key. */
  public readonly states: Map<string, { uuid: string; characteristics: ServiceType['serviceCharacteristics'] }> = new Map();

  private readonly platformConfig: Config;
  private readonly hapClient?: HapClient;
  private hapMonitor?: HapMonitor;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    super();

    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    // Add default config values
    this.platformConfig = defaultsDeep(config, defaultConfig);

    this.log.debug('Finished initializing platform:', this.config.name);

    if (!log.success) {
      log.success = log.info;
    }

    if (this.platformConfig.homebridgeEvents.enabled) {
      this.hapClient = new HapClient({
        pin: this.platformConfig.homebridgeEvents.pin,
        config: { debug: this.platformConfig.verbose, discoveryTimeout: 5000 },
        logger: this.log,
      });
      this.hapClient.on('discovery-ended', () => {
        this.monitorHomebridgeDevices();
      });
    }

    this.api.on('didFinishLaunching', async () => {
      log.debug('Executed didFinishLaunching callback');
      try {
        await this.discoverDevices();
      } catch (e) {
        log.error('Failed to discover devices:', e instanceof Error ? (e.stack ?? e.message) : e);
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    this.accessories.set(accessory.UUID, accessory);
  }

  async monitorHomebridgeDevices() {
    this.hapMonitor = await this.hapClient?.monitorCharacteristics();
    this.hapMonitor?.on('service-update', (update: ServiceType[]) => {
      for (const service of update) {
        if (service.nameBasedUniqueId && service.nameBasedUniqueId in this.platformConfig.homebridgeEvents.serviceMap) {
          const key = this.platformConfig.homebridgeEvents.serviceMap[service.nameBasedUniqueId];
          this.states.set(key, { uuid: service.uuid, characteristics: service.serviceCharacteristics });
          this.log.debug(`Service ${service.nameBasedUniqueId} updated: ${key}`);
          this.emit('hap-event', key, service.uuid, service.serviceCharacteristics);
        }
      }
    });
  }

  /** Keep a configured-but-unreachable device's cached accessory so HomeKit setup isn't lost. */
  private keepCachedAccessory(uuid: string) {
    if (this.accessories.has(uuid) && !this.discoveredCacheUUIDs.includes(uuid)) {
      this.discoveredCacheUUIDs.push(uuid);
    }
  }

  async discoverDevices() {
    let discoveredDevices: Awaited<ReturnType<typeof discover>> = [];
    try {
      discoveredDevices = await discover(5);
    } catch (e) {
      this.log.error('mDNS discovery failed:', e instanceof Error ? e.message : e);
    }

    for (const _device of this.platformConfig.devices) {
      const device = defaultsDeep(_device, defaultDeviceConfig) as DeviceConfig;
      const serverName = normalizeServerName(device.serverName);
      const uuid = this.api.hap.uuid.generate(serverName);

      // A static IP bypasses mDNS entirely, so only require discovery when connecting by hostname.
      if (!device.ip?.trim()) {
        const serviceInfo = discoveredDevices.find((d) => normalizeServerName(d.server) === serverName);
        if (!serviceInfo) {
          this.log.warn(`[${serverName}] Device not found via mDNS discovery.`);
          this.keepCachedAccessory(uuid);
          continue;
        }
      }

      const address = getDeviceAddress(device);

      try {
        const manager = await Manager.connect({
          address,
          port: device.port,
          password: device.password,
          psk: device.psk,
        });

        const existingAccessory = this.accessories.get(uuid);
        if (existingAccessory) {
          // the accessory already exists
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

          await EsphomeAccessory.create(this, existingAccessory, manager, device);
          this.discoveredCacheUUIDs.push(uuid);
          continue;
        }

        this.log.info('Adding new accessory:', device.name);
        const accessory = new this.api.platformAccessory(device.name, uuid);

        await EsphomeAccessory.create(this, accessory, manager, device);

        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.discoveredCacheUUIDs.push(uuid);
      } catch (e) {
        this.log.error(`[${serverName}] Failed to connect to ${address}:${device.port}:`, e instanceof Error ? e.message : e);
        this.keepCachedAccessory(uuid);
      }
    }

    // you can also deal with accessories from the cache which are no longer present by removing them from Homebridge
    // for example, if your plugin logs into a cloud account to retrieve a device list, and a user has previously removed a device
    // from this cloud account, then this device will no longer be present in the device list but will still be in the Homebridge cache
    for (const [uuid, accessory] of this.accessories) {
      if (!this.discoveredCacheUUIDs.includes(uuid)) {
        this.log.info('Removing existing accessory from cache:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}
