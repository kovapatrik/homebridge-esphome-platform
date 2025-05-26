import { Manager, discover } from '@kovapatrik/esphomeapi-manager';
import type { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import lodash from 'lodash';
import EsphomeAccessory from './platformAccesory.js';
import { type Config, defaultConfig } from './platformUtils.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
const { defaultsDeep } = lodash;

export class EsphomePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  public readonly discoveredCacheUUIDs: string[] = [];

  private readonly platformConfig: Config;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    // Add default config values
    this.platformConfig = defaultsDeep(config, defaultConfig);

    this.log.debug('Finished initializing platform:', this.config.name);

    if (!log.success) {
      log.success = log.info;
    }

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    this.accessories.set(accessory.UUID, accessory);
  }

  async discoverDevices() {
    const discoveredDevices = await discover(5);

    for (const device of this.platformConfig.devices) {
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

        new EsphomeAccessory(this, existingAccessory, manager, device);
        this.discoveredCacheUUIDs.push(uuid);
        continue;
      }

      this.log.info('Adding new accessory:', device.serverName);
      const accessory = new this.api.platformAccessory(device.serverName, uuid);

      new EsphomeAccessory(this, accessory, manager, device);

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
