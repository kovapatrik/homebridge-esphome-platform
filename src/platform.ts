import { HapClient, ServiceType } from '@homebridge/hap-client';
import type { HapMonitor } from '@homebridge/hap-client/dist/monitor.js';
import { Manager, discover } from '@kovapatrik/esphomeapi-manager';
import type { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import defaultsDeep from 'lodash/defaultsDeep.js';
import EsphomeAccessory from './platformAccesory.js';
import { type Config, defaultConfig, defaultDeviceConfig } from './platformUtils.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import EventEmitter from 'node:events';

export class EsphomePlatform extends EventEmitter implements DynamicPlatformPlugin  {
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
      })
    }

    this.api.on('didFinishLaunching', async () => {
      log.debug('Executed didFinishLaunching callback');
      await this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    this.accessories.set(accessory.UUID, accessory);
  }

  async monitorHomebridgeDevices() {
    this.hapMonitor = await this.hapClient?.monitorCharacteristics();
    this.hapMonitor?.on('service-update', (update: ServiceType[]) => {
      update.forEach((service) => {
        if (service.nameBasedUniqueId && service.nameBasedUniqueId in this.platformConfig.homebridgeEvents.serviceMap) {
          const key = this.platformConfig.homebridgeEvents.serviceMap[service.nameBasedUniqueId];
          this.states.set(key, { uuid: service.uuid, characteristics: service.serviceCharacteristics });
          this.log.debug(`Service ${service.nameBasedUniqueId} updated: ${key}`);
          this.emit('hap-event', key, service.uuid, service.serviceCharacteristics);
        }
      });
    });
  }

  async discoverDevices() {
    const discoveredDevices = await discover(5);

    for (const _device of this.platformConfig.devices) {
      const device = defaultsDeep(_device, defaultDeviceConfig);

      const serviceInfo = discoveredDevices.find((d) => d.server === device.serverName);
      if (!serviceInfo) {
        this.log.debug(`[${device.serverName}] Device not found.`);
        continue;
      }

      const uuid = this.api.hap.uuid.generate(device.serverName);

      const manager = await Manager.connect({
        address: device.serverName,
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

      this.log.info('Adding new accessory:', device.serverName);
      const accessory = new this.api.platformAccessory(device.serverName, uuid);

      await EsphomeAccessory.create(this, accessory, manager, device);

      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.discoveredCacheUUIDs.push(uuid);
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
