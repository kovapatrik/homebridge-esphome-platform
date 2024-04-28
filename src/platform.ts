import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

// import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

import { Discovery } from '@2colors/esphome-native-api';

export class EsphomePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
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

    this.accessories.push(accessory);
  }

  discoverDevices() {

    const discovery = new Discovery({});

    discovery.on('info', (device) => {
      this.log.info('Discovered device:', device.name);

      // const client = new Client({ host: device.host });
      // this.addDevice(client);
    });
  }

  // addDevice(client: Client) {

  //   const uuid = this.api.hap.uuid.generate(device);
  //   const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

  //   if (existingAccessory) {
  //     // the accessory already exists
  //     this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

  //     // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. e.g.:
  //     // existingAccessory.context.device = device;
  //     // this.api.updatePlatformAccessories([existingAccessory]);

  //     // create the accessory handler for the restored accessory
  //     // this is imported from `platformAccessory.ts`
  //     new ExamplePlatformAccessory(this, existingAccessory);

  //     // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, e.g.:
  //     // remove platform accessories when no longer present
  //     // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
  //     // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
  //   } else {
  //     // the accessory does not yet exist, so we need to create it
  //     this.log.info('Adding new accessory:', device.exampleDisplayName);

  //     // create a new accessory
  //     const accessory = new this.api.platformAccessory(device.exampleDisplayName, uuid);

  //     // store a copy of the device object in the `accessory.context`
  //     // the `context` property can be used to store any data about the accessory you may need
  //     accessory.context.device = device;

  //     // create the accessory handler for the newly create accessory
  //     // this is imported from `platformAccessory.ts`
  //     new ExamplePlatformAccessory(this, accessory);

  //     // link the accessory to your platform
  //     this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
  //   }
  // }
}
