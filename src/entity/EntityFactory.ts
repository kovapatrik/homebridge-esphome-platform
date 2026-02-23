import { type Entity, EntityKind } from '@kovapatrik/esphomeapi-manager';
import type { PlatformAccessory } from 'homebridge';
import type { EsphomePlatform } from '../platform.js';
import type { DeviceConfig } from '../platformUtils.js';

import Light from './Light.js';
import Switch from './Switch.js';

// biome-ignore lint/complexity/noStaticOnlyClass: static class is used for factory
export default class EntityFactory {
  static createEntity(entity: Entity, platform: EsphomePlatform, accessory: PlatformAccessory, deviceConfig: DeviceConfig) {
    switch (entity.kind) {
      case EntityKind.Light: {
        return new Light(platform, accessory, deviceConfig, entity);
      }
      case EntityKind.Switch: {
        return new Switch(platform, accessory, deviceConfig, entity);
      }
      default:
        throw new Error('Invalid entity type.');
    }
  }
}
