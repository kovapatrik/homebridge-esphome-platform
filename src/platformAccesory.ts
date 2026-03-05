import EventEmitter from 'node:events';
import { type HomeAssistantEvent, HomeAssistantEventKind, type Manager } from '@kovapatrik/esphomeapi-manager';
import type { CharacteristicType } from '@homebridge/hap-client';
import type { PlatformAccessory } from 'homebridge';
import EntityFactory from './entity/EntityFactory.js';
import type { EsphomePlatform } from './platform.js';
import type { DeviceConfig } from './platformUtils.js';
import { characteristicUUIDByAttribute, defaultCharacteristicByServiceUUID } from './hapDefaults.js';

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

    const excluded = new Set(deviceConfig.excludedKeys ?? []);
    for (const entity of manager.getEntities()) {
      if (!excluded.has(entity.key)) {
        EntityFactory.createEntity(entity, platform, accessory, deviceConfig);
      }
    }

    this.platform.on('hap-event', this.handleHapEvents.bind(this));
  }

  /** entity_id → attribute (undefined = default characteristic) */
  private readonly subscriptions = new Map<string, string | undefined>();

  private async handleHapEvents(key: string, serviceUUID: string, characteristics: CharacteristicType[]): Promise<void> {
    if (!this.subscriptions.has(key)) return;
    await this._sendState(key, this.subscriptions.get(key), serviceUUID, characteristics);
  }

  private async handleHomeAssistantState(event: HomeAssistantEvent): Promise<void> {
    if (event.eventType === HomeAssistantEventKind.StateSubscription) {
      this.subscriptions.set(event.entityId, event.attribute);
    }

    const current = this.platform.states.get(event.entityId);
    if (current) {
      await this._sendState(event.entityId, event.attribute, current.uuid, current.characteristics);
    }
  }

  private getCharacteristic(attribute: string | undefined, serviceUUID: string, characteristics: CharacteristicType[]): CharacteristicType {
    const uuid = (attribute && characteristicUUIDByAttribute[attribute]) || defaultCharacteristicByServiceUUID[serviceUUID];
    const characteristic = characteristics.find(c => c.uuid === uuid);
    if (characteristic) {
      return characteristic;
    }
    throw new Error(`No characteristic found for attribute ${attribute} and service UUID ${serviceUUID}`);
  }

  private async _sendState(entityId: string, attribute: string | undefined, serviceUUID: string, characteristics: CharacteristicType[]): Promise<void> {
    const characteristic = this.getCharacteristic(attribute, serviceUUID, characteristics);

    if (characteristic?.value === null || characteristic?.value === undefined) return;

    const state = typeof characteristic.value === 'boolean'
      ? (characteristic.value ? 'on' : 'off')
      : String(characteristic.value);

    await this.manager.sendHomeAssistantState(entityId, state, attribute);
  }

  private async subscribeToEvents(): Promise<void> {
    await this.manager.subscribeHomeAssistantStates(this.handleHomeAssistantState.bind(this));
  }

  static async create(platform: EsphomePlatform, accessory: PlatformAccessory, manager: Manager, deviceConfig: DeviceConfig): Promise<EsphomeAccessory> {
    const instance = new EsphomeAccessory(platform, accessory, manager, deviceConfig);
    await instance.subscribeToEvents();
    return instance;
  }
}
