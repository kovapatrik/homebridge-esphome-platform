import EventEmitter from 'node:events';
import type { Switch as SwitchEntity } from '@kovapatrik/esphomeapi-manager';
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { EsphomePlatform } from '../platform.js';
import type { DeviceConfig } from '../platformUtils.js';

export default class Switch extends EventEmitter {
  service: Service;

  constructor(
    private platform: EsphomePlatform,
    private accessory: PlatformAccessory,
    private config: DeviceConfig,
    private entity: SwitchEntity,
  ) {
    super();

    this.service = this.accessory.getService(platform.Service.Switch) || this.accessory.addService(platform.Service.Switch);
    this.service.getCharacteristic(platform.Characteristic.On).onGet(this.getOn.bind(this)).onSet(this.setOn.bind(this));
  }

  getOn(): CharacteristicValue {
    return this.entity.isOn;
  }

  async setOn(value: CharacteristicValue) {
    await this.entity.setState(!!value);
  }
}
