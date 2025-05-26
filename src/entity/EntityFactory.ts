import type { Entity, Manager } from '@kovapatrik/esphomeapi-manager';
import type { PlatformAccessory } from 'homebridge';
import type { EsphomePlatform } from '../platform.js';
import type { DeviceConfig } from '../platformUtils.js';
import Switch from './Switch.js';

// biome-ignore lint/complexity/noStaticOnlyClass: static class is used for factory
export default class EntityFactory {
  static createEntity(entity: Entity, manager: Manager, platform: EsphomePlatform, accessory: PlatformAccessory, deviceConfig: DeviceConfig) {
    switch (entity.type) {
      case 'Switch': {
        const switchEntity = manager.getSwitch(entity.field0);
        return new Switch(platform, accessory, deviceConfig, switchEntity);
      }
      default:
        throw new Error('Invalid entity type.');
    }
  }
}
