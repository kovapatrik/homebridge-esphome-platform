import EventEmitter from 'node:events';
import type { Light as LightEntity } from '@kovapatrik/esphomeapi-manager';
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { EsphomePlatform } from '../platform.js';
import type { DeviceConfig } from '../platformUtils.js';

export default class Light extends EventEmitter {
  service: Service;

  constructor(
    private platform: EsphomePlatform,
    private accessory: PlatformAccessory,
    private config: DeviceConfig,
    private entity: LightEntity,
  ) {
    super();

    this.service = this.accessory.getService(platform.Service.Lightbulb) || this.accessory.addService(platform.Service.Lightbulb);
    this.service.getCharacteristic(platform.Characteristic.On).onGet(this.getOn.bind(this)).onSet(this.setOn.bind(this));
  }

  getOn(): CharacteristicValue {
    return this.entity.isOn;
  }

  async setOn(value: CharacteristicValue) {
    if (value) {
      return await this.entity.turnOn();
    }
    await this.entity.turnOff();
  }
}
