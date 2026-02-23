import type { Light as LightEntity } from '@kovapatrik/esphomeapi-manager';
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { EsphomePlatform } from '../platform.js';
import type { DeviceConfig } from '../platformUtils.js';

export default class Light {
  service: Service;

  constructor(
    private platform: EsphomePlatform,
    private accessory: PlatformAccessory,
    private config: DeviceConfig,
    private entity: LightEntity,
  ) {
    this.service = this.accessory.getService(platform.Service.Lightbulb) || this.accessory.addService(platform.Service.Lightbulb);

    if (config.mainEntityKey === entity.key) {
      this.service.setPrimaryService(true);
    }

    this.service.getCharacteristic(platform.Characteristic.On).onGet(this.getOn.bind(this)).onSet(this.setOn.bind(this));
    this.service.getCharacteristic(platform.Characteristic.Brightness).onGet(this.getBrightness.bind(this)).onSet(this.setBrightness.bind(this));
    this.service
      .getCharacteristic(platform.Characteristic.ColorTemperature)
      .onGet(this.getColorTemperature.bind(this))
      .onSet(this.setColorTemperature.bind(this))
      .setProps({
        minValue: config.lightConfig.coolWhite,
        maxValue: config.lightConfig.warmWhite,
      });

    // this.service.getCharacteristic(platform.Characteristic.Hue).onGet(this.getHue.bind(this)).onSet(this.setHue.bind(this));
    // this.service.getCharacteristic(platform.Characteristic.Saturation).onGet(this.getSaturation.bind(this)).onSet(this.setSaturation.bind(this));
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

  getBrightness(): CharacteristicValue {
    return this.entity.brightness * 100;
  }

  async setBrightness(value: CharacteristicValue) {
    await this.entity.sendCommand({ brightness: (value as number) / 100 });
  }

  getColorTemperature(): CharacteristicValue {
    return this.entity.colorTemperature;
  }

  async setColorTemperature(value: CharacteristicValue) {
    await this.entity.sendCommand({ colorTemperature: value as number });
  }
}
