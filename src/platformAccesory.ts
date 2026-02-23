import EventEmitter from 'node:events';
import { type HomeAssistantEvent, HomeAssistantEventKind, type Manager } from '@kovapatrik/esphomeapi-manager';
import type { PlatformAccessory } from 'homebridge';
import EntityFactory from './entity/EntityFactory.js';
import type { EsphomePlatform } from './platform.js';
import type { DeviceConfig } from './platformUtils.js';

export default class EsphomeAccessory extends EventEmitter {
  private constructor(
    private readonly platform: EsphomePlatform,
    private readonly accessory: PlatformAccessory,
    private manager: Manager,
    private readonly deviceConfig: DeviceConfig,
  ) {
    super();

    const deviceInfo = manager.getDeviceInfo();

    // biome-ignore lint/style/noNonNullAssertion: by design, AccessoryInformation service is always present
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, deviceInfo.manufacturer)
      .setCharacteristic(this.platform.Characteristic.Model, deviceInfo.model);

    const entities = manager.getEntities();

    for (const entity of entities) {
      EntityFactory.createEntity(entity, platform, accessory, deviceConfig);
    }
  }

  private async handleHomeAssistantState(state: HomeAssistantEvent) {
    if (state.eventType === HomeAssistantEventKind.StateSubscription) {
    }
  }

  private async subscribeToEvents(): Promise<void> {
    await this.manager.subscribeHomeAssistantStates(this.handleHomeAssistantState.bind(this));
  }

  static async create(platform: EsphomePlatform, accessory: PlatformAccessory, manager: Manager, deviceConfig: DeviceConfig): Promise<EsphomeAccessory> {
    const instance = new EsphomeAccessory(platform, accessory, manager, deviceConfig);
    return instance;
  }
}
