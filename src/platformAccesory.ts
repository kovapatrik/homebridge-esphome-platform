import type { Manager } from '@kovapatrik/esphomeapi-manager';
import type { PlatformAccessory } from 'homebridge';
import EntityFactory from './entity/EntityFactory.js';
import type { EsphomePlatform } from './platform.js';
import type { DeviceConfig } from './platformUtils.js';

export default class EsphomeAccessory {
  constructor(
    private readonly platform: EsphomePlatform,
    private readonly accessory: PlatformAccessory,
    private manager: Manager,
    private readonly deviceConfig: DeviceConfig,
  ) {
    const entities = manager.getEntities();
    // Find the main entity
    const mainEntity = entities.find((e) => e.field0 === deviceConfig.mainEntityKey);
    if (!mainEntity) {
      throw new Error('Main entity not found!');
    }

    // create the main entity first
    EntityFactory.createEntity(mainEntity, manager, platform, accessory, deviceConfig);

    // create every other entity
    for (const entity of entities.filter((e) => e.field0 !== mainEntity.field0)) {
      EntityFactory.createEntity(entity, manager, platform, accessory, deviceConfig);
    }
  }
}
