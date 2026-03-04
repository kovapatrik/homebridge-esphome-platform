import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';
import { HapClient } from '@homebridge/hap-client';
import { defaultConfig, defaultDeviceConfig } from '../dist/platformUtils.js';
import { discover, Manager } from '@kovapatrik/esphomeapi-manager';

class UiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    this.onRequest('/getDefaults', async () => {
      return { defaultConfig, defaultDeviceConfig };
    });

    this.onRequest('/discoverHapServices', async ({ pin, timeout }) => {
      try {
        const hapClient = new HapClient({
          pin,
          config: { debug: false, discoveryTimeout: timeout },
          logger: this.logger,
        });

        const services = await new Promise((resolve, reject) => {
          // Fallback: if discovery-ended never fires, retrieve whatever is available
          hapClient.on('discovery-ended', async () => {
            clearTimeout(timeout);
            try {
              const allServices = await hapClient.getAllServices();
              resolve(allServices || []);
            } catch (err) {
              reject(err);
            }
          });
        });

        return services;
      } catch (e) {
        const msg = e instanceof Error ? e.stack : String(e);
        throw new RequestError(`HAP service discovery failed:\n${msg}`);
      }
    });

    this.onRequest('/discoverEsphomeDevices', async ({ timeout = 5 } = {}) => {
      try {
        const found = await discover(timeout);
        return found.map(d => ({
          serverName: d.server,
          address: d.addresses?.[0] ?? d.server,
          port: d.port,
        }));
      } catch (e) {
        throw new RequestError(`ESPHome discovery failed: ${e instanceof Error ? e.message : e}`);
      }
    });

    this.onRequest('/getEsphomeEntities', async ({ address, port, psk, password }) => {
      let manager;
      try {
        manager = await Manager.connect({
          address,
          port: port ?? 6053,
          psk: psk || undefined,
          password: password || undefined,
        });
        const info = manager.getDeviceInfo();
        const entities = manager.getEntities().map(e => ({
          key: e.key,
          name: e.name,
          kind: e.kind,
        }));
        return {
          info: { name: info.name, model: info.model, manufacturer: info.manufacturer },
          entities,
        };
      } catch (e) {
        throw new RequestError(`Failed to connect: ${e instanceof Error ? e.message : e}`);
      } finally {
        manager?.disconnect?.();
      }
    });

    this.ready();
  }
}

(() => {
  return new UiServer();
})();
